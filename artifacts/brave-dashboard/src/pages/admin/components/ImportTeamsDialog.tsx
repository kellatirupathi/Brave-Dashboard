import { useRef, useState } from "react";
import Papa from "papaparse";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminBulkImportTeams,
  getListTeamsQueryKey,
  type ErrorType,
  type AdminBulkImportTeamRow,
  type AdminBulkImportTeamsResponse,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { Upload, ChevronDown, AlertCircle } from "lucide-react";

type ParsedRow = {
  rowNumber: number;
  universityName: string;
  teamName: string;
  leaderUserId: string;
  leaderNiatId: string;
  leaderName: string;
  members: Array<{ userId: string; niatId: string; name: string }>;
};

const norm = (s: string) => s.trim().toLowerCase();

function buildIndex(headers: string[]): {
  university: number | null;
  studentUserId: number[];
  niatId: number[];
  name: number[];
  teamName: number | null;
} {
  const studentUserId: number[] = [];
  const niatId: number[] = [];
  const name: number[] = [];
  let university: number | null = null;
  let teamName: number | null = null;
  headers.forEach((h, idx) => {
    const k = norm(h);
    if (k === "student user id") studentUserId.push(idx);
    else if (k.includes("niat id")) niatId.push(idx);
    else if (k === "team leader name" || /team member\d+ name/.test(k))
      name.push(idx);
    else if (k === "university") university = idx;
    else if (k === "team name") teamName = idx;
  });
  return { university, studentUserId, niatId, name, teamName };
}

function parseCsv(text: string): {
  rows: ParsedRow[];
  error: string | null;
} {
  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    return { rows: [], error: result.errors[0].message };
  }
  const data = result.data as string[][];
  if (data.length < 2) {
    return { rows: [], error: "CSV has no data rows." };
  }
  const headers = data[0];
  const idx = buildIndex(headers);
  if (idx.studentUserId.length === 0) {
    return {
      rows: [],
      error:
        "CSV is missing the required “Student User ID” columns. Please check the file.",
    };
  }
  if (idx.teamName == null) {
    return { rows: [], error: "CSV is missing the “Team Name” column." };
  }

  const cell = (row: string[], i: number | null) =>
    i == null || i >= row.length ? "" : (row[i] ?? "").trim();

  const rows: ParsedRow[] = [];
  for (let r = 1; r < data.length; r++) {
    const raw = data[r];
    const teamName = cell(raw, idx.teamName);
    const leaderId = cell(raw, idx.studentUserId[0] ?? null);
    // Skip trailing empty rows
    if (!teamName && !leaderId) continue;

    const memberIndices = idx.studentUserId.slice(1, 5);
    const members = memberIndices
      .map((sIdx, mPos) => ({
        userId: cell(raw, sIdx),
        niatId: cell(raw, idx.niatId[mPos + 1] ?? null),
        name: cell(raw, idx.name[mPos + 1] ?? null),
      }))
      .filter((m) => m.userId.length > 0);

    rows.push({
      rowNumber: r + 1, // header is row 1
      universityName: cell(raw, idx.university),
      teamName,
      leaderUserId: leaderId,
      leaderNiatId: cell(raw, idx.niatId[0] ?? null),
      leaderName: cell(raw, idx.name[0] ?? null),
      members,
    });
  }
  if (rows.length === 0) {
    return { rows: [], error: "No team rows were found in the file." };
  }
  return { rows, error: null };
}

export function ImportTeamsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"file" | "preview" | "result">("file");
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [result, setResult] = useState<AdminBulkImportTeamsResponse | null>(
    null,
  );

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const bulkImport = useAdminBulkImportTeams();

  const reset = () => {
    setStep("file");
    setParseError(null);
    setParsed([]);
    setFileName("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      if (step === "result") {
        queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey() });
      }
      reset();
    }
    onOpenChange(next);
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    setParseError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const { rows, error } = parseCsv(text);
      if (error) {
        setParseError(error);
        setParsed([]);
        return;
      }
      setParsed(rows);
      setStep("preview");
    };
    reader.onerror = () => setParseError("Could not read the file.");
    reader.readAsText(file);
  };

  const onConfirmImport = () => {
    const payload: AdminBulkImportTeamRow[] = parsed.map((r) => ({
      rowNumber: r.rowNumber,
      universityName: r.universityName,
      teamName: r.teamName,
      leaderUserId: r.leaderUserId,
      memberUserIds: r.members.map((m) => m.userId),
    }));
    bulkImport.mutate(
      { data: { teams: payload } },
      {
        onSuccess: (data) => {
          setResult(data);
          setStep("result");
          if (data.insertedCount > 0) {
            toast({
              title: "Teams imported",
              description: `${data.insertedCount} of ${data.totalRows} teams created.`,
            });
          } else {
            toast({
              title: "No teams imported",
              description: "See details for skip reasons.",
              variant: "destructive",
            });
          }
        },
        onError: (err: ErrorType<unknown>) => {
          toast({
            title: "Import failed",
            description:
              err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import teams from CSV</DialogTitle>
          <DialogDescription>
            Bulk-create active teams. Rows with missing or already-on-a-team
            users are skipped automatically.
          </DialogDescription>
        </DialogHeader>

        {step === "file" && (
          <div className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="mx-auto w-8 h-8 text-muted-foreground mb-3" />
              <div className="text-sm text-muted-foreground mb-3">
                Choose a .csv file. Header row must include University, five
                “Student User ID” columns (1 leader + 4 members), and Team Name.
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
                data-testid="input-csv-file"
              />
              <Button
                type="button"
                onClick={() => fileRef.current?.click()}
                data-testid="button-pick-csv"
              >
                Choose file
              </Button>
              {fileName && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {fileName}
                </div>
              )}
            </div>
            {parseError && (
              <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-3">
                <AlertCircle className="w-4 h-4 mt-0.5" />
                <span>{parseError}</span>
              </div>
            )}
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Parsed <span className="font-medium">{parsed.length}</span>{" "}
              row{parsed.length === 1 ? "" : "s"} from{" "}
              <span className="font-medium">{fileName}</span>
            </div>
            <div className="border rounded-md max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>University</TableHead>
                    <TableHead>Team Name</TableHead>
                    <TableHead>Leader</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.map((r) => (
                    <TableRow key={r.rowNumber}>
                      <TableCell className="text-muted-foreground">
                        {r.rowNumber}
                      </TableCell>
                      <TableCell>{r.universityName || "—"}</TableCell>
                      <TableCell className="font-medium">
                        {r.teamName}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {r.leaderNiatId || r.leaderUserId.slice(0, 8) + "…"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.leaderName}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.members.length}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-4">
            <div className="rounded-md border p-4 text-center">
              <div className="text-3xl font-bold">
                Imported {result.insertedCount} of {result.totalRows} teams
              </div>
              {result.skippedCount > 0 && (
                <div className="text-sm text-muted-foreground mt-1">
                  {result.skippedCount} row
                  {result.skippedCount === 1 ? "" : "s"} skipped.
                </div>
              )}
            </div>
            {result.skippedCount > 0 && (
              <Collapsible defaultOpen>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-between"
                    data-testid="button-toggle-skipped"
                  >
                    <span>View skipped rows</span>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="border rounded-md max-h-64 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Team Name</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.skipped.map((s, i) => (
                          <TableRow key={`${s.rowNumber}-${i}`}>
                            <TableCell className="text-muted-foreground">
                              {s.rowNumber}
                            </TableCell>
                            <TableCell>{s.teamName || "—"}</TableCell>
                            <TableCell className="text-sm">
                              {s.reason}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "file" && (
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              data-testid="button-cancel-import"
            >
              Cancel
            </Button>
          )}
          {step === "preview" && (
            <>
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                data-testid="button-cancel-preview"
              >
                Cancel
              </Button>
              <Button
                onClick={onConfirmImport}
                disabled={bulkImport.isPending || parsed.length === 0}
                data-testid="button-confirm-import"
              >
                {bulkImport.isPending && (
                  <Spinner className="w-4 h-4 mr-2" />
                )}
                Confirm import ({parsed.length} row
                {parsed.length === 1 ? "" : "s"})
              </Button>
            </>
          )}
          {step === "result" && (
            <Button
              onClick={() => handleClose(false)}
              data-testid="button-done-import"
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
