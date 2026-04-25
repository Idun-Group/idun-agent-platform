"use client";

import { api } from "@/lib/api";
import { SingletonEditor } from "@/components/admin/SingletonEditor";

export default function MemoryPage() {
  return (
    <SingletonEditor
      title="Memory / Checkpointer"
      queryKey="memory"
      fetcher={api.getMemory}
      saver={api.putMemory}
    />
  );
}
