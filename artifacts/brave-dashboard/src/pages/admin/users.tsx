import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  getListUsersQueryKey,
  useListCampuses,
  useImportUsersCsv,
  type ImportUsersCsvResponse,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Users,
  Plus,
  Shield,
  Search,
  ShieldCheck,
  Mail,
  Trash2,
  Pencil,
  Upload,
  GraduationCap,
  Download,
  MoreVertical,
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { normalizeError } from "@/lib/api-error";
import * as XLSX from "xlsx";

const createUserSchema = z.object({
  formsUserId: z.string().optional(),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["admin", "coordinator", "student"]),
  campusId: z.string().optional(),
  niatId: z.string().optional(),
  batchSectionName: z.string().optional(),
});

type ProvisionedVia = "roster" | "csv_import" | "manual" | "auto_forms_sso";

type AnyUser = {
  id: string;
  formsUserId?: string | null;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "coordinator" | "student";
  campusId?: number | null;
  campusName?: string | null;
  niatId?: string | null;
  isActive: boolean;
  provisionedVia: ProvisionedVia;
};

type RoleFilter = "all" | "admin" | "coordinator" | "student";
type SourceFilter = "all" | ProvisionedVia;

const SOURCE_LABEL: Record<ProvisionedVia, string> = {
  roster: "Roster",
  csv_import: "CSV import",
  manual: "Manual",
  auto_forms_sso: "Auto (Forms SSO)",
};

// Tiny CSV parser that handles quoted fields and commas inside quotes.
// Returns an array of row objects keyed by the header row.
function parseCSV(text: string): Record<string, string>[] {
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        lines.push(row);
        row = [];
        cell = "";
      } else if (ch === "\r") {
        // ignore
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    lines.push(row);
  }
  if (lines.length === 0) return [];
  const header = lines[0].map((h) => h.trim());
  return lines
    .slice(1)
    .filter((r) => r.some((c) => c && c.trim()))
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((h, idx) => {
        obj[h] = (r[idx] ?? "").trim();
      });
      return obj;
    });
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const TEMPLATE_CSV =
  "forms_user_id,role,name,email,campus_name,niat_id,batch_section\n" +
  "853cac17-6251-4d40-8ccf-1ec1bce6e949,admin,Divyansh Mathur,divyansh.mathur@nxtwave.co.in,,,\n" +
  "00000000-0000-0000-0000-000000000001,coordinator,Coordinator Name,coord@example.com,NIAT - Chevella,,\n" +
  "00000000-0000-0000-0000-000000000002,student,Student Name,student@example.com,NIAT - Chevella,NIAT123,Section A\n";

const PAGE_SIZE = 100;

export default function AdminUsers() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [page, setPage] = useState(1);

  // Debounce search so we aren't firing a request on every keystroke.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const { data: users, isLoading } = useListUsers({
    search: search || undefined,
    role: roleFilter === "all" ? undefined : roleFilter,
    provisionedVia: sourceFilter === "all" ? undefined : sourceFilter,
    page,
    pageSize: PAGE_SIZE,
  });

  // Clamp the current page back into range when filters narrow the result set.
  useEffect(() => {
    if (!users) return;
    if (users.total === 0) {
      if (page !== 1) setPage(1);
      return;
    }
    const maxPage = Math.max(1, Math.ceil(users.total / users.pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [users, page]);
  const { data: campuses } = useListCampuses();

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const importCsv = useImportUsersCsv();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AnyUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnyUser | null>(null);
  const [editCampusId, setEditCampusId] = useState<string>("");
  const [editRole, setEditRole] = useState<"admin" | "coordinator" | "student">(
    "coordinator",
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [importResult, setImportResult] =
    useState<ImportUsersCsvResponse | null>(null);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const form = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      formsUserId: "",
      email: "",
      firstName: "",
      lastName: "",
      role: "student",
      campusId: "",
      niatId: "",
      batchSectionName: "",
    },
  });
  const role = form.watch("role");

  const onCreate = (values: z.infer<typeof createUserSchema>) => {
    if (
      (values.role === "coordinator" || values.role === "student") &&
      !values.campusId
    ) {
      toast({
        title: `Pick a campus for the ${values.role}`,
        variant: "destructive",
      });
      return;
    }
    const payload = {
      formsUserId: values.formsUserId?.trim() || null,
      email: values.email,
      firstName: values.firstName,
      lastName: values.lastName,
      role: values.role,
      campusId:
        values.role === "admin"
          ? null
          : values.campusId
            ? parseInt(values.campusId)
            : null,
      niatId: values.niatId?.trim() || null,
      batchSectionName: values.batchSectionName?.trim() || null,
      password: null,
    };
    createUser.mutate(
      { data: payload },
      {
        onSuccess: () => {
          toast({ title: "User created" });
          refresh();
          setIsCreateOpen(false);
          form.reset();
        },
        onError: (e: unknown) =>
          toast({
            title: "Failed to create user",
            description: normalizeError(e, "Something went wrong.").message,
            variant: "destructive",
          }),
      },
    );
  };

  const openEdit = (u: AnyUser) => {
    setEditTarget(u);
    setEditRole(u.role);
    setEditCampusId(u.campusId ? String(u.campusId) : "");
  };

  const onSaveEdit = () => {
    if (!editTarget) return;
    if (
      (editRole === "coordinator" || editRole === "student") &&
      !editCampusId
    ) {
      toast({
        title: `Pick a campus for the ${editRole}`,
        variant: "destructive",
      });
      return;
    }
    updateUser.mutate(
      {
        id: editTarget.id,
        data: {
          role: editRole,
          campusId: editRole === "admin" ? null : parseInt(editCampusId),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "User updated" });
          refresh();
          setEditTarget(null);
        },
        onError: (e: unknown) =>
          toast({
            title: "Update failed",
            description: normalizeError(e, "Something went wrong.").message,
            variant: "destructive",
          }),
      },
    );
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      toast({ title: "User deleted" });
      refresh();
      setDeleteTarget(null);
    } catch (e: unknown) {
      toast({
        title: "Delete failed",
        description: normalizeError(e).message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const onPickCsv = () => fileInputRef.current?.click();

  const onCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    let rows: Record<string, string>[];
    try {
      rows = parseCSV(text);
    } catch (err) {
      toast({
        title: "Could not parse CSV",
        description: String(err),
        variant: "destructive",
      });
      return;
    }
    if (rows.length === 0) {
      toast({ title: "No data rows found in the CSV", variant: "destructive" });
      return;
    }
    importCsv.mutate(
      { data: { rows: rows as any } },
      {
        onSuccess: (result) => {
          setImportResult(result);
          refresh();
        },
        onError: (err: unknown) => {
          toast({
            title: "Import failed",
            description: normalizeError(err).message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const downloadErrorReport = () => {
    if (!importResult || importResult.errors.length === 0) return;
    const lines = ["row_number,forms_user_id,error"];
    for (const e of importResult.errors) {
      const safe = (s: string) => `"${(s ?? "").replace(/"/g, '""')}"`;
      lines.push(
        `${e.rowNumber},${safe(e.forms_user_id ?? "")},${safe(e.message)}`,
      );
    }
    downloadCsv("import-errors.csv", lines.join("\n"));
  };

  const allUsers = (users?.items ?? []) as AnyUser[];
  const totalUsers = users?.total ?? 0;

  const handleExportUsers = async () => {
    // Export ALL users matching current filters, not just the visible page.
    // Loop in case the result set exceeds the API's max pageSize.
    try {
      const exportPageSize = 10000;
      const all: AnyUser[] = [];
      let exportPage = 1;
      while (true) {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (roleFilter !== "all") params.set("role", roleFilter);
        if (sourceFilter !== "all") params.set("provisionedVia", sourceFilter);
        params.set("page", String(exportPage));
        params.set("pageSize", String(exportPageSize));
        const res = await fetch(`/api/admin/users?${params.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch users for export");
        const chunk = (await res.json()) as {
          items: AnyUser[];
          total: number;
          page: number;
          pageSize: number;
        };
        all.push(...chunk.items);
        if (chunk.items.length < exportPageSize || all.length >= chunk.total)
          break;
        exportPage += 1;
      }
      if (all.length === 0) {
        toast({
          title: "Nothing to export",
          description: "The user list is empty.",
          variant: "destructive",
        });
        return;
      }
      const rows = all.map((u) => ({
        "Forms User ID": u.formsUserId ?? "",
        "First Name": u.firstName ?? "",
        "Last Name": u.lastName ?? "",
        Email: u.email,
        Role: u.role,
        Campus: u.campusName ?? "",
        Source: SOURCE_LABEL[u.provisionedVia] ?? u.provisionedVia,
        Active: u.isActive ? "Yes" : "No",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Users");
      const ts = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `users-${ts}.xlsx`);
    } catch (err) {
      const { message } = normalizeError(err);
      toast({
        title: "Export failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  // Page-level role breakdown (the totalUsers count above is the real total
  // across the whole filtered set, not just this page).
  const counts = {
    total: totalUsers,
    admin: allUsers.filter((u) => u.role === "admin").length,
    coordinator: allUsers.filter((u) => u.role === "coordinator").length,
    student: allUsers.filter((u) => u.role === "student").length,
  };

  const renderRoleBadge = (r: AnyUser["role"]) => {
    if (r === "admin")
      return (
        <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 dark:bg-purple-900 dark:text-purple-100 border-none">
          <ShieldCheck className="w-3 h-3 mr-1" /> Admin
        </Badge>
      );
    if (r === "coordinator")
      return (
        <Badge variant="outline">
          <Shield className="w-3 h-3 mr-1" /> Coordinator
        </Badge>
      );
    return (
      <Badge variant="secondary">
        <GraduationCap className="w-3 h-3 mr-1" /> Student
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground">
            All users: {counts.total} ({counts.admin} admin ·{" "}
            {counts.coordinator} coordinator · {counts.student} student)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select
            value={roleFilter}
            onValueChange={(v) => {
              setRoleFilter(v as RoleFilter);
              setPage(1);
            }}
          >
            <SelectTrigger
              className="w-[160px]"
              data-testid="select-role-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
              <SelectItem value="coordinator">Coordinators</SelectItem>
              <SelectItem value="student">Students</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={sourceFilter}
            onValueChange={(v) => {
              setSourceFilter(v as SourceFilter);
              setPage(1);
            }}
          >
            <SelectTrigger
              className="w-[180px]"
              data-testid="select-source-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="roster">Roster</SelectItem>
              <SelectItem value="csv_import">CSV import</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="auto_forms_sso">Auto (Forms SSO)</SelectItem>
            </SelectContent>
          </Select>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onCsvFile}
            className="hidden"
            data-testid="input-csv-file"
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                title="More actions"
                aria-label="More actions"
                data-testid="button-users-more-actions"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  if (!importCsv.isPending) onPickCsv();
                }}
                disabled={importCsv.isPending}
                data-testid="menu-item-import-csv"
              >
                {importCsv.isPending ? (
                  <Spinner className="w-4 h-4 mr-2" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Import CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  if (allUsers.length > 0) handleExportUsers();
                }}
                disabled={allUsers.length === 0}
                data-testid="menu-item-export-users"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-user">
                <Plus className="w-4 h-4 mr-2" /> Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Add User</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onCreate)}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="formsUserId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Forms User ID (UUID)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="00000000-0000-0000-0000-000000000000"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="student">Student</SelectItem>
                            <SelectItem value="coordinator">
                              Campus Coordinator
                            </SelectItem>
                            <SelectItem value="admin">Administrator</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {role !== "admin" && campuses && (
                    <FormField
                      control={form.control}
                      name="campusId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Assigned Campus</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select campus" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="max-h-72 overflow-y-auto">
                              {campuses.map((c) => (
                                <SelectItem key={c.id} value={c.id.toString()}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {role === "student" && (
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="niatId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>NIAT ID</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="batchSectionName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Batch / Section</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={createUser.isPending}>
                      {createUser.isPending && (
                        <Spinner className="w-4 h-4 mr-2" />
                      )}{" "}
                      Create User
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
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
                <TableHead>User</TableHead>
                <TableHead>Forms User ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allUsers.map((user) => (
                <TableRow
                  key={user.id}
                  className="hover:bg-muted/50 transition-colors"
                >
                  <TableCell>
                    <div className="font-semibold">
                      {user.firstName} {user.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Mail className="w-3 h-3" /> {user.niatId ?? user.email}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {user.formsUserId ?? "—"}
                  </TableCell>
                  <TableCell>{renderRoleBadge(user.role)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.role === "admin" ? "—" : user.campusName || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      data-testid={`badge-source-${user.id}`}
                    >
                      {SOURCE_LABEL[user.provisionedVia] ?? user.provisionedVia}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <span className="inline-flex items-center gap-1.5 text-sm text-green-600 font-medium">
                        <span className="w-2 h-2 rounded-full bg-green-600"></span>{" "}
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground font-medium">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground"></span>{" "}
                        Inactive
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          data-testid={`button-actions-${user.id}`}
                          aria-label="Open actions"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openEdit(user)}
                          data-testid={`button-edit-${user.id}`}
                        >
                          <Pencil className="w-4 h-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(user)}
                          className="text-destructive focus:text-destructive"
                          data-testid={`button-delete-${user.id}`}
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {allUsers.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-24 text-center text-muted-foreground"
                  >
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No users found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      {users && users.total > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="text-sm text-muted-foreground"
            data-testid="text-users-pagination-info"
          >
            {(() => {
              const start = (users.page - 1) * users.pageSize + 1;
              const end = Math.min(users.page * users.pageSize, users.total);
              return `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${users.total.toLocaleString()}`;
            })()}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={isLoading || users.page <= 1}
              data-testid="button-users-prev-page"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>
            <span
              className="text-sm tabular-nums"
              data-testid="text-users-page-indicator"
            >
              Page {users.page} of{" "}
              {Math.max(1, Math.ceil(users.total / users.pageSize))}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={isLoading || users.page * users.pageSize >= users.total}
              data-testid="button-users-next-page"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              Edit {editTarget?.firstName} {editTarget?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Role</label>
              <Select
                value={editRole}
                onValueChange={(v) => {
                  const next = v as "admin" | "coordinator" | "student";
                  setEditRole(next);
                  if (next === "admin") setEditCampusId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="coordinator">
                    Campus Coordinator
                  </SelectItem>
                  <SelectItem value="student">Student</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editRole !== "admin" && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Assigned Campus
                </label>
                <Select value={editCampusId} onValueChange={setEditCampusId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select campus" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72 overflow-y-auto">
                    {(campuses ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={onSaveEdit} disabled={updateUser.isPending}>
              {updateUser.isPending && <Spinner className="w-4 h-4 mr-2" />}{" "}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete user?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove{" "}
            <span className="font-semibold text-foreground">
              {deleteTarget?.firstName} {deleteTarget?.lastName}
            </span>{" "}
            ({deleteTarget?.email}) from the system. They will no longer be able
            to sign in. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Spinner className="w-4 h-4 mr-2" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import result dialog */}
      <Dialog
        open={!!importResult}
        onOpenChange={(open) => !open && setImportResult(null)}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>CSV import complete</DialogTitle>
          </DialogHeader>
          {importResult && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-md border p-3">
                  <div className="text-2xl font-bold">{importResult.total}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
                <div className="rounded-md border p-3 bg-green-50 dark:bg-green-950">
                  <div className="text-2xl font-bold text-green-700 dark:text-green-300">
                    {importResult.created}
                  </div>
                  <div className="text-xs text-muted-foreground">Created</div>
                </div>
                <div className="rounded-md border p-3 bg-blue-50 dark:bg-blue-950">
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                    {importResult.updated}
                  </div>
                  <div className="text-xs text-muted-foreground">Updated</div>
                </div>
                <div className="rounded-md border p-3 bg-red-50 dark:bg-red-950">
                  <div className="text-2xl font-bold text-red-700 dark:text-red-300">
                    {importResult.failed}
                  </div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">First errors:</div>
                  <div className="max-h-48 overflow-y-auto border rounded-md text-xs">
                    {importResult.errors.slice(0, 25).map((e, i) => (
                      <div
                        key={i}
                        className="px-3 py-2 border-b last:border-b-0"
                      >
                        <span className="font-mono text-muted-foreground">
                          row {e.rowNumber}
                        </span>{" "}
                        {e.forms_user_id ? (
                          <span className="font-mono text-muted-foreground">
                            ({e.forms_user_id})
                          </span>
                        ) : null}{" "}
                        — <span className="text-destructive">{e.message}</span>
                      </div>
                    ))}
                  </div>
                  {importResult.errors.length > 25 && (
                    <div className="text-xs text-muted-foreground">
                      … and {importResult.errors.length - 25} more
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {importResult && importResult.errors.length > 0 && (
              <Button variant="outline" onClick={downloadErrorReport}>
                <Download className="w-4 h-4 mr-2" /> Download errors
              </Button>
            )}
            <Button onClick={() => setImportResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
