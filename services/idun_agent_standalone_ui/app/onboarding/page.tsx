"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, api } from "@/lib/api";
import type {
  AgentRead,
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
import { WizardDone } from "@/components/onboarding/WizardDone";
import { WizardError } from "@/components/onboarding/WizardError";

const SCAN_QUERY_KEY = ["onboarding-scan"] as const;

type Mode = "starter" | "detection";

type WizardStep =
  | { kind: "scanning" }
  | { kind: "scan-result"; data: ScanResponse }
  | { kind: "starter-confirm"; framework: Framework }
  | { kind: "materializing" }
  | { kind: "done"; agent: AgentRead; framework: Framework; mode: Mode }
  | { kind: "error"; message: string; code: string; retry: () => void };

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: SCAN_QUERY_KEY,
    queryFn: () => api.scan(),
  });

  const [step, setStep] = useState<WizardStep>({ kind: "scanning" });
  const redirecting = data?.state === "ALREADY_CONFIGURED";

  // Tracks the framework of the most recent materialize call so the Done
  // screen can render the right env-var reminder. A ref avoids extra renders
  // during the materialize → done transition.
  const lastFrameworkRef = useRef<Framework>("LANGGRAPH");

  useEffect(() => {
    if (isLoading) {
      setStep({ kind: "scanning" });
      return;
    }
    if (data && !redirecting) {
      setStep((prev) => {
        // Only sync to scan-result when we're returning from scan/scan-result;
        // don't clobber starter-confirm, materializing, done, or error states.
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

  function extractCode(err: unknown): string {
    if (err instanceof ApiError) {
      const detail = err.detail as { error?: { code?: string } } | null;
      return detail?.error?.code ?? "unknown";
    }
    return "unknown";
  }

  function handleMutationError(err: unknown, retry: () => void) {
    if (err instanceof ApiError && err.status === 409) {
      // 409: stale state (another tab raced, or a TOCTOU on detection-not-found).
      // Toast the reason and bounce to a fresh scan so the user sees current state.
      toast.error(extractMessage(err));
      queryClient.invalidateQueries({ queryKey: SCAN_QUERY_KEY });
      setStep({ kind: "scanning" });
      return;
    }
    // Anything else — most likely 500 reload_failed — gets the Error screen
    // with retry.
    setStep({
      kind: "error",
      message: extractMessage(err),
      code: extractCode(err),
      retry,
    });
  }

  const detectionMutation = useMutation({
    mutationFn: (body: CreateFromDetectionBody) => api.createFromDetection(body),
    onSuccess: (response) => {
      setStep({
        kind: "done",
        agent: response.data,
        framework: lastFrameworkRef.current,
        mode: "detection",
      });
    },
    onError: (err) => {
      handleMutationError(err, () => {
        const body = detectionMutation.variables;
        if (body) {
          setStep({ kind: "materializing" });
          detectionMutation.mutate(body);
        }
      });
    },
  });

  const starterMutation = useMutation({
    mutationFn: (body: CreateStarterBody) => api.createStarter(body),
    onSuccess: (response) => {
      setStep({
        kind: "done",
        agent: response.data,
        framework: lastFrameworkRef.current,
        mode: "starter",
      });
    },
    onError: (err) => {
      handleMutationError(err, () => {
        const body = starterMutation.variables;
        if (body) {
          setStep({ kind: "materializing" });
          starterMutation.mutate(body);
        }
      });
    },
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

  if (step.kind === "done") {
    return (
      <WizardDone
        agent={step.agent}
        framework={step.framework}
        mode={step.mode}
        onGoToChat={() => router.push("/?tour=start")}
      />
    );
  }

  if (step.kind === "error") {
    return (
      <WizardError
        message={step.message}
        code={step.code}
        onRetry={step.retry}
        onBack={() => {
          if (data) setStep({ kind: "scan-result", data });
          else setStep({ kind: "scanning" });
        }}
      />
    );
  }

  if (step.kind === "starter-confirm") {
    return (
      <WizardStarterConfirm
        framework={step.framework}
        onConfirm={(body) => {
          lastFrameworkRef.current = body.framework;
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
      lastFrameworkRef.current = detection.framework;
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
