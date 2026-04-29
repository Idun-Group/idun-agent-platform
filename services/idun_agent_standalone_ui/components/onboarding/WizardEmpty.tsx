import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Framework } from "@/lib/api";
import { FrameworkPicker } from "./FrameworkPicker";

interface WizardEmptyProps {
  onContinue: (framework: Framework) => void;
  onRescan: () => void;
}

export function WizardEmpty({ onContinue, onRescan }: WizardEmptyProps) {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Let's create your first Idun agent</CardTitle>
        <p className="text-sm text-muted-foreground">
          We didn't find any Python files in this folder. Pick a framework and
          we'll scaffold a starter for you.
        </p>
      </CardHeader>
      <CardContent>
        <FrameworkPicker onContinue={onContinue} onRescan={onRescan} />
      </CardContent>
    </Card>
  );
}
