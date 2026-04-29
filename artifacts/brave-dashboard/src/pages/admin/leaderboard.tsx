import { useState } from "react";
import * as XLSX from "xlsx";
import {
  getLeaderboardExport,
  type LeaderboardExportResponse,
  type LeaderboardExportTeam,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { normalizeError } from "@/lib/api-error";
import Leaderboard from "../student/leaderboard";

const MAX_MEMBER_SLOTS = 5;

function memberColumnHeaders(): string[] {
  const headers: string[] = [];
  for (let i = 1; i <= MAX_MEMBER_SLOTS; i++) {
    headers.push(
      `Member ${i} Name`,
      `Member ${i} NIAT ID`,
      `Member ${i} User ID`,
      `Member ${i} Email`,
      `Member ${i} Role`,
    );
  }
  return headers;
}

function memberCells(team: LeaderboardExportTeam): (string | null)[] {
  const cells: (string | null)[] = [];
  for (let i = 0; i < MAX_MEMBER_SLOTS; i++) {
    const m = team.members[i];
    if (m) {
      cells.push(m.name, m.niatId ?? "", m.formsUserId ?? "", m.email, m.role);
    } else {
      cells.push("", "", "", "", "");
    }
  }
  return cells;
}

// Compute each team's rank within its own campus using the national order
// (which is already featured DESC, revenue DESC, id ASC).
function computeCampusRanks(
  teams: LeaderboardExportTeam[],
): Map<number, number> {
  const counters = new Map<string, number>();
  const ranks = new Map<number, number>();
  for (const t of teams) {
    const key = t.campusName ?? "(No campus)";
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    ranks.set(t.teamId, next);
  }
  return ranks;
}

function buildNationalSheet(teams: LeaderboardExportTeam[]): XLSX.WorkSheet {
  const campusRanks = computeCampusRanks(teams);
  const headers = [
    "National Rank",
    "Campus Rank",
    "Team Name",
    "Tagline",
    "Campus",
    "Verified Revenue",
    "Order Book",
    "Active Projects",
    "Demo Day Eligible",
    ...memberColumnHeaders(),
  ];
  const rows: (string | number | null)[][] = [headers];
  for (const t of teams) {
    rows.push([
      t.nationalRank,
      campusRanks.get(t.teamId) ?? "",
      t.teamName,
      t.tagline ?? "",
      t.campusName ?? "",
      t.totalRevenue,
      t.totalOrderBook,
      t.activeProjects,
      t.isDemoEligible ? "Yes" : "No",
      ...memberCells(t),
    ]);
  }
  return XLSX.utils.aoa_to_sheet(rows);
}

function buildCampusSheet(teams: LeaderboardExportTeam[]): XLSX.WorkSheet {
  // Group by campus, then assign campus rank using existing national-order
  // (which is already featured DESC, revenue DESC, id ASC). Sort campuses
  // alphabetically so the sheet is predictable.
  const byCampus = new Map<string, LeaderboardExportTeam[]>();
  for (const t of teams) {
    const key = t.campusName ?? "(No campus)";
    const arr = byCampus.get(key) ?? [];
    arr.push(t);
    byCampus.set(key, arr);
  }
  const campusNames = [...byCampus.keys()].sort((a, b) => a.localeCompare(b));

  const headers = [
    "Campus",
    "Campus Rank",
    "National Rank",
    "Team Name",
    "Verified Revenue",
    "Order Book",
    "Active Projects",
    "Demo Day Eligible",
    ...memberColumnHeaders(),
  ];
  const rows: (string | number | null)[][] = [headers];
  for (const campus of campusNames) {
    const list = byCampus.get(campus) ?? [];
    list.forEach((t, idx) => {
      rows.push([
        campus,
        idx + 1,
        t.nationalRank,
        t.teamName,
        t.totalRevenue,
        t.totalOrderBook,
        t.activeProjects,
        t.isDemoEligible ? "Yes" : "No",
        ...memberCells(t),
      ]);
    });
  }
  return XLSX.utils.aoa_to_sheet(rows);
}

function isoDateString(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function AdminLeaderboard() {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data: LeaderboardExportResponse = await getLeaderboardExport();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        buildNationalSheet(data.teams),
        "National",
      );
      XLSX.utils.book_append_sheet(
        wb,
        buildCampusSheet(data.teams),
        "Campus-wise",
      );
      const filename = `brave-leaderboard-${isoDateString(new Date())}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast({ title: "Leaderboard exported", description: filename });
    } catch (e: unknown) {
      toast({
        title: "Export failed",
        description: normalizeError(e, "Could not generate the workbook.")
          .message,
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Leaderboard
      headerExtra={
        <Button
          onClick={handleExport}
          disabled={isExporting}
          data-testid="button-export-leaderboard"
          className="w-full sm:w-auto"
        >
          {isExporting ? (
            <Spinner className="w-4 h-4 mr-2" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          Export
        </Button>
      }
    />
  );
}
