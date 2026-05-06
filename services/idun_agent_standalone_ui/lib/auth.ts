import { jwtDecode } from "jwt-decode";
import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";

export type SsoInfo =
  | { enabled: false }
  | {
      enabled: true;
      issuer: string;
      clientId: string;
      audience: string | null;
    };

export type AuthUser = {
  email?: string;
  name?: string;
  picture?: string;
  expiresAt?: number;
};

const MANUAL_TOKEN_KEY = "idun_token";
const EXPIRY_SKEW_SECONDS = 30;

let _ssoInfo: SsoInfo | null = null;
let _userManager: UserManager | null = null;

export function isGoogleIssuer(issuer: string): boolean {
  try {
    return new URL(issuer).host === "accounts.google.com";
  } catch {
    return false;
  }
}

export function getManualToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(MANUAL_TOKEN_KEY);
}

export function setManualToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MANUAL_TOKEN_KEY, token);
}

export function clearManualToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(MANUAL_TOKEN_KEY);
}

function manualTokenToAuthUser(token: string): AuthUser | null {
  try {
    const claims = jwtDecode<{
      email?: string;
      name?: string;
      picture?: string;
      exp?: number;
    }>(token);
    if (typeof claims.exp === "number") {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (claims.exp <= nowSeconds + EXPIRY_SKEW_SECONDS) return null;
    }
    return {
      email: claims.email,
      name: claims.name,
      picture: claims.picture,
      expiresAt: claims.exp,
    };
  } catch {
    return null;
  }
}

export async function fetchSsoInfo(force = false): Promise<SsoInfo> {
  if (_ssoInfo && !force) return _ssoInfo;
  const res = await fetch("/sso/info", { cache: "no-store" });
  if (!res.ok) throw new Error(`sso/info: ${res.status}`);
  _ssoInfo = (await res.json()) as SsoInfo;
  return _ssoInfo;
}

function buildUserManager(info: Extract<SsoInfo, { enabled: true }>): UserManager {
  const redirectUri =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/auth/callback`;
  const um = new UserManager({
    authority: info.issuer,
    client_id: info.clientId,
    redirect_uri: redirectUri,
    post_logout_redirect_uri:
      typeof window === "undefined" ? "" : window.location.origin,
    response_type: "code",
    scope: "openid email profile",
    automaticSilentRenew: false,
    loadUserInfo: false,
    userStore: new WebStorageStateStore({
      store: typeof window === "undefined" ? undefined : window.localStorage,
    }),
  });
  um.events.addAccessTokenExpired(() => {
    void um.signinRedirect();
  });
  um.events.addSilentRenewError(() => {
    void um.signinRedirect();
  });
  return um;
}

export async function getUserManager(): Promise<UserManager | null> {
  if (_userManager) return _userManager;
  const info = await fetchSsoInfo();
  if (!info.enabled) return null;
  _userManager = buildUserManager(info);
  return _userManager;
}

function toAuthUser(u: User | null): AuthUser | null {
  if (!u) return null;
  const profile = (u.profile ?? {}) as Record<string, unknown>;
  return {
    email: typeof profile.email === "string" ? profile.email : undefined,
    name: typeof profile.name === "string" ? profile.name : undefined,
    picture:
      typeof profile.picture === "string" ? profile.picture : undefined,
    expiresAt: u.expires_at,
  };
}

export async function getCurrentAuthUser(): Promise<AuthUser | null> {
  const manual = getManualToken();
  if (manual) {
    const user = manualTokenToAuthUser(manual);
    if (user) return user;
    clearManualToken();
  }
  const um = await getUserManager();
  if (!um) return null;
  return toAuthUser(await um.getUser());
}

export async function signIn(): Promise<void> {
  const um = await getUserManager();
  if (!um) throw new Error("SSO is not configured");
  await um.signinRedirect();
}

export async function signOut(): Promise<void> {
  clearManualToken();
  const um = await getUserManager();
  if (!um) return;
  await um.removeUser();
}

export async function refreshSsoConfig(): Promise<void> {
  await fetchSsoInfo(true);
  _userManager = null;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const manual = getManualToken();
  if (manual) return { Authorization: `Bearer ${manual}` };
  const um = await getUserManager();
  if (!um) return {};
  const user = await um.getUser();
  return user?.id_token ? { Authorization: `Bearer ${user.id_token}` } : {};
}

export function authHeadersSyncFromUser(
  user: User | null,
): Record<string, string> {
  return user?.id_token ? { Authorization: `Bearer ${user.id_token}` } : {};
}
