import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Framework } from "@/lib/api";
import { FrameworkPicker } from "./FrameworkPicker";

interface WizardNoSupportedProps {
  onContinue: (framework: Framework) => void;
  onRescan: () => void;
}

export function WizardNoSupported({
  onContinue,
  onRescan,
}: WizardNoSupportedProps) {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>We found Python code, but no supported agent</CardTitle>
        <p className="text-sm text-muted-foreground">
          Idun supports LangGraph and Google ADK. Pick one to scaffold a
          starter alongside your existing code, or re-scan if you just added
          an agent.
        </p>
      </CardHeader>
      <CardContent>
        <FrameworkPicker onContinue={onContinue} onRescan={onRescan} />
      </CardContent>
    </Card>
  );
}
