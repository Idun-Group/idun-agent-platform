"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid place-items-center min-h-screen p-6 bg-[var(--color-bg)]">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-fg)]">Sign in</h1>
          <p className="text-xs text-[var(--color-fg)]/60 mt-1">
            Enter the admin password configured for this deployment.
          </p>
        </div>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api.login(password);
              router.replace("/admin/");
            } catch (err) {
              const status = err instanceof ApiError ? err.status : 0;
              toast.error(
                status === 401 ? "Invalid credentials" : "Sign-in failed",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1">
            <label className="text-xs text-[var(--color-fg)]/70" htmlFor="pw">
              Admin password
            </label>
            <Input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
