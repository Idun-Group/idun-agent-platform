"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ProviderPicker } from "@/components/admin/ProviderPicker";
import {
  GoogleIdentityIcon,
  MicrosoftEntraIcon,
  OktaIcon,
} from "@/components/admin/provider-icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";
import type { SSOConfig } from "@/lib/api";

type Provider = "GOOGLE" | "MICROSOFT" | "OKTA" | "CUSTOM";

const PROVIDERS: {
  id: Provider;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "GOOGLE",
    label: "Google",
    description: "Sign in with a Google Workspace or consumer Google account.",
    icon: <GoogleIdentityIcon size={44} />,
  },
  {
    id: "MICROSOFT",
    label: "Microsoft Entra ID",
    description: "Azure AD / Entra. Tenant-scoped issuer.",
    icon: <MicrosoftEntraIcon size={44} />,
  },
  {
    id: "OKTA",
    label: "Okta",
    description: "Okta workforce identity. Default authorization server.",
    icon: <OktaIcon size={44} />,
  },
  {
    id: "CUSTOM",
    label: "Custom OIDC",
    description: "Any OIDC issuer. Provide the URL and client ID directly.",
    icon: <Globe size={36} className="text-muted-foreground" />,
  },
];

const GOOGLE_ISSUER = "https://accounts.google.com";
const MICROSOFT_ISSUER = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/v2.0`;
const OKTA_ISSUER = (subdomain: string) =>
  `https://${subdomain}.okta.com/oauth2/default`;

const formSchema = z.object({
  enabled: z.boolean(),
  client_id: z.string().min(1, "Required"),
  // Microsoft
  tenant_id: z.string().optional().default(""),
  // Okta
  okta_subdomain: z.string().optional().default(""),
  // Custom
  issuer: z.string().optional().default(""),
  // Common
  audience: z.string().optional().default(""),
  allowed_domains: z.string().optional().default(""),
  allowed_emails: z.string().optional().default(""),
});

type FormValues = z.infer<typeof formSchema>;

function readSso(raw: unknown): SSOConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const issuer = typeof obj.issuer === "string" ? obj.issuer : "";
  const clientId =
    typeof obj.clientId === "string"
      ? obj.clientId
      : typeof obj.client_id === "string"
        ? (obj.client_id as string)
        : "";
  if (!issuer || !clientId) return null;
  return {
    enabled: obj.enabled === undefined ? true : Boolean(obj.enabled),
    issuer,
    clientId,
    audience: (obj.audience as string | null | undefined) ?? null,
    allowedDomains:
      (obj.allowedDomains as string[] | null | undefined) ??
      (obj.allowed_domains as string[] | null | undefined) ??
      null,
    allowedEmails:
      (obj.allowedEmails as string[] | null | undefined) ??
      (obj.allowed_emails as string[] | null | undefined) ??
      null,
  };
}

function detectProvider(cfg: SSOConfig | null): Provider {
  if (!cfg) return "GOOGLE";
  if (cfg.issuer === GOOGLE_ISSUER) return "GOOGLE";
  if (cfg.issuer.startsWith("https://login.microsoftonline.com/"))
    return "MICROSOFT";
  if (/^https:\/\/[^/]+\.okta\.com\/oauth2\/default$/.test(cfg.issuer))
    return "OKTA";
  return "CUSTOM";
}

function tenantFromMicrosoftIssuer(issuer: string): string {
  const match = issuer.match(/^https:\/\/login\.microsoftonline\.com\/([^/]+)/);
  return match ? match[1] : "";
}

function subdomainFromOktaIssuer(issuer: string): string {
  const match = issuer.match(/^https:\/\/([^.]+)\.okta\.com\/oauth2\/default$/);
  return match ? match[1] : "";
}

function emptyValues(): FormValues {
  return {
    enabled: true,
    client_id: "",
    tenant_id: "",
    okta_subdomain: "",
    issuer: "",
    audience: "",
    allowed_domains: "",
    allowed_emails: "",
  };
}

function configToValues(provider: Provider, cfg: SSOConfig | null): FormValues {
  const base = emptyValues();
  if (!cfg) return base;
  base.enabled = cfg.enabled;
  base.client_id = cfg.clientId;
  base.audience = cfg.audience ?? "";
  base.allowed_domains = (cfg.allowedDomains ?? []).join(", ");
  base.allowed_emails = (cfg.allowedEmails ?? []).join(", ");
  if (provider === "MICROSOFT") {
    base.tenant_id = tenantFromMicrosoftIssuer(cfg.issuer);
  } else if (provider === "OKTA") {
    base.okta_subdomain = subdomainFromOktaIssuer(cfg.issuer);
  } else if (provider === "CUSTOM") {
    base.issuer = cfg.issuer;
  }
  return base;
}

function parseList(raw: string): string[] | null {
  const parts = raw
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

function valuesToConfig(provider: Provider, v: FormValues): SSOConfig | null {
  let issuer: string;
  if (provider === "GOOGLE") {
    issuer = GOOGLE_ISSUER;
  } else if (provider === "MICROSOFT") {
    if (!v.tenant_id?.trim()) return null;
    issuer = MICROSOFT_ISSUER(v.tenant_id.trim());
  } else if (provider === "OKTA") {
    if (!v.okta_subdomain?.trim()) return null;
    issuer = OKTA_ISSUER(v.okta_subdomain.trim());
  } else {
    if (!v.issuer?.trim()) return null;
    issuer = v.issuer.trim();
  }
  return {
    enabled: v.enabled,
    issuer,
    clientId: v.client_id.trim(),
    audience: v.audience.trim() || null,
    allowedDomains: parseList(v.allowed_domains ?? ""),
    allowedEmails: parseList(v.allowed_emails ?? ""),
  };
}

export default function SsoPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["sso"],
    queryFn: api.getSso,
  });

  const initial = useMemo(() => readSso(data?.sso), [data]);
  const [provider, setProvider] = useState<Provider>(detectProvider(initial));
  const [restartRequired, setRestartRequired] = useState(false);

  useEffect(() => {
    setProvider(detectProvider(initial));
  }, [initial]);

  const initialValues = useMemo(
    () => configToValues(detectProvider(initial), initial),
    [initial],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues,
    values: initialValues,
  });

  const save = useMutation({
    mutationFn: (next: SSOConfig) => api.patchSso({ sso: next }),
    onSuccess: (resp) => {
      if (resp.reload.status === "restart_required") {
        setRestartRequired(true);
        toast.warning(resp.reload.message);
      } else if (resp.reload.status === "reload_failed") {
        setRestartRequired(false);
        toast.error(resp.reload.error ?? resp.reload.message);
      } else {
        setRestartRequired(false);
        toast.success(resp.reload.message);
      }
      qc.invalidateQueries({ queryKey: ["sso"] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { error?: { message?: string } } | undefined)
        ?.error?.message;
      toast.error(message ?? "Save failed");
    },
  });

  const remove = useMutation({
    mutationFn: api.deleteSso,
    onSuccess: (resp) => {
      if (resp.reload.status === "restart_required") {
        setRestartRequired(true);
        toast.warning(resp.reload.message);
      } else {
        setRestartRequired(false);
        toast.success(resp.reload.message);
      }
      qc.invalidateQueries({ queryKey: ["sso"] });
    },
    onError: (e) => {
      const detail = e instanceof ApiError ? e.detail : undefined;
      const message = (detail as { error?: { message?: string } } | undefined)
        ?.error?.message;
      toast.error(message ?? "Delete failed");
    },
  });

  const handleProviderChange = (next: Provider) => {
    setProvider(next);
    if (next === detectProvider(initial)) {
      form.reset(initialValues);
    } else {
      const cleared = emptyValues();
      cleared.enabled = true;
      form.reset(cleared);
    }
  };

  const handleSubmit = (values: FormValues) => {
    const config = valuesToConfig(provider, values);
    if (!config) {
      if (provider === "MICROSOFT") {
        form.setError("tenant_id", { message: "Tenant ID required" });
      } else if (provider === "OKTA") {
        form.setError("okta_subdomain", { message: "Okta subdomain required" });
      } else if (provider === "CUSTOM") {
        form.setError("issuer", { message: "Issuer URL required" });
      }
      return;
    }
    save.mutate(config);
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          SSO
        </h1>
        <p className="text-sm text-muted-foreground">
          OIDC sign-in for the running agent. When enabled, requests to{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">/agent/*</code>{" "}
          must carry a valid JWT issued by your provider.
        </p>
      </header>

      {restartRequired && (
        <Alert variant="destructive">
          <RotateCcw />
          <AlertTitle>Restart required</AlertTitle>
          <AlertDescription>
            Structural change detected — restart required to apply.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Provider</CardTitle>
              <CardDescription>
                Pick a provider; the issuer URL is filled in for you. Switch to
                Custom for any other OIDC source.
              </CardDescription>
            </div>
            {initial && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Disable
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disable SSO?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes the SSO config entirely. Agent routes will
                      stop requiring JWTs. You can re-add the provider any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => remove.mutate()}>
                      Disable
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <ProviderPicker
            value={provider}
            onChange={(t) => handleProviderChange(t as Provider)}
            options={PROVIDERS}
            columns={2}
          />

          <Form {...form}>
            <form
              id={`sso-form-${provider}`}
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="enabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Enforce</FormLabel>
                      <FormDescription>
                        Toggle to start or stop validating JWTs on agent
                        requests.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {provider === "MICROSOFT" && (
                <FormField
                  control={form.control}
                  name="tenant_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tenant ID</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="00000000-0000-0000-0000-000000000000"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Azure AD / Entra tenant. The issuer becomes{" "}
                        <code className="text-xs">
                          https://login.microsoftonline.com/&lt;tenant&gt;/v2.0
                        </code>
                        .
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {provider === "OKTA" && (
                <FormField
                  control={form.control}
                  name="okta_subdomain"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Okta subdomain</FormLabel>
                      <FormControl>
                        <Input placeholder="your-org" {...field} />
                      </FormControl>
                      <FormDescription>
                        The part before <code className="text-xs">.okta.com</code>{" "}
                        in your Okta org URL. The issuer becomes{" "}
                        <code className="text-xs">
                          https://&lt;subdomain&gt;.okta.com/oauth2/default
                        </code>
                        .
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {provider === "CUSTOM" && (
                <FormField
                  control={form.control}
                  name="issuer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Issuer URL</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://issuer.example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Any OIDC issuer. JWKS is discovered via{" "}
                        <code className="text-xs">
                          {"{issuer}"}/.well-known/openid-configuration
                        </code>
                        .
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="client_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client ID</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={
                          provider === "GOOGLE"
                            ? "123456.apps.googleusercontent.com"
                            : provider === "MICROSOFT"
                              ? "00000000-0000-0000-0000-000000000000"
                              : provider === "OKTA"
                                ? "0oab1c2d3e4f5g6h7"
                                : "your-client-id"
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      OAuth 2.0 client ID. Used as the default JWT audience
                      when the field below is empty.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="audience"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Audience (optional)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={
                          provider === "OKTA" ? "api://default" : ""
                        }
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Override the expected JWT <code>aud</code> claim. Leave
                      empty to fall back to the client ID. Okta client
                      credentials tokens typically use{" "}
                      <code className="text-xs">api://default</code>.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allowed_domains"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Allowed domains (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="company.com, partner.com"
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Comma- or whitespace-separated. Only tokens whose email
                      domain is in this list pass.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="allowed_emails"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Allowed emails (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="alice@company.com, bob@company.com"
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Comma- or whitespace-separated. Exact-match list. Combine
                      with allowed domains for a stricter gate.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </form>
          </Form>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset(initialValues)}
            disabled={save.isPending || !form.formState.isDirty}
          >
            Reset
          </Button>
          <Button
            type="submit"
            form={`sso-form-${provider}`}
            disabled={save.isPending || !form.formState.isValid}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
