"use client";

import { useEffect, useState } from "react";
import { parse as parseYaml } from "yaml";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { YamlEditor } from "./YamlEditor";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Initial YAML text. Parsed on each open and handed to the editor. */
  value: string;
  /** Called with the parsed object when the user clicks Save. The sheet
   * closes automatically on successful save. If onSave throws, the error
   * is shown in an alert and the sheet stays open. */
  onSave: (parsed: unknown) => void | Promise<void>;
  title?: string;
  description?: string;
};

/** Parse the initial YAML text into an object. Returns either the parsed
 * value or an Error so callers can surface a friendly message instead of
 * crashing. */
function parseInitial(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: text.trim() ? parseYaml(text) : {} };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Sheet-wrapped Monaco YAML editor used as an "Edit YAML" escape hatch on
 * singleton config pages. Wraps the existing object-based `YamlEditor`:
 * parses the incoming `value` string on open, tracks edits as a parsed
 * object, and hands that object back to `onSave`.
 */
export function EditYamlSheet({
  open,
  onOpenChange,
  value,
  onSave,
  title = "Edit YAML",
  description,
}: Props) {
  const [buffer, setBuffer] = useState<unknown>(() => {
    const initial = parseInitial(value);
    return initial.ok ? initial.value : {};
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset the editor buffer + error every time the sheet opens with fresh input.
  useEffect(() => {
    if (!open) return;
    const initial = parseInitial(value);
    if (initial.ok) {
      setBuffer(initial.value);
      setError(null);
    } else {
      setBuffer({});
      setError(initial.error);
    }
  }, [open, value]);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await onSave(buffer);
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="flex-1 overflow-hidden px-6 py-4">
          <YamlEditor value={buffer} onChange={setBuffer} rows={24} />
        </div>
        {error && (
          <Alert variant="destructive" className="mx-6 my-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
