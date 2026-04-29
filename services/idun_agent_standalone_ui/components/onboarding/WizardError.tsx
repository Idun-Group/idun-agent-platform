"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface WizardErrorProps {
  message: string;
  code: string;
  onRetry: () => void;
  onBack: () => void;
}

export function WizardError({
  message,
  code,
  onRetry,
  onBack,
}: WizardErrorProps) {
  const isReloadFailed = code === "reload_failed";
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Something went wrong</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{message}</p>
            {isReloadFailed && (
              <p>
                Edit your <code>agent.py</code> to fix the issue, then click
                Retry.
              </p>
            )}
          </AlertDescription>
        </Alert>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Back to wizard
          </button>
          <Button onClick={onRetry}>Retry</Button>
        </div>
      </CardContent>
    </Card>
  );
}
