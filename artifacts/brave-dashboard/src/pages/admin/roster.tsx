import {
  useListRosterEntries,
  listRosterEntries,
  useAddRosterEntry,
  getListRosterEntriesQueryKey,
  useListAccessRequests,
  useUpdateAccessRequest,
  getListAccessRequestsQueryKey,
  useBulkImportRoster,
  useUpdateRosterEntry,
  useClearAllRoster,
  getListUsersQueryKey,
  useListCampuses,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ClipboardList,
  Plus,
  Upload,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  Pencil,
  Trash2,
  MoreVertical,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";

const CAMPUSES = [
  "AMET University",
  "Ajeenkya DY Patil University",
  "Annamacharya University",
  "Aurora Deemed University",
  "Chaitanya – Deemed to be University",
  "Chalapathi Institute of Engineering and Technology",
  "Chalapathi Institute of Technology, Autonomous",
  "Crescent University",
  "Malla Reddy Vishwavidyapeeth",
  "NIAT - Chevella",
  "NIAT - KKH",
  "NRI Institute of Technology",
  "NSRIT - Nadimpalli Satyanarayana Raju Institute of Technology",
  "Noida International University",
  "S-VYASA University",
  "Sanjay Ghodawat University",
  "Takshashila University",
  "Vivekananda Global University",
  "Yenepoya University",
];

const IMPORT_CHUNK_SIZE = 300;

type RosterRow = {
  id: number;
  studentId: string;
  fullName: string;
  email?: string | null;
  campusName: string;
  niatId?: string | null;
  batchSectionName?: string | null;
  isWhitelisted: boolean;
};

type ImportStudent = {
  studentUserId: string;
  studentName: string;
  niatId: string;
  instituteName: string;
  batchSectionName: string;
  email?: string;
};

const PAGE_SIZE = 100;
const ALL_CAMPUSES = "__all__";

export default function AdminRoster() {
  const [searchInput, setSearchInput] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [campusFilter, setCampusFilter] = useState<string>(ALL_CAMPUSES);
  const [page, setPage] = useState(1);

  // Debounce the search input so we aren't firing a request on every keystroke.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchQ(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const campusIdParam =
    campusFilter === ALL_CAMPUSES ? undefined : Number(campusFilter);

  const { data: campusOptions = [] } = useListCampuses();

  const { data: roster, isLoading } = useListRosterEntries({
    q: searchQ || undefined,
    campusId: campusIdParam,
    page,
    pageSize: PAGE_SIZE,
  });

  // After the server responds, if the current page is now past the last page
  // (e.g. filters narrowed the result set while the user was deep in pagination),
  // clamp back to the last valid page so we never show "Showing 401–500 of 12".
  useEffect(() => {
    if (!roster) return;
    if (roster.total === 0) {
      if (page !== 1) setPage(1);
      return;
    }
    const maxPage = Math.max(1, Math.ceil(roster.total / roster.pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [roster, page]);

  const { data: accessRequests, isLoading: requestsLoading } =
    useListAccessRequests({});
  const addEntry = useAddRosterEntry();
  const bulkImport = useBulkImportRoster();
  const updateEntry = useUpdateRosterEntry();
  const updateRequest = useUpdateAccessRequest();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // Add single student form
  const [studentId, setStudentId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [campusName, setCampusName] = useState("");
  const [niatId, setNiatId] = useState("");
  const [batchSectionName, setBatchSectionName] = useState("");

  // Edit / delete state
  const [editTarget, setEditTarget] = useState<RosterRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RosterRow | null>(null);
  const [isDeletingRoster, setIsDeletingRoster] = useState(false);

  // Bulk-select state for the roster table
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // "Delete all roster entries" — destructive, type-to-confirm.
  const [isClearAllOpen, setIsClearAllOpen] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const clearAllRoster = useClearAllRoster();
  const CLEAR_PHRASE = "DELETE ALL ROSTER";
  const [editStudentId, setEditStudentId] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editCampusName, setEditCampusName] = useState("");
  const [editNiatId, setEditNiatId] = useState("");
  const [editBatchSection, setEditBatchSection] = useState("");
  const [editIsWhitelisted, setEditIsWhitelisted] = useState(true);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: getListRosterEntriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    addEntry.mutate(
      {
        data: {
          studentId,
          fullName,
          email: email || null,
          campusName,
          niatId: niatId || null,
          batchSectionName: batchSectionName || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Student added to roster" });
          refreshAll();
          setIsAddOpen(false);
          setStudentId("");
          setFullName("");
          setEmail("");
          setCampusName("");
          setNiatId("");
          setBatchSectionName("");
        },
        onError: (e: any) => {
          const status = e?.response?.status ?? e?.status;
          if (status === 409) {
            toast({
              title: "Duplicate Student User ID",
              description:
                "A student with this Student User ID already exists.",
              variant: "destructive",
            });
            return;
          }
          toast({
            title: "Failed to add student",
            description: e?.data?.error ?? e?.message ?? "Server error",
            variant: "destructive",
          });
        },
      },
    );
  };

  const openEdit = (r: RosterRow) => {
    setEditTarget(r);
    setEditStudentId(r.studentId ?? "");
    setEditFullName(r.fullName ?? "");
    setEditEmail(r.email ?? "");
    setEditCampusName(r.campusName ?? "");
    setEditNiatId(r.niatId ?? "");
    setEditBatchSection(r.batchSectionName ?? "");
    setEditIsWhitelisted(r.isWhitelisted);
  };

  const handleSaveEdit = () => {
    if (!editTarget) return;
    updateEntry.mutate(
      {
        id: editTarget.id,
        data: {
          studentId: editStudentId,
          fullName: editFullName,
          email: editEmail || null,
          campusName: editCampusName,
          niatId: editNiatId || null,
          batchSectionName: editBatchSection || null,
          isWhitelisted: editIsWhitelisted,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Roster entry updated" });
          refreshAll();
          setEditTarget(null);
        },
        onError: (e: any) =>
          toast({
            title: "Update failed",
            description: e?.data?.error ?? e?.message ?? "Server error",
            variant: "destructive",
          }),
      },
    );
  };

  // ---- Bulk select / bulk delete ----
  const visibleIds = roster?.items.map((r) => r.id) ?? [];
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedIds.has(id));
  const headerCheckboxState: boolean | "indeterminate" = allVisibleSelected
    ? true
    : someVisibleSelected
      ? "indeterminate"
      : false;

  const toggleRow = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const id of visibleIds) next.add(id);
      } else {
        for (const id of visibleIds) next.delete(id);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!roster) return;
    const present = new Set(roster.items.map((r) => r.id));
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<number>();
      for (const id of prev) {
        if (present.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [roster]);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/admin/roster/${id}`, {
            method: "DELETE",
            credentials: "include",
          }).then((res) => {
            if (!res.ok) throw new Error(`Failed for id ${id} (${res.status})`);
            return id;
          }),
        ),
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.length - succeeded;
      if (failed === 0) {
        toast({
          title: `Deleted ${succeeded} student${succeeded === 1 ? "" : "s"}`,
        });
      } else if (succeeded === 0) {
        toast({
          title: "Bulk delete failed",
          description: `All ${failed} delete${failed === 1 ? "" : "s"} failed.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Partial delete",
          description: `${succeeded} deleted, ${failed} failed.`,
          variant: "destructive",
        });
      }
      setIsBulkDeleteOpen(false);
      setSelectedIds(new Set());
      refreshAll();
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleClearAll = () => {
    if (clearConfirmText.trim() !== CLEAR_PHRASE) return;
    clearAllRoster.mutate(
      { data: { confirm: CLEAR_PHRASE } },
      {
        onSuccess: (resp) => {
          toast({
            title: "Roster cleared",
            description: `${resp.deleted} roster ${resp.deleted === 1 ? "entry" : "entries"} permanently deleted.`,
          });
          setIsClearAllOpen(false);
          setClearConfirmText("");
          setSelectedIds(new Set());
          refreshAll();
        },
        onError: (e: any) =>
          toast({
            title: "Failed to clear roster",
            description: e?.data?.error ?? e?.message ?? "Server error",
            variant: "destructive",
          }),
      },
    );
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeletingRoster(true);
    try {
      const res = await fetch(`/api/admin/roster/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      toast({ title: "Roster entry deleted" });
      refreshAll();
      setDeleteTarget(null);
    } catch (e: any) {
      toast({
        title: "Delete failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setIsDeletingRoster(false);
    }
  };

  const [isExporting, setIsExporting] = useState(false);
  const handleExportRoster = async () => {
    if ((roster?.total ?? 0) === 0) {
      toast({
        title: "Nothing to export",
        description: "The roster is empty.",
        variant: "destructive",
      });
      return;
    }
    setIsExporting(true);
    try {
      // Pull every row that matches the current filters, not just the visible
      // page. Loop in case the result set exceeds the API's max pageSize.
      const exportPageSize = 10000;
      type RosterItem = NonNullable<typeof roster>["items"][number];
      const allItems: RosterItem[] = [];
      let exportPage = 1;
      while (true) {
        const chunk = await listRosterEntries({
          q: searchQ || undefined,
          campusId: campusIdParam,
          page: exportPage,
          pageSize: exportPageSize,
        });
        allItems.push(...chunk.items);
        if (
          chunk.items.length < exportPageSize ||
          allItems.length >= chunk.total
        ) {
          break;
        }
        exportPage += 1;
      }
      const rows = allItems.map((r) => ({
        "Student User ID": r.studentId ?? "",
        "Student Name": r.fullName ?? "",
        "NIAT ID": r.niatId ?? "",
        "Institute Name": r.campusName ?? "",
        "Batch Section Name": r.batchSectionName ?? "",
        "Email": r.email ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Roster");
      const ts = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `roster-${ts}.xlsx`);
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message ?? "Could not download roster.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const inputEl = e.target;
    if (!file) return;
    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      let progressToast: ReturnType<typeof toast> | null = null;

      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, {
          defval: "",
        });

        const students: ImportStudent[] = rows
          .map((row) => {
            const emailValue = String(
              row["Email"] || row["email"] || "",
            ).trim();
            return {
              studentUserId: String(
                row["Student User ID"] || row["studentUserId"] || "",
              ).trim(),
              studentName: String(
                row["Student Name"] || row["studentName"] || "",
              ).trim(),
              niatId: String(row["NIAT ID"] || row["niatId"] || "").trim(),
              instituteName: String(
                row["Institute Name"] || row["instituteName"] || "",
              ).trim(),
              batchSectionName: String(
                row["Batch Section Name"] || row["batchSectionName"] || "",
              ).trim(),
              ...(emailValue ? { email: emailValue } : {}),
            };
          })
          // Student User ID is the only mandatory column. Rows missing it are
          // dropped here; rows missing any other column are kept and imported
          // with whatever cells do have values.
          .filter((s) => s.studentUserId);

        if (students.length === 0) {
          toast({
            title: "No valid rows found in the file",
            description:
              "Every row needs a Student User ID. Other columns (Student Name, NIAT ID, Institute Name, Batch Section Name, Email) are optional.",
            variant: "destructive",
          });
          return;
        }

        const total = students.length;
        let inserted = 0;
        let skipped = 0;
        let processed = 0;

        progressToast = toast({
          title: "Importing roster",
          description: `0 / ${total} students…`,
        });

        for (let i = 0; i < total; i += IMPORT_CHUNK_SIZE) {
          const chunk = students.slice(i, i + IMPORT_CHUNK_SIZE);
          try {
            const result = await bulkImport.mutateAsync({
              data: { students: chunk },
            });
            inserted += result.inserted;
            skipped += result.skipped;
            processed += chunk.length;

            progressToast.update({
              id: progressToast.id,
              title: "Importing roster",
              description: `${processed} / ${total} students…`,
            });
          } catch (chunkErr) {
            const fromRow = i + 1;
            const toRow = i + chunk.length;
            progressToast.update({
              id: progressToast.id,
              title: "Import stopped",
              description: `Failed at rows ${fromRow}–${toRow}. ${inserted} added, ${skipped} skipped before the error. ${total - processed - chunk.length} not attempted.`,
              variant: "destructive",
            });
            return;
          }
        }

        progressToast.update({
          id: progressToast.id,
          title: "Import complete",
          description: `${inserted} students added, ${skipped} skipped (duplicates).`,
        });
      } catch {
        if (progressToast) {
          progressToast.update({
            id: progressToast.id,
            title: "Failed to read file",
            description: "Make sure it is a valid .xlsx or .csv file",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Failed to read file",
            description: "Make sure it is a valid .xlsx or .csv file",
            variant: "destructive",
          });
        }
      } finally {
        queryClient.invalidateQueries({
          queryKey: getListRosterEntriesQueryKey(),
        });
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        setIsImporting(false);
        inputEl.value = "";
      }
    };

    reader.onerror = () => {
      toast({ title: "Failed to read file", variant: "destructive" });
      setIsImporting(false);
      inputEl.value = "";
    };

    reader.readAsBinaryString(file);
  };

  const handleApproveReject = (id: number, status: "approved" | "rejected") => {
    updateRequest.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast({
            title:
              status === "approved" ? "Request approved" : "Request rejected",
          });
          queryClient.invalidateQueries({
            queryKey: getListAccessRequestsQueryKey(),
          });
        },
        onError: () =>
          toast({ title: "Failed to update request", variant: "destructive" }),
      },
    );
  };

  const pendingCount =
    accessRequests?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Student Roster</h1>
          <p className="text-muted-foreground">
            Manage the master list of enrolled students
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileImport}
            className="hidden"
          />
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              onClick={() => setIsBulkDeleteOpen(true)}
              data-testid="button-bulk-delete-roster"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete selected ({selectedIds.size})
            </Button>
          )}

          <Button
            variant="outline"
            onClick={handleExportRoster}
            disabled={
              !roster || roster.total === 0 || isExporting
            }
            title="Download the listed roster as an Excel file"
            data-testid="button-export-roster"
          >
            {isExporting ? (
              <Spinner className="w-4 h-4 mr-2" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            Export
          </Button>

          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? (
              <Spinner className="w-4 h-4 mr-2" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Import Excel
          </Button>

          <Button
            variant="destructive"
            onClick={() => setIsClearAllOpen(true)}
            disabled={!roster || roster.total === 0}
            title="Permanently remove every roster entry"
            data-testid="button-clear-all-roster"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete all
          </Button>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" /> Add Student
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add to Roster</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Student User ID
                    </label>
                    <Input
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">NIAT ID</label>
                    <Input
                      value={niatId}
                      onChange={(e) => setNiatId(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Full Name</label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Email (optional)
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Campus</label>
                  <Select
                    value={campusName}
                    onValueChange={setCampusName}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select campus" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {CAMPUSES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Batch / Section</label>
                  <Input
                    value={batchSectionName}
                    onChange={(e) => setBatchSectionName(e.target.value)}
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={addEntry.isPending}>
                    {addEntry.isPending && <Spinner className="w-4 h-4 mr-2" />}{" "}
                    Save
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster">
            Enrolled Students {roster ? `(${roster.total})` : ""}
          </TabsTrigger>
          <TabsTrigger value="requests">
            Access Requests
            {pendingCount > 0 && (
              <Badge className="ml-2 bg-amber-500 text-white text-xs px-1.5 py-0">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, email, student ID, NIAT ID, batch, or campus"
                className="pl-9"
                data-testid="input-roster-search"
              />
            </div>
            <Select
              value={campusFilter}
              onValueChange={(v) => {
                setCampusFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger
                className="sm:w-64"
                data-testid="select-roster-campus-filter"
              >
                <SelectValue placeholder="All campuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CAMPUSES}>All campuses</SelectItem>
                {campusOptions.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            {isLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 px-2">
                      <Checkbox
                        checked={headerCheckboxState}
                        onCheckedChange={(c) => toggleAllVisible(c === true)}
                        aria-label="Select all rows"
                        data-testid="checkbox-select-all-roster"
                      />
                    </TableHead>
                    <TableHead className="min-w-[280px]">Student User ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>NIAT ID</TableHead>
                    <TableHead>Campus</TableHead>
                    <TableHead>Batch / Section</TableHead>
                    <TableHead className="w-[180px]">Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster?.items.map((entry) => (
                    <TableRow
                      key={entry.id}
                      data-state={
                        selectedIds.has(entry.id) ? "selected" : undefined
                      }
                    >
                      <TableCell className="w-10 px-2">
                        <Checkbox
                          checked={selectedIds.has(entry.id)}
                          onCheckedChange={(c) =>
                            toggleRow(entry.id, c === true)
                          }
                          aria-label={`Select ${entry.fullName}`}
                          data-testid={`checkbox-roster-${entry.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {entry.studentId || "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {entry.fullName}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.niatId || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.campusName}
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.batchSectionName || "—"}
                      </TableCell>
                      <TableCell
                        className="text-sm text-muted-foreground max-w-[180px] truncate"
                        title={entry.email ?? undefined}
                      >
                        {entry.email || "—"}
                      </TableCell>
                      <TableCell>
                        {entry.isWhitelisted ? (
                          <Badge className="bg-green-500 hover:bg-green-600">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              data-testid={`button-actions-roster-${entry.id}`}
                              aria-label="Open actions"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => openEdit(entry as RosterRow)}
                              data-testid={`button-edit-roster-${entry.id}`}
                            >
                              <Pencil className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(entry as RosterRow)}
                              className="text-destructive focus:text-destructive"
                              data-testid={`button-delete-roster-${entry.id}`}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {roster?.items.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="h-24 text-center text-muted-foreground"
                      >
                        <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        {searchQ || campusFilter !== ALL_CAMPUSES
                          ? "No matching roster entries. Try clearing the search or campus filter."
                          : `No students on roster. Use "Import Excel" or "Add Student" to populate it.`}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </Card>

          {roster && roster.total > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div
                className="text-sm text-muted-foreground"
                data-testid="text-roster-pagination-info"
              >
                {(() => {
                  const start = (roster.page - 1) * roster.pageSize + 1;
                  const end = Math.min(
                    roster.page * roster.pageSize,
                    roster.total,
                  );
                  return `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${roster.total.toLocaleString()}`;
                })()}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={isLoading || roster.page <= 1}
                  data-testid="button-roster-prev-page"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <span
                  className="text-sm tabular-nums"
                  data-testid="text-roster-page-indicator"
                >
                  Page {roster.page} of{" "}
                  {Math.max(1, Math.ceil(roster.total / roster.pageSize))}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={
                    isLoading ||
                    roster.page * roster.pageSize >= roster.total
                  }
                  data-testid="button-roster-next-page"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="requests" className="mt-4">
          <Card>
            {requestsLoading ? (
              <div className="flex h-64 items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>NIAT ID</TableHead>
                    <TableHead>Campus</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessRequests?.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">
                        {req.fullName}
                      </TableCell>
                      <TableCell className="text-sm">{req.email}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {req.niatId || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {req.campusName}
                      </TableCell>
                      <TableCell className="text-sm">
                        {req.batch || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(req.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                      </TableCell>
                      <TableCell>
                        {req.status === "pending" && (
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-amber-600 gap-1"
                          >
                            <Clock className="w-3 h-3" /> Pending
                          </Badge>
                        )}
                        {req.status === "approved" && (
                          <Badge className="bg-green-500 hover:bg-green-600 gap-1">
                            <CheckCircle className="w-3 h-3" /> Approved
                          </Badge>
                        )}
                        {req.status === "rejected" && (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="w-3 h-3" /> Rejected
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {req.status === "pending" && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                              onClick={() =>
                                handleApproveReject(req.id, "approved")
                              }
                              disabled={updateRequest.isPending}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-red-400 hover:bg-red-500 text-white"
                              onClick={() =>
                                handleApproveReject(req.id, "rejected")
                              }
                              disabled={updateRequest.isPending}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {accessRequests?.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No access requests yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit roster dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit roster entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Student User ID</label>
                <Input
                  value={editStudentId}
                  onChange={(e) => setEditStudentId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">NIAT ID</label>
                <Input
                  value={editNiatId}
                  onChange={(e) => setEditNiatId(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Campus</label>
              <Select value={editCampusName} onValueChange={setEditCampusName}>
                <SelectTrigger>
                  <SelectValue placeholder="Select campus" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {CAMPUSES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Batch / Section</label>
              <Input
                value={editBatchSection}
                onChange={(e) => setEditBatchSection(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-active"
                checked={editIsWhitelisted}
                onChange={(e) => setEditIsWhitelisted(e.target.checked)}
              />
              <label htmlFor="edit-active" className="text-sm">
                Active (whitelisted for sign-in)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateEntry.isPending}>
              {updateEntry.isPending && <Spinner className="w-4 h-4 mr-2" />}{" "}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete roster confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete roster entry?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove{" "}
            <span className="font-semibold text-foreground">
              {deleteTarget?.fullName}
            </span>{" "}
            from the roster
            <span className="block mt-1">
              and also delete their student user account, so they will no longer
              be able to sign in.
            </span>
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeletingRoster}
            >
              {isDeletingRoster && <Spinner className="w-4 h-4 mr-2" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete-all-roster confirmation (type-to-confirm) */}
      <Dialog
        open={isClearAllOpen}
        onOpenChange={(open) => {
          if (clearAllRoster.isPending) return;
          setIsClearAllOpen(open);
          if (!open) setClearConfirmText("");
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Delete every roster entry?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              This will permanently delete{" "}
              <span className="font-semibold">
                all {(roster?.total ?? 0).toLocaleString("en-IN")} roster{" "}
                {roster?.total === 1 ? "entry" : "entries"}
              </span>
              . Linked user accounts, teams, and progress will{" "}
              <span className="font-semibold">not</span> be deleted, but those
              students will lose campus eligibility until re-added.
            </p>
            <p className="text-muted-foreground">
              Type{" "}
              <span className="font-mono font-semibold text-destructive">
                {CLEAR_PHRASE}
              </span>{" "}
              below to confirm.
            </p>
            <Input
              value={clearConfirmText}
              onChange={(e) => setClearConfirmText(e.target.value)}
              placeholder={CLEAR_PHRASE}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={clearAllRoster.isPending}
              data-testid="input-clear-roster-confirm"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsClearAllOpen(false);
                setClearConfirmText("");
              }}
              disabled={clearAllRoster.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAll}
              disabled={
                clearAllRoster.isPending ||
                clearConfirmText.trim() !== CLEAR_PHRASE
              }
              data-testid="button-confirm-clear-roster"
            >
              {clearAllRoster.isPending && (
                <Spinner className="w-4 h-4 mr-2" />
              )}
              Delete all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <Dialog
        open={isBulkDeleteOpen}
        onOpenChange={(open) => !isBulkDeleting && setIsBulkDeleteOpen(open)}
      >
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size} roster{" "}
              {selectedIds.size === 1 ? "entry" : "entries"}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove the selected{" "}
            {selectedIds.size === 1 ? "student" : "students"} from the roster
            <span className="block mt-1">
              and also delete the linked student user accounts, so they will no
              longer be able to sign in.
            </span>
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBulkDeleteOpen(false)}
              disabled={isBulkDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting || selectedIds.size === 0}
              data-testid="button-confirm-bulk-delete"
            >
              {isBulkDeleting && <Spinner className="w-4 h-4 mr-2" />} Delete{" "}
              {selectedIds.size}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
