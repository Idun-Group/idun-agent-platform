"use client";

import { api } from "@/lib/api";
import { SingletonEditor } from "@/components/admin/SingletonEditor";

export default function GuardrailsPage() {
  return (
    <SingletonEditor
      title="Guardrails"
      queryKey="guardrails"
      fetcher={api.getGuardrails}
      saver={api.putGuardrails}
      initialEnabled
    />
  );
}
