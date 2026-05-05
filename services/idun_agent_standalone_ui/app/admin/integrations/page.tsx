"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings, Trash2 } from "lucide-react";
import * as React from "react";
import { useEffect, useState } from "react";
import { useForm, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { ProviderPicker } from "@/components/admin/ProviderPicker";
import {
  DiscordIcon,
  GoogleChatIcon,
  MicrosoftTeamsIcon,
  SlackIcon,
  WhatsAppIcon,
} from "@/components/admin/provider-icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  type IntegrationRead,
  type MutationResponse,
  api,
} from "@/lib/api";

const PROVIDERS = [
  "SLACK",
  "WHATSAPP",
  "DISCORD",
  "GOOGLE_CHAT",
  "TEAMS",
] as const;
type Provider = (typeof PROVIDERS)[number];

const PROVIDER_META: Record<Provider, { label: string; summary: string }> = {
  SLACK: {
    label: "Slack",
    summary: "Receive and send messages from a Slack workspace.",
  },
  WHATSAPP: {
    label: "WhatsApp",
    summary: "Receive and send messages from a WhatsApp Business number.",
  },
  DISCORD: {
    label: "Discord",
    summary: "Connect a Discord bot to relay messages with the agent.",
  },
  GOOGLE_CHAT: {
    label: "Google Chat",
    summary: "Bridge Google Chat spaces with the agent.",
  },
  TEAMS: {
    label: "Microsoft Teams",
    summary: "Connect a Bot Framework app to relay Teams messages.",
  },
};

function providerIcon(p: Provider, size = 40): React.ReactNode {
  switch (p) {
    case "SLACK":
      return <SlackIcon size={size} />;
    case "WHATSAPP":
      return <WhatsAppIcon size={size} />;
    case "DISCORD":
      return <DiscordIcon size={size} />;
    case "GOOGLE_CHAT":
      return <GoogleChatIcon size={size} />;
    case "TEAMS":
      return <MicrosoftTeamsIcon size={size} />;
  }
}

const PROVIDER_PICKER_OPTIONS = PROVIDERS.map((p) => ({
  id: p,
  label: PROVIDER_META[p].label,
  description: PROVIDER_META[p].summary,
  icon: providerIcon(p, 44),
}));

function isProvider(v: unknown): v is Provider {
  return typeof v === "string" && (PROVIDERS as readonly string[]).includes(v);
}

function readProvider(row: IntegrationRead): Provider {
  const p = (row.integration as { provider?: unknown } | undefined)?.provider;
  return isProvider(p) ? p : "SLACK";
}

function readConfig(row: IntegrationRead): Record<string, unknown> {
  const c = (row.integration as { config?: unknown } | undefined)?.config;
  return c && typeof c === "object" && !Array.isArray(c)
    ? (c as Record<string, unknown>)
    : {};
}

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  provider: z.enum(PROVIDERS),
  enabled: z.boolean(),
  // Slack
  bot_token: z.string().optional().default(""),
  signing_secret: z.string().optional().default(""),
  // WhatsApp
  access_token: z.string().optional().default(""),
  phone_number_id: z.string().optional().default(""),
  verify_token: z.string().optional().default(""),
  api_version: z.string().optional().default("v21.0"),
  // Discord (bot_token reused)
  application_id: z.string().optional().default(""),
  public_key: z.string().optional().default(""),
  guild_id: z.string().optional().default(""),
  // Google Chat
  service_account_credentials_json: z.string().optional().default(""),
  project_number: z.string().optional().default(""),
  local_mode: z.boolean().optional().default(false),
  // Teams
  app_id: z.string().optional().default(""),
  app_password: z.string().optional().default(""),
  app_tenant_id: z.string().optional().default(""),
});

type FormValues = z.infer<typeof formSchema>;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const bool = (v: unknown, fallback = false) =>
  typeof v === "boolean" ? v : fallback;

function emptyForm(): FormValues {
  return {
    name: "",
    provider: "SLACK",
    enabled: true,
    bot_token: "",
    signing_secret: "",
    access_token: "",
    phone_number_id: "",
    verify_token: "",
    api_version: "v21.0",
    application_id: "",
    public_key: "",
    guild_id: "",
    service_account_credentials_json: "",
    project_number: "",
    local_mode: false,
    app_id: "",
    app_password: "",
    app_tenant_id: "",
  };
}

function configToValues(
  provider: Provider,
  config: Record<string, unknown>,
): FormValues {
  const base = emptyForm();
  base.provider = provider;
  switch (provider) {
    case "SLACK":
      base.bot_token = str(config.botToken) || str(config.bot_token);
      base.signing_secret = str(config.signingSecret) || str(config.signing_secret);
      break;
    case "WHATSAPP":
      base.access_token = str(config.accessToken) || str(config.access_token);
      base.phone_number_id =
        str(config.phoneNumberId) || str(config.phone_number_id);
      base.verify_token = str(config.verifyToken) || str(config.verify_token);
      base.api_version =
        str(config.apiVersion) || str(config.api_version) || "v21.0";
      break;
    case "DISCORD":
      base.bot_token = str(config.botToken) || str(config.bot_token);
      base.application_id =
        str(config.applicationId) || str(config.application_id);
      base.public_key = str(config.publicKey) || str(config.public_key);
      base.guild_id = str(config.guildId) || str(config.guild_id);
      break;
    case "GOOGLE_CHAT":
      base.service_account_credentials_json =
        str(config.serviceAccountCredentialsJson) ||
        str(config.service_account_credentials_json);
      base.project_number =
        str(config.projectNumber) || str(config.project_number);
      base.local_mode = bool(config.localMode ?? config.local_mode, false);
      break;
    case "TEAMS":
      base.app_id = str(config.appId) || str(config.app_id);
      base.app_password = str(config.appPassword) || str(config.app_password);
      base.app_tenant_id =
        str(config.appTenantId) || str(config.app_tenant_id);
      break;
  }
  return base;
}

function valuesToConfig(values: FormValues): Record<string, unknown> {
  switch (values.provider) {
    case "SLACK":
      return {
        bot_token: values.bot_token,
        signing_secret: values.signing_secret,
      };
    case "WHATSAPP":
      return {
        access_token: values.access_token,
        phone_number_id: values.phone_number_id,
        verify_token: values.verify_token,
        api_version: values.api_version || "v21.0",
      };
    case "DISCORD":
      return {
        bot_token: values.bot_token,
        application_id: values.application_id,
        public_key: values.public_key,
        ...(values.guild_id ? { guild_id: values.guild_id } : {}),
      };
    case "GOOGLE_CHAT":
      return {
        service_account_credentials_json: values.service_account_credentials_json,
        project_number: values.project_number,
        local_mode: values.local_mode,
      };
    case "TEAMS":
      return {
        app_id: values.app_id,
        app_password: values.app_password,
        app_tenant_id: values.app_tenant_id,
      };
  }
}

function applyMutationToast(resp: MutationResponse<unknown>): void {
  if (resp.reload.status === "restart_required") toast.warning(resp.reload.message);
  else if (resp.reload.status === "reload_failed")
    toast.error(resp.reload.error ?? resp.reload.message);
  else toast.success(resp.reload.message);
}

function formatError(e: unknown, fallback: string): string {
  const detail = e instanceof ApiError ? e.detail : undefined;
  return (
    (detail as { error?: { message?: string } } | undefined)?.error?.message ??
    (e instanceof Error ? e.message : fallback)
  );
}

function ProviderFields({
  control,
  provider,
}: {
  control: Control<FormValues>;
  provider: Provider;
}) {
  if (provider === "SLACK") {
    return (
      <>
        <SecretField control={control} name="bot_token" label="Bot token" placeholder="xoxb-..." />
        <SecretField
          control={control}
          name="signing_secret"
          label="Signing secret"
          placeholder="HMAC verification secret"
        />
      </>
    );
  }
  if (provider === "WHATSAPP") {
    return (
      <>
        <SecretField
          control={control}
          name="access_token"
          label="Access token"
          placeholder="Meta Graph API permanent token"
        />
        <TextField
          control={control}
          name="phone_number_id"
          label="Phone number ID"
        />
        <SecretField
          control={control}
          name="verify_token"
          label="Verify token"
          placeholder="Used during webhook handshake"
        />
        <TextField
          control={control}
          name="api_version"
          label="API version"
          placeholder="v21.0"
        />
      </>
    );
  }
  if (provider === "DISCORD") {
    return (
      <>
        <SecretField control={control} name="bot_token" label="Bot token" />
        <TextField
          control={control}
          name="application_id"
          label="Application ID"
        />
        <TextField control={control} name="public_key" label="Public key" />
        <TextField
          control={control}
          name="guild_id"
          label="Guild ID (optional)"
        />
      </>
    );
  }
  if (provider === "TEAMS") {
    return (
      <>
        <TextField
          control={control}
          name="app_id"
          label="App ID"
          placeholder="Microsoft App ID (Azure AD client ID)"
        />
        <SecretField
          control={control}
          name="app_password"
          label="App password"
          placeholder="Client secret value"
        />
        <TextField
          control={control}
          name="app_tenant_id"
          label="App tenant ID"
          placeholder="Azure AD tenant ID"
        />
      </>
    );
  }
  return (
    <>
      <FormField
        control={control}
        name="service_account_credentials_json"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Service account credentials JSON</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                value={field.value ?? ""}
                rows={8}
                spellCheck={false}
                className="font-mono text-xs"
                placeholder='{"type": "service_account", ...}'
              />
            </FormControl>
            <FormDescription>
              Pasted full JSON for the service account that calls the Chat API.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <TextField
        control={control}
        name="project_number"
        label="GCP project number"
      />
      <FormField
        control={control}
        name="local_mode"
        render={({ field }) => (
          <FormItem className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="space-y-0.5">
              <FormLabel>Local mode</FormLabel>
              <FormDescription>
                Skip JWT verification when running against a local emulator.
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
              />
            </FormControl>
          </FormItem>
        )}
      />
    </>
  );
}

function TextField({
  control,
  name,
  label,
  placeholder,
}: {
  control: Control<FormValues>;
  name: keyof FormValues;
  label: string;
  placeholder?: string;
}) {
  return (
    <FormField
      control={control}
      // @ts-expect-error name is a known string key; RHF's narrow typing isn't worth fighting here
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={typeof field.value === "string" ? field.value : ""}
              placeholder={placeholder}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function SecretField({
  control,
  name,
  label,
  placeholder,
}: {
  control: Control<FormValues>;
  name: keyof FormValues;
  label: string;
  placeholder?: string;
}) {
  return (
    <FormField
      control={control}
      // @ts-expect-error name is a known string key; RHF's narrow typing isn't worth fighting here
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={typeof field.value === "string" ? field.value : ""}
              type="password"
              autoComplete="off"
              placeholder={placeholder}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: api.listIntegrations,
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: emptyForm(),
  });

  const watchedProvider = form.watch("provider");

  const create = useMutation({
    mutationFn: api.createIntegration,
    onSuccess: (resp) => {
      applyMutationToast(resp);
      qc.invalidateQueries({ queryKey: ["integrations"] });
      closeSheet();
    },
    onError: (e) => toast.error(formatError(e, "Create failed")),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.patchIntegration>[1] }) =>
      api.patchIntegration(id, body),
    onSuccess: (resp) => {
      applyMutationToast(resp);
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e) => toast.error(formatError(e, "Update failed")),
  });

  const patchFromSheet = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.patchIntegration>[1] }) =>
      api.patchIntegration(id, body),
    onSuccess: (resp) => {
      applyMutationToast(resp);
      qc.invalidateQueries({ queryKey: ["integrations"] });
      closeSheet();
    },
    onError: (e) => toast.error(formatError(e, "Save failed")),
  });

  const del = useMutation({
    mutationFn: api.deleteIntegration,
    onSuccess: (resp) => {
      applyMutationToast(resp);
      qc.invalidateQueries({ queryKey: ["integrations"] });
      setConfirmId(null);
    },
    onError: (e) => toast.error(formatError(e, "Delete failed")),
  });

  function openSheetForExisting(row: IntegrationRead) {
    setEditingId(row.id);
    const provider = readProvider(row);
    const config = readConfig(row);
    const next = configToValues(provider, config);
    next.name = row.name;
    next.enabled = row.enabled;
    form.reset(next);
    setSheetOpen(true);
  }

  function openSheetForNew() {
    setEditingId("new");
    form.reset(emptyForm());
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingId(null);
  }

  function onSheetSave(values: FormValues) {
    const integration = {
      provider: values.provider,
      enabled: true,
      config: valuesToConfig(values),
    };
    if (editingId === "new") {
      create.mutate({
        name: values.name,
        enabled: values.enabled,
        integration,
      });
    } else if (editingId) {
      patchFromSheet.mutate({
        id: editingId,
        body: { name: values.name, enabled: values.enabled, integration },
      });
    }
  }

  useEffect(() => {
    if (!sheetOpen) form.reset(emptyForm());
  }, [sheetOpen, form]);

  const sheetBusy = create.isPending || patchFromSheet.isPending;
  const confirmRow =
    confirmId !== null ? rows.find((r) => r.id === confirmId) : undefined;

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl">
      <header className="space-y-1">
        <h1 className="font-serif text-2xl font-medium text-foreground">
          Integrations
        </h1>
        <p className="text-sm text-muted-foreground">
          Channel adapters that let the agent talk to external messaging
          platforms.
        </p>
      </header>

      <div className="flex justify-end">
        <Button onClick={openSheetForNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add integration
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No integrations configured.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onConfigure={() => openSheetForExisting(integration)}
              onToggle={(enabled) =>
                patch.mutate({ id: integration.id, body: { enabled } })
              }
              onDelete={() => setConfirmId(integration.id)}
              togglePending={patch.isPending}
            />
          ))}
        </div>
      )}

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) closeSheet();
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        >
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>
              {editingId === "new" ? "Add integration" : "Configure integration"}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <Form {...form}>
              <form
                id="integration-form"
                onSubmit={form.handleSubmit(onSheetSave)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="my-slack" />
                      </FormControl>
                      <FormDescription>
                        Display name. The slug is derived from this.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="provider"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Provider</FormLabel>
                      <FormControl>
                        <fieldset disabled={editingId !== "new"} className="contents">
                          <ProviderPicker
                            value={field.value}
                            onChange={(v) => field.onChange(v as Provider)}
                            options={PROVIDER_PICKER_OPTIONS}
                            columns={2}
                          />
                        </fieldset>
                      </FormControl>
                      <FormDescription>
                        Provider cannot change after creation.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Enabled</FormLabel>
                        <FormDescription>
                          Disabled integrations stay configured but do not
                          process messages.
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

                <ProviderFields
                  control={form.control}
                  provider={watchedProvider}
                />
              </form>
            </Form>
          </div>
          <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={closeSheet} disabled={sheetBusy}>
              Cancel
            </Button>
            <Button
              onClick={form.handleSubmit(onSheetSave)}
              disabled={sheetBusy}
            >
              {sheetBusy ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={confirmId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete integration?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRow && (
                <>
                  This removes the <strong>{confirmRow.name}</strong>{" "}
                  integration. This cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmId && del.mutate(confirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={del.isPending}
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IntegrationCard({
  integration,
  onConfigure,
  onToggle,
  onDelete,
  togglePending,
}: {
  integration: IntegrationRead;
  onConfigure: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  togglePending: boolean;
}) {
  const provider = readProvider(integration);
  const meta = PROVIDER_META[provider];
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {providerIcon(provider, 40)}
          <div className="min-w-0">
            <CardTitle className="text-base truncate">
              {integration.name}
            </CardTitle>
            <CardDescription className="text-xs">{meta.label}</CardDescription>
          </div>
        </div>
        <Switch
          checked={integration.enabled}
          onCheckedChange={onToggle}
          disabled={togglePending}
          aria-label={`${integration.enabled ? "Disable" : "Enable"} ${integration.name}`}
        />
      </CardHeader>
      <CardContent className="flex-1 space-y-3 text-sm text-muted-foreground">
        <p>{meta.summary}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={
              integration.enabled
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "border-border bg-muted text-muted-foreground"
            }
          >
            {integration.enabled ? "enabled" : "disabled"}
          </Badge>
        </div>
      </CardContent>
      <CardFooter className="justify-between gap-2">
        <Button variant="outline" size="sm" onClick={onConfigure}>
          <Settings className="mr-2 h-4 w-4" />
          Configure
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className="text-destructive"
          aria-label={`Delete ${integration.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}
