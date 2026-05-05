"""Set-Cookie parsing helper for assertion tests."""

from __future__ import annotations

from http.cookies import SimpleCookie

import httpx


def parsed_set_cookie(response: httpx.Response, name: str) -> dict[str, object]:
    """Return parsed attributes for the first Set-Cookie matching name."""
    headers = response.headers.get_list("set-cookie")
    for raw in headers:
        jar = SimpleCookie()
        jar.load(raw)
        morsel = jar.get(name)
        if morsel is None:
            continue
        max_age_raw = morsel["max-age"]
        max_age = int(max_age_raw) if max_age_raw != "" else None
        samesite_raw = morsel["samesite"]
        samesite = samesite_raw.lower() if samesite_raw else None
        path_raw = morsel["path"]
        path = path_raw if path_raw else None
        return {
            "value": morsel.value,
            "httponly": bool(morsel["httponly"]),
            "samesite": samesite,
            "secure": bool(morsel["secure"]),
            "max_age": max_age,
            "path": path,
        }
    raise AssertionError(f"Set-Cookie for {name!r} not present")
