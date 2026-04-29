"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Framework, ScanResponse } from "@/lib/api";
import { WizardScanning } from "@/components/onboarding/WizardScanning";
import { WizardEmpty } from "@/components/onboarding/WizardEmpty";
import { WizardNoSupported } from "@/components/onboarding/WizardNoSupported";

const SCAN_QUERY_KEY = ["onboarding-scan"] as const;

type WizardStep =
  | { kind: "scanning" }
  | { kind: "scan-result"; data: ScanResponse }
  | { kind: "starter-confirm"; framework: Framework; name: string };

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: SCAN_QUERY_KEY,
    queryFn: () => api.scan(),
  });

  const [step, setStep] = useState<WizardStep>({ kind: "scanning" });

  const redirecting = data?.state === "ALREADY_CONFIGURED";

  useEffect(() => {
    if (isLoading) {
      setStep({ kind: "scanning" });
      return;
    }
    if (data && !redirecting) {
      setStep({ kind: "scan-result", data });
    }
  }, [data, isLoading, redirecting]);

  useEffect(() => {
    if (redirecting) {
      router.replace("/");
    }
  }, [redirecting, router]);

  const onRescan = () => {
    queryClient.invalidateQueries({ queryKey: SCAN_QUERY_KEY });
  };

  if (error) {
    return (
      <div className="text-sm text-muted-foreground">
        Could not scan project. Please refresh.
      </div>
    );
  }

  if (step.kind === "scanning" || redirecting) {
    return <WizardScanning />;
  }

  if (step.kind === "scan-result") {
    const onPickFramework = (framework: Framework) => {
      setStep({ kind: "starter-confirm", framework, name: "" });
    };
    if (step.data.state === "EMPTY") {
      return <WizardEmpty onContinue={onPickFramework} onRescan={onRescan} />;
    }
    if (step.data.state === "NO_SUPPORTED") {
      return (
        <WizardNoSupported onContinue={onPickFramework} onRescan={onRescan} />
      );
    }
    // ONE_DETECTED / MANY_DETECTED land in CT7.
    return (
      <div className="text-sm text-muted-foreground">
        State: {step.data.state} (screen lands in CT7)
      </div>
    );
  }

  // starter-confirm screen lands in CT8.
  return (
    <div className="text-sm text-muted-foreground">
      Starter confirm (screen lands in CT8)
    </div>
  );
}
