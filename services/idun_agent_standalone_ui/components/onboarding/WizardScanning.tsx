import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function WizardScanning() {
  return (
    <Card className="w-full max-w-lg">
      <CardContent className="p-6 space-y-4">
        <p className="text-sm text-muted-foreground">Scanning your project…</p>
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </CardContent>
    </Card>
  );
}
