import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clapperboard, Search, Download, Upload, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { normalizeError } from "@/lib/api-error";
import {
  listReelScripts,
  importReelScripts,
  type ReelScriptItem,
} from "@/lib/reels-scripts-api";

const PANEL = "rounded-xl border bg-card";

// Colour-code the common buckets; anything else falls back to muted.
function bucketTone(bucket: string): string {
  switch (bucket.toUpperCase()) {
    case "STORY":
      return "bg-emerald-100 text-emerald-700";
    case "INFORMATIVE":
      return "bg-blue-100 text-blue-700";
    case "PAIN POINT":
      return "bg-amber-100 text-amber-700";
    case "STUDENT QUESTION":
      return "bg-violet-100 text-violet-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function AdminReelsScripts() {
  const { data, isLoading } = useQuery({
    queryKey: ["reels-scripts"],
    queryFn: listReelScripts,
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const [search, setSearch] = useState("");
  const [bucketFilter, setBucketFilter] = useState("all");

  const items = data?.items ?? [];
  const buckets = data?.buckets ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (bucketFilter !== "all" && it.bucket !== bucketFilter) return false;
      if (!q) return true;
      return (
        it.script.toLowerCase().includes(q) ||
        it.bucket.toLowerCase().includes(q)
      );
    });
  }, [items, search, bucketFilter]);

  const exportCsv = () => {
    if (filtered.length === 0) return;
    const esc = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
    const lines = ["Bucket,Script,Source,Created"];
    for (const r of filtered) {
      lines.push(
        [
          esc(r.bucket),
          esc(r.script),
          esc(r.source),
          esc(formatDate(r.createdAt)),
        ].join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reel-scripts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const inputEl = e.target;
    if (!file) return;
    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        // The xlsx lib parses CSV too; read as a sheet, then take col A = bucket,
        // col B = script (header:1 → array-of-arrays so we read by position).
        const workbook = XLSX.read(evt.target?.result, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const matrix: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
        });

        const rows: { bucket: string; script: string }[] = [];
        for (let i = 0; i < matrix.length; i++) {
          const bucket = String(matrix[i]?.[0] ?? "").trim();
          const script = String(matrix[i]?.[1] ?? "").trim();
          // Skip a header row ("bucket" / "script") and blank rows.
          if (
            i === 0 &&
            (bucket.toLowerCase() === "bucket" ||
              script.toLowerCase().includes("script"))
          ) {
            continue;
          }
          if (!bucket || !script) continue;
          rows.push({ bucket, script: script.slice(0, 5000) });
        }

        if (rows.length === 0) {
          toast({
            title: "No valid rows found",
            description:
              "Expected Column A = bucket, Column B = reel script. Both are required per row.",
            variant: "destructive",
          });
          return;
        }

        const result = await importReelScripts(rows);
        toast({
          title: "Import complete",
          description: `${result.inserted} added, ${result.skipped} skipped (duplicates).`,
        });
        queryClient.invalidateQueries({ queryKey: ["reels-scripts"] });
      } catch (err: unknown) {
        toast({
          title: "Import failed",
          description: normalizeError(err, "Could not import the file.")
            .message,
          variant: "destructive",
        });
      } finally {
        setIsImporting(false);
        inputEl.value = "";
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Clapperboard className="mt-1 h-7 w-7 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reel Scripts</h1>
          <p className="text-muted-foreground mt-1">
            Bucket-tagged reel scripts — imported references plus ones generated
            daily from weekly journals.
          </p>
        </div>
      </div>

      {/* Filters + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search scripts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-reels-search"
          />
        </div>

        <Select value={bucketFilter} onValueChange={setBucketFilter}>
          <SelectTrigger className="w-52" data-testid="select-reels-bucket">
            <SelectValue placeholder="All buckets" />
          </SelectTrigger>
          <SelectContent className="max-h-72 overflow-y-auto">
            <SelectItem value="all">All buckets</SelectItem>
            {buckets.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          data-testid="button-reels-export"
        >
          <Download className="w-4 h-4 mr-2" /> Export
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileImport}
          style={{ display: "none" }}
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting}
          data-testid="button-reels-import"
        >
          {isImporting ? (
            <Spinner className="w-4 h-4 mr-2" />
          ) : (
            <Upload className="w-4 h-4 mr-2" />
          )}
          Import
        </Button>
      </div>

      {/* Count */}
      <div className="text-sm text-muted-foreground">
        {filtered.length} script{filtered.length === 1 ? "" : "s"}
        {bucketFilter !== "all" ? ` in ${bucketFilter}` : ""}
      </div>

      {/* List (newest → oldest) */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-card border rounded-xl border-dashed">
          <Clapperboard className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-semibold">No reel scripts yet</h3>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            Import your existing scripts (CSV: Column A = bucket, Column B =
            script), or wait for the daily generator to create them from
            journals.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((it: ReelScriptItem) => (
            <div
              key={it.id}
              className={cn(PANEL, "p-4")}
              data-testid={`reel-script-${it.id}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Badge className={cn("border-none", bucketTone(it.bucket))}>
                    {it.bucket}
                  </Badge>
                  {it.source === "generated" && (
                    <Badge
                      variant="secondary"
                      className="border-none bg-primary/10 text-primary"
                    >
                      <Sparkles className="w-3 h-3 mr-1" /> Generated
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDate(it.createdAt)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                {it.script}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
