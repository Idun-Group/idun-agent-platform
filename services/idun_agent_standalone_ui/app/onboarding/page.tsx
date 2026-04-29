"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { WizardScanning } from "@/components/onboarding/WizardScanning";

const SCAN_QUERY_KEY = ["onboarding-scan"] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { data, isLoading, error } = useQuery({
    queryKey: SCAN_QUERY_KEY,
    queryFn: () => api.scan(),
    retry: false,
  });

  useEffect(() => {
    if (data?.state === "ALREADY_CONFIGURED") {
      router.replace("/");
    }
  }, [data, router]);

  if (isLoading || data?.state === "ALREADY_CONFIGURED") {
    return <WizardScanning />;
  }

  if (error) {
    return (
      <div className="text-sm text-muted-foreground">
        Could not scan project. Please refresh.
      </div>
    );
  }

  // Subsequent tasks (6–9) replace this with screen dispatch.
  return (
    <div className="text-sm text-muted-foreground">
      State: {data?.state} (screens not yet implemented)
    </div>
  );
}
