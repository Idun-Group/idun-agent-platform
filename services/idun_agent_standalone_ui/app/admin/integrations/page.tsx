"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, Settings, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { JsonEditor } from "@/components/admin/JsonEditor";
import { ComingSoonBadge } from "@/components/common/ComingSoonBadge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ApiError, type IntegrationRead, api } from "@/lib/api";

// ── Catalog ──────────────────────────────────────────────────────────────

const KINDS = ["whatsapp", "discord"] as const;
type Kind = (typeof KINDS)[number];

const KIND_META: Record<
  Kind,
  { label: string; summary: string }
> = {
  whatsapp: {
    label: "WhatsApp",
    summary: "Receive and send messages from a WhatsApp Business number.",
  },
  discord: {
    label: "Discord",
    summary: "Connect a Discord bot to relay messages with the agent.",
  },
};

function isKnownKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value);
}

// ── Form schema ──────────────────────────────────────────────────────────

const integrationFormSchema = z.object({
  kind: z.enum(KINDS),
  enabled: z.boolean(),
  config: z.record(z.unknown()),
});

type IntegrationFormValues = z.infer<typeof integrationFormSchema>;

function emptyFormValues(): IntegrationFormValues {
  return { kind: "whatsapp", enabled: false, config: {} };
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["integrations"],
    queryFn: api.listIntegrations,
  });

  const [sheetOpen, setSheetOpen] = useState(false);
  /** id of the integration being edited; "new" for create; null when closed. */
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const form = useForm<IntegrationFormValues>({
    resolver: zodResolver(integrationFormSchema),
    defaultValues: emptyFormValues(),
  });

  const create = useMutation({
    mutationFn: api.createIntegration,
    onSuccess: () => {
      toast.success("Integration created");
      qc.invalidateQueries({ queryKey: ["integrations"] });
      closeSheet();
    },
    onError: (e: unknown) => toast.error(formatError(e, "Create failed")),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<IntegrationRead> }) =>
      api.patchIntegration(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
    onError: (e: unknown) => toast.error(formatError(e, "Update failed")),
  });

  const patchFromSheet = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<IntegrationRead> }) =>
      api.patchIntegration(id, body),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["integrations"] });
      closeSheet();
    },
    onError: (e: unknown) => toast.error(formatError(e, "Save failed")),
  });

  const del = useMutation({
    mutationFn: api.deleteIntegration,
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["integrations"] });
      setConfirmId(null);
    },
    onError: (e: unknown) => toast.error(formatError(e, "Delete failed")),
  });

  function openSheetForExisting(row: IntegrationRead) {
    setEditingId(row.id);
    const kind: Kind = isKnownKind(row.kind) ? row.kind : "whatsapp";
    form.reset({
      kind,
      enabled: row.enabled,
      config: row.config ?? {},
    });
    setSheetOpen(true);
  }

  function openSheetForNew() {
    setEditingId("new");
    form.reset(emptyFormValues());
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingId(null);
  }

  function onSheetSave(values: IntegrationFormValues) {
    if (editingId === "new") {
      create.mutate({
        kind: values.kind,
        config: values.config,
        enabled: values.enabled,
      });
    } else if (editingId) {
      patchFromSheet.mutate({
        id: editingId,
        body: {
          kind: values.kind,
          config: values.config,
          enabled: values.enabled,
        },
      });
    }
  }

  // Reset the form whenever the editing target changes (defensive — handled
  // by openSheetFor* but useful when the sheet rerenders).
  useEffect(() => {
    if (!sheetOpen) form.reset(emptyFormValues());
  }, [sheetOpen, form]);

  const sheetBusy =
    create.isPending || patchFromSheet.isPending;
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

      {/* Configure sheet */}
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
              {editingId === "new"
                ? "Add integration"
                : "Configure integration"}
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
                  name="kind"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kind</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => field.onChange(v as Kind)}
                        disabled={editingId !== "new"}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Pick a channel" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {KINDS.map((k) => (
                            <SelectItem key={k} value={k}>
                              {KIND_META[k].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Channel kind cannot change after creation.
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

                <FormField
                  control={form.control}
                  name="config"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Configuration (JSON)</FormLabel>
                      <FormControl>
                        <JsonEditor
                          value={field.value}
                          onChange={(v) =>
                            field.onChange(v as Record<string, unknown>)
                          }
                          rows={14}
                        />
                      </FormControl>
                      <FormDescription>
                        Channel-specific credentials and routing options.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </form>
            </Form>
          </div>
          <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={closeSheet} disabled={sheetBusy}>
              Cancel
            </Button>
            <Button type="submit" form="integration-form" disabled={sheetBusy}>
              {sheetBusy ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Delete confirm */}
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
                  This removes the{" "}
                  <strong>
                    {isKnownKind(confirmRow.kind)
                      ? KIND_META[confirmRow.kind].label
                      : confirmRow.kind}
                  </strong>{" "}
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

// ── Card ─────────────────────────────────────────────────────────────────

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
  const known = isKnownKind(integration.kind);
  const meta = known ? KIND_META[integration.kind as Kind] : null;
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted shrink-0">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base truncate">
              {meta?.label ?? integration.kind}
            </CardTitle>
            <CardDescription className="text-xs">
              {integration.kind}
            </CardDescription>
          </div>
        </div>
        <Switch
          checked={integration.enabled}
          onCheckedChange={onToggle}
          disabled={togglePending}
          aria-label={`${integration.enabled ? "Disable" : "Enable"} ${integration.kind}`}
        />
      </CardHeader>
      <CardContent className="flex-1 space-y-3 text-sm text-muted-foreground">
        <p>{meta?.summary ?? "Custom channel integration."}</p>
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
          {/* Test webhook is part of MVP-2 (engine has no test_connection yet). */}
          <ComingSoonBadge variant="preview" />
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
          aria-label={`Delete ${integration.kind} integration`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatError(e: unknown, fallback: string): string {
  const detail = e instanceof ApiError ? e.detail : undefined;
  return (
    (detail as { message?: string } | undefined)?.message ??
    (e instanceof Error ? e.message : fallback)
  );
}
