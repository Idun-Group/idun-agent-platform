"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import type {
  CreateFromDetectionBody,
  CreateStarterBody,
  DetectedAgent,
  Framework,
  ScanResponse,
} from "@/lib/api";
import { WizardScanning } from "@/components/onboarding/WizardScanning";
import { WizardEmpty } from "@/components/onboarding/WizardEmpty";
import { WizardNoSupported } from "@/components/onboarding/WizardNoSupported";
import { WizardOneDetected } from "@/components/onboarding/WizardOneDetected";
import { WizardManyDetected } from "@/components/onboarding/WizardManyDetected";
import { WizardStarterConfirm } from "@/components/onboarding/WizardStarterConfirm";
import { WizardMaterializing } from "@/components/onboarding/WizardMaterializing";

const SCAN_QUERY_KEY = ["onboarding-scan"] as const;

type WizardStep =
  | { kind: "scanning" }
  | { kind: "scan-result"; data: ScanResponse }
  | { kind: "starter-confirm"; framework: Framework }
  | { kind: "materializing" };

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
      // Only sync to scan-result when we're returning from a 409 conflict
      // (which routes through "scanning") or on first load. Don't clobber
      // starter-confirm or materializing with a stale scan refetch.
      setStep((prev) => {
        if (prev.kind === "scanning" || prev.kind === "scan-result") {
          return { kind: "scan-result", data };
        }
        return prev;
      });
    }
  }, [data, isLoading, redirecting]);

  useEffect(() => {
    if (redirecting) {
      router.replace("/");
    }
  }, [redirecting, router]);

  const onRescan = () => {
    queryClient.invalidateQueries({ queryKey: SCAN_QUERY_KEY });
    setStep({ kind: "scanning" });
  };

  function extractMessage(err: unknown): string {
    if (err instanceof ApiError) {
      const detail = err.detail as { error?: { message?: string } } | null;
      return detail?.error?.message ?? `Request failed (${err.status})`;
    }
    return "Something went wrong";
  }

  function handleMutationError(err: unknown) {
    // TODO(CT9): split 409 (re-scan) vs other errors (Error screen with retry).
    // For now both paths converge: toast the message, invalidate the scan,
    // and bounce back to the scanning loader.
    if (err instanceof ApiError && err.status === 409) {
      toast.error(extractMessage(err));
      queryClient.invalidateQueries({ queryKey: SCAN_QUERY_KEY });
      setStep({ kind: "scanning" });
      return;
    }
    toast.error(extractMessage(err));
    queryClient.invalidateQueries({ queryKey: SCAN_QUERY_KEY });
    setStep({ kind: "scanning" });
  }

  const detectionMutation = useMutation({
    mutationFn: (body: CreateFromDetectionBody) => api.createFromDetection(body),
    onSuccess: () => {
      // Done screen lands in CT9. For now navigate home so the user
      // doesn't get stuck on the materializing loader.
      router.replace("/");
    },
    onError: (err) => handleMutationError(err),
  });

  const starterMutation = useMutation({
    mutationFn: (body: CreateStarterBody) => api.createStarter(body),
    onSuccess: () => {
      router.replace("/");
    },
    onError: (err) => handleMutationError(err),
  });

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

  if (step.kind === "materializing") {
    return <WizardMaterializing />;
  }

  if (step.kind === "starter-confirm") {
    return (
      <WizardStarterConfirm
        framework={step.framework}
        onConfirm={(body) => {
          setStep({ kind: "materializing" });
          starterMutation.mutate(body);
        }}
        onBack={() => {
          if (data) setStep({ kind: "scan-result", data });
        }}
        onRescan={onRescan}
      />
    );
  }

  if (step.kind === "scan-result") {
    const onPickFramework = (framework: Framework) => {
      setStep({ kind: "starter-confirm", framework });
    };
    const onPickDetection = (detection: DetectedAgent) => {
      setStep({ kind: "materializing" });
      detectionMutation.mutate({
        framework: detection.framework,
        filePath: detection.filePath,
        variableName: detection.variableName,
      });
    };
    if (step.data.state === "EMPTY") {
      return <WizardEmpty onContinue={onPickFramework} onRescan={onRescan} />;
    }
    if (step.data.state === "NO_SUPPORTED") {
      return (
        <WizardNoSupported onContinue={onPickFramework} onRescan={onRescan} />
      );
    }
    if (step.data.state === "ONE_DETECTED") {
      return (
        <WizardOneDetected
          detection={step.data.scanResult.detected[0]}
          onConfirm={onPickDetection}
          onRescan={onRescan}
        />
      );
    }
    if (step.data.state === "MANY_DETECTED") {
      return (
        <WizardManyDetected
          detections={step.data.scanResult.detected}
          onConfirm={onPickDetection}
          onRescan={onRescan}
        />
      );
    }
  }

  return null;
}
