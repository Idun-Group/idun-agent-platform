"use client";

import { api } from "@/lib/api";
import { SingletonEditor } from "@/components/admin/SingletonEditor";

export default function ObservabilityPage() {
  return (
    <SingletonEditor
      title="Observability"
      queryKey="observability"
      fetcher={api.getObservability}
      saver={api.putObservability}
    />
  );
}
