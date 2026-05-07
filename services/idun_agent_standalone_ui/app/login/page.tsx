"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function isSafeNext(next: string): boolean {
  // Only same-origin paths. Reject `https://evil.com`, `//evil.com`,
  // `http://`, etc. — open redirect guard.
  return next.startsWith("/") && !next.startsWith("//");
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="grid place-items-center min-h-screen bg-background p-6">
      <Card className="w-full max-w-sm p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
          <p className="text-xs text-muted-foreground mt-1">
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
              const raw = params?.get("next") ?? "/";
              const next = isSafeNext(raw) ? raw : "/";
              router.replace(next);
            } catch (err) {
              const status = err instanceof ApiError ? err.status : 0;
              toast.error(
                status === 401 ? "Invalid credentials" : "Sign-in failed",
              );
              setPassword("");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground" htmlFor="pw">
              Admin password
            </Label>
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

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
