// Admin Config — manual migration of existing BRD files into a shareable Google
// Drive folder. The migration ONLY runs when the admin clicks "Migrate"; it is
// never automatic. Re-clicking skips already-migrated files and retries the
// rest. The result (with last-run time) is shown after each run.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HardDriveUpload, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import {
  getBrdDriveStatus,
  runBrdDriveMigration,
  type BrdDriveMigrateResult,
} from "@/lib/brd-drive-api";

const QUERY_KEY = ["admin-brd-drive-status"];

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <div className="text-2xl font-semibold tabular-nums">
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function BrdDriveCard() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<{
    at: Date;
    result: BrdDriveMigrateResult;
  } | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getBrdDriveStatus,
  });

  const migrate = async () => {
    if (running) return;
    setRunning(true);
    try {
      const result = await runBrdDriveMigration();
      setLastRun({ at: new Date(), result });
      toast({
        title: "Migration batch complete",
        description: `Uploaded ${result.succeeded}, failed ${result.failed}. ${
          result.moreRemaining
            ? "More files remain — click Migrate again to continue."
            : "All BRD files are migrated."
        }`,
      });
      await refetch();
    } catch (err) {
      toast({
        title: "Migration failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  const configured = data?.configured ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardDriveUpload className="h-5 w-5" />
          BRD Files → Google Drive
        </CardTitle>
        <CardDescription>
          Mirror existing BRD documents into a shareable Google Drive folder so
          exported links open without an app login. Runs only when you click
          Migrate — already-migrated files are skipped, failed ones are retried.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex h-20 items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            {!configured && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Google Drive is not configured. Set the{" "}
                  <code>GDRIVE_SERVICE_ACCOUNT_JSON</code> and{" "}
                  <code>GDRIVE_BRD_FOLDER_ID</code> environment variables on the
                  server, then reload this page.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total BRDs" value={data?.total ?? 0} />
              <Stat label="Migrated" value={data?.migrated ?? 0} />
              <Stat label="Pending" value={data?.pending ?? 0} />
              <Stat label="Failed" value={data?.failed ?? 0} />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void migrate()}
                disabled={running || !configured || (data?.pending ?? 0) === 0}
                data-testid="button-brd-drive-migrate"
              >
                {running && <Spinner className="mr-2 h-4 w-4" />}
                {running
                  ? "Migrating…"
                  : (data?.pending ?? 0) === 0
                    ? "All migrated"
                    : "Migrate BRD files to Drive"}
              </Button>
              {lastRun && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Last run {lastRun.at.toLocaleString()} — uploaded{" "}
                  {lastRun.result.succeeded}, failed {lastRun.result.failed}.
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
