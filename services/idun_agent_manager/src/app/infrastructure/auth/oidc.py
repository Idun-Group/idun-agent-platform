"""Generic OIDC provider with discovery and JWKS verification."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Optional

import httpx
import jwt
from fastapi import HTTPException, status

from app.core.settings import get_settings


class JWKSCache:
    def __init__(self) -> None:
        self._keys_by_issuer: dict[str, dict[str, Any]] = {}
        self._expires_at: dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def get(self, issuer: str, ttl: int) -> dict[str, Any] | None:
        async with self._lock:
            now = time.time()
            if issuer in self._keys_by_issuer and now < self._expires_at.get(issuer, 0):
                return self._keys_by_issuer[issuer]
            return None

    async def set(self, issuer: str, keys: dict[str, Any], ttl: int) -> None:
        async with self._lock:
            self._keys_by_issuer[issuer] = keys
            self._expires_at[issuer] = time.time() + ttl


_jwks_cache = JWKSCache()


class GenericOIDCProvider:
    def __init__(self, issuer: str, client_id: str, audience: Optional[str], allowed_algs: List[str], jwks_ttl: int, clock_skew_seconds: int, claim_mapping: dict[str, Any]) -> None:
        self.issuer = issuer.rstrip("/")
        self.client_id = client_id
        self.audience = audience
        self.allowed_algs = allowed_algs
        self.jwks_ttl = jwks_ttl
        self.clock_skew = clock_skew_seconds
        self.claim_mapping = claim_mapping
        self._metadata: dict[str, Any] | None = None

    async def _discover(self) -> dict[str, Any]:
        if self._metadata:
            return self._metadata
        url = f"{self.issuer}/.well-known/openid-configuration"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            self._metadata = resp.json()
            return self._metadata

    async def _get_jwks(self) -> dict[str, Any]:
        cached = await _jwks_cache.get(self.issuer, self.jwks_ttl)
        if cached:
            return cached
        meta = await self._discover()
        jwks_uri = meta.get("jwks_uri")
        if not jwks_uri:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="OIDC metadata missing jwks_uri")
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(jwks_uri)
            resp.raise_for_status()
            keys = resp.json()
            await _jwks_cache.set(self.issuer, keys, self.jwks_ttl)
            return keys

    async def get_authorization_url(self, state: str, redirect_uri: str, scopes: List[str], code_challenge: Optional[str] = None, code_challenge_method: str = "S256") -> str:
        meta = await self._discover()
        auth_endpoint = meta.get("authorization_endpoint")
        if not auth_endpoint:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="OIDC metadata missing authorization_endpoint")
        from urllib.parse import urlencode
        query: dict[str, Any] = {
            "client_id": self.client_id,
            "response_type": "code",
            "scope": " ".join(scopes),
            "redirect_uri": redirect_uri,
            "state": state,
        }
        if code_challenge:
            query["code_challenge"] = code_challenge
            query["code_challenge_method"] = code_challenge_method
        return f"{auth_endpoint}?{urlencode(query)}"

    async def exchange_code_for_token(self, code: str, redirect_uri: str, code_verifier: Optional[str] = None) -> dict[str, Any]:
        meta = await self._discover()
        token_endpoint = meta.get("token_endpoint")
        if not token_endpoint:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="OIDC metadata missing token_endpoint")
        async with httpx.AsyncClient(timeout=15) as client:
            data: dict[str, Any] = {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": self.client_id,
                "client_secret": get_settings().auth.client_secret,
            }
            if code_verifier:
                data["code_verifier"] = code_verifier
            resp = await client.post(
                token_endpoint,
                data=data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            return resp.json()

    async def verify_jwt(self, token: str) -> dict[str, Any]:
        jwks = await self._get_jwks()
        try:
            unverified = jwt.get_unverified_header(token)
        except Exception:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token header")
        kid = unverified.get("kid")
        if not kid:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing kid in token")
        key = self._select_key(jwks, kid)
        if not key:
            # Refresh JWKS once on cache miss
            await _jwks_cache.set(self.issuer, {}, 0)
            jwks = await self._get_jwks()
            key = self._select_key(jwks, kid)
            if not key:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Signing key not found")
        try:
            claims = jwt.decode(
                token,
                key=jwt.algorithms.RSAAlgorithm.from_jwk(key),
                algorithms=self.allowed_algs,
                audience=(self.audience or self.client_id or None),
                issuer=self.issuer,
                leeway=self.clock_skew,
            )
            return claims
        except Exception:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    def _select_key(self, jwks: dict[str, Any], kid: str) -> Optional[str]:
        for k in jwks.get("keys", []):
            if k.get("kid") == kid:
                return jwt.api_jwk.dumps(k)
        return None

    def normalize_claims(self, claims: dict[str, Any]) -> dict[str, Any]:
        def read_path(obj: dict[str, Any], path: List[str]) -> Any:
            cur: Any = obj
            for p in path:
                if not isinstance(cur, dict) or p not in cur:
                    return None
                cur = cur[p]
            return cur

        mapping = self.claim_mapping
        user_id = None
        email = None
        roles: List[str] = []
        groups: List[str] = []
        workspaces: List[str] = []

        for path in mapping.get("user_id_paths", [["sub"]]):
            val = read_path(claims, path)
            if val:
                user_id = str(val)
                break

        for path in mapping.get("email_paths", [["email"], ["preferred_username"]]):
            val = read_path(claims, path)
            if val:
                email = str(val)
                break

        for path in mapping.get("roles_paths", [["roles"], ["realm_access", "roles"]]):
            val = read_path(claims, path)
            if isinstance(val, list):
                roles = [str(x) for x in val]
                break

        for path in mapping.get("groups_paths", [["groups"]]):
            val = read_path(claims, path)
            if isinstance(val, list):
                groups = [str(x) for x in val]
                break

        for path in mapping.get("workspace_ids_paths", []):
            val = read_path(claims, path)
            if isinstance(val, list):
                workspaces = [str(x) for x in val]
                break

        normalized = {
            "user_id": user_id,
            "email": email,
            "roles": roles,
            "groups": groups,
            "workspace_ids": workspaces,
        }
        return normalized


_provider: Optional[GenericOIDCProvider] = None


def _default_claim_mapping(provider_type: str) -> dict[str, Any]:
    if provider_type == "auth0":
        return {
            "user_id_paths": [["sub"]],
            "email_paths": [["email"]],
            # Auth0 often uses namespaced custom claims for roles
            "roles_paths": [["https://idun.ai/roles"], ["roles"], ["permissions"]],
            "groups_paths": [["https://idun.ai/groups"], ["groups"]],
        }
    if provider_type == "okta":
        return {
            "user_id_paths": [["sub"]],
            "email_paths": [["email"]],
            "roles_paths": [["groups"]],
            "groups_paths": [["groups"]],
        }
    if provider_type == "entra":
        return {
            "user_id_paths": [["oid"], ["sub"]],
            "email_paths": [["preferred_username"], ["email"]],
            "roles_paths": [["roles"], ["groups"]],
            "groups_paths": [["groups"]],
        }
    if provider_type == "google":
        return {
            "user_id_paths": [["sub"]],
            "email_paths": [["email"]],
            "roles_paths": [["roles"]],
            "groups_paths": [["groups"]],
        }
    return {"user_id_paths": [["sub"]], "email_paths": [["email"]]}


def get_provider() -> GenericOIDCProvider:
    global _provider
    if _provider is not None:
        return _provider
    settings = get_settings().auth
    claim_mapping = _default_claim_mapping(settings.provider_type)
    # apply overrides
    if settings.claim_user_id_path:
        claim_mapping["user_id_paths"] = [settings.claim_user_id_path]
    if settings.claim_email_path:
        claim_mapping["email_paths"] = [settings.claim_email_path]
    if settings.claim_roles_paths:
        claim_mapping["roles_paths"] = settings.claim_roles_paths
    if settings.claim_groups_paths:
        claim_mapping["groups_paths"] = settings.claim_groups_paths
    if settings.claim_workspace_ids_paths:
        claim_mapping["workspace_ids_paths"] = settings.claim_workspace_ids_paths

    _provider = GenericOIDCProvider(
        issuer=settings.issuer,
        client_id=settings.client_id,
        audience=settings.audience or (settings.expected_audiences[0] if settings.expected_audiences else None),
        allowed_algs=settings.allowed_algs,
        jwks_ttl=settings.jwks_cache_ttl,
        clock_skew_seconds=settings.clock_skew_seconds,
        claim_mapping=claim_mapping,
    )
    return _provider


