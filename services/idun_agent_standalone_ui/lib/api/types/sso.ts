export type SSOConfig = {
  enabled: boolean;
  issuer: string;
  clientId: string;
  audience?: string | null;
  allowedDomains?: string[] | null;
  allowedEmails?: string[] | null;
};

export type SSORead = {
  sso: SSOConfig;
  updatedAt: string;
};

export type SSOPatch = {
  sso: SSOConfig;
};
