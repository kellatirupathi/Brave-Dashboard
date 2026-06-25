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
import { Switch } from "@/components/ui/switch";
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
  KeyRound,
  Eye,
  EyeOff,
  Tags,
} from "lucide-react";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
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
import { PageSizeSelect } from "@/components/page-size-select";
import { CampusCombobox } from "@/components/campus-combobox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { normalizeError } from "@/lib/api-error";
import { useLocation } from "wouter";
import { useMyAdminAccess, canAccess } from "@/lib/admin-access";
import { Checkbox } from "@/components/ui/checkbox";
import {
  listCoordinatorTags,
  getCoordinatorTagAssignments,
  getUserCoordinatorTagIds,
  setUserCoordinatorTags,
} from "@/lib/coordinator-tags-api";
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
  // Auth basis for admin / coordinator. Locked to "sso" for students.
  authMethod: z.enum(["sso", "password"]).default("sso"),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
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
  profileImage?: string | null;
  isActive: boolean;
  provisionedVia: ProvisionedVia;
  // Surfaced by the API list when the row has a password_hash set.
  // Used to decide whether to show the "Change password" row action.
  hasPassword?: boolean;
  // Login tracking (surfaced by the API list).
  lastLoginAt?: string | null;
  loginCount?: number;
  // Last activity on any authenticated request (bumped on every request). A
  // non-null value = the user has logged in / used the platform at least once.
  lastSeenAt?: string | null;
  // Terms & Conditions consent. Non-null = the user has accepted.
  termsAcceptedAt?: string | null;
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
  const [campusFilter, setCampusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

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
    campusId: campusFilter === "all" ? undefined : Number(campusFilter),
    page,
    pageSize,
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
  const [, setLocation] = useLocation();
  // Current user's admin access — used to surface the super-admin-only
  // "Permissions" row action. This page is admin-only, so always enabled.
  const { data: myAccess } = useMyAdminAccess(true);
  const callerIsSuperAdmin = !!myAccess?.isSuperAdmin;
  // Per-page permission gating (default-allow): hide create/edit/delete actions
  // when a restricted admin lacks the right on the Users page. Super admins and
  // admins with no custom permissions keep full access, so existing behaviour
  // is unchanged.
  const canEditUsers = canAccess(myAccess, "/admin/users", "edit");
  const canDeleteUsers = canAccess(myAccess, "/admin/users", "delete");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AnyUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AnyUser | null>(null);
  const [editCampusId, setEditCampusId] = useState<string>("");
  const [editRole, setEditRole] = useState<"admin" | "coordinator" | "student">(
    "coordinator",
  );
  const [editFirstName, setEditFirstName] = useState<string>("");
  const [editLastName, setEditLastName] = useState<string>("");
  const [editEmail, setEditEmail] = useState<string>("");
  const [editNiatId, setEditNiatId] = useState<string>("");
  const [editProfileImage, setEditProfileImage] = useState<string>("");
  const [editIsActive, setEditIsActive] = useState<boolean>(true);
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
      authMethod: "sso",
      password: "",
      confirmPassword: "",
    },
  });
  const role = form.watch("role");
  const authMethod = form.watch("authMethod");
  // Students are SSO-only — force the toggle back to "sso" if the role
  // changes to student, so a stray "password" selection doesn't leak through.
  const effectiveAuthMethod = role === "student" ? "sso" : authMethod;
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);
  const [changePasswordTarget, setChangePasswordTarget] =
    useState<AnyUser | null>(null);

  // ----- Coordinator Tags -----
  // Catalog of available tags (for the assign modal) + the current
  // userId→tags map (for the Tag column). Both are admin-only reads.
  const { data: tagCatalog } = useQuery({
    queryKey: ["coordinator-tags"],
    queryFn: listCoordinatorTags,
  });
  const { data: tagAssignments } = useQuery({
    queryKey: ["coordinator-tag-assignments"],
    queryFn: getCoordinatorTagAssignments,
  });
  const [tagTarget, setTagTarget] = useState<AnyUser | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [loadingTagSelection, setLoadingTagSelection] = useState(false);
  const [savingTags, setSavingTags] = useState(false);

  const openTags = async (u: AnyUser) => {
    setTagTarget(u);
    setSelectedTagIds([]);
    setLoadingTagSelection(true);
    try {
      const ids = await getUserCoordinatorTagIds(u.id);
      setSelectedTagIds(ids);
    } catch (e: unknown) {
      toast({
        title: "Couldn't load current tags",
        description: normalizeError(e).message,
        variant: "destructive",
      });
    } finally {
      setLoadingTagSelection(false);
    }
  };

  const toggleTag = (id: number, checked: boolean) => {
    setSelectedTagIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((t) => t !== id),
    );
  };

  const onSaveTags = async () => {
    if (!tagTarget) return;
    setSavingTags(true);
    try {
      await setUserCoordinatorTags(tagTarget.id, selectedTagIds);
      toast({ title: "Tags updated" });
      queryClient.invalidateQueries({
        queryKey: ["coordinator-tag-assignments"],
      });
      setTagTarget(null);
    } catch (e: unknown) {
      toast({
        title: "Couldn't save tags",
        description: normalizeError(e).message,
        variant: "destructive",
      });
    } finally {
      setSavingTags(false);
    }
  };

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
    // Students are always SSO. Only admin / coordinator can be password-basis.
    const useMethod = values.role === "student" ? "sso" : values.authMethod;
    if (useMethod === "password") {
      const pwd = values.password ?? "";
      const confirm = values.confirmPassword ?? "";
      if (pwd.length < 8) {
        toast({
          title: "Password must be at least 8 characters",
          variant: "destructive",
        });
        return;
      }
      if (pwd !== confirm) {
        toast({
          title: "Passwords do not match",
          variant: "destructive",
        });
        return;
      }
    }
    const payload = {
      formsUserId:
        useMethod === "sso" ? values.formsUserId?.trim() || null : null,
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
      password: useMethod === "password" ? (values.password ?? null) : null,
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
    setEditFirstName(u.firstName ?? "");
    setEditLastName(u.lastName ?? "");
    setEditEmail(u.email ?? "");
    setEditNiatId(u.niatId ?? "");
    setEditProfileImage(u.profileImage ?? "");
    setEditIsActive(u.isActive);
  };

  const onSaveEdit = () => {
    if (!editTarget) return;
    const trimmedFirst = editFirstName.trim();
    const trimmedLast = editLastName.trim();
    const trimmedEmail = editEmail.trim();
    if (!trimmedFirst) {
      toast({ title: "First name is required", variant: "destructive" });
      return;
    }
    if (!trimmedLast) {
      toast({ title: "Last name is required", variant: "destructive" });
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
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
    const trimmedNiat = editNiatId.trim();
    const trimmedProfileImage = editProfileImage.trim();
    updateUser.mutate(
      {
        id: editTarget.id,
        data: {
          firstName: trimmedFirst,
          lastName: trimmedLast,
          email: trimmedEmail,
          niatId: trimmedNiat.length === 0 ? null : trimmedNiat,
          profileImage:
            trimmedProfileImage.length === 0 ? null : trimmedProfileImage,
          role: editRole,
          campusId: editRole === "admin" ? null : parseInt(editCampusId),
          isActive: editIsActive,
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
        // Raw value so a non-empty "Last Seen" cell == logged in at least once.
        "Last Seen": u.lastSeenAt ?? "",
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

          <CampusCombobox
            campuses={campuses ?? []}
            value={campusFilter}
            onChange={(v) => {
              setCampusFilter(v);
              setPage(1);
            }}
            testId="select-campus-filter"
          />

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
              {canEditUsers && (
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
              )}
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

          {canEditUsers && (
            <Button
              data-testid="button-add-user"
              onClick={() => setLocation("/admin/users/new")}
            >
              <Plus className="w-4 h-4 mr-2" /> Add User
            </Button>
          )}
          {/* Legacy create dialog kept dormant (never opened) — the Add User
              button now navigates to the standalone /admin/users/new page. */}
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogContent className="sm:max-w-[480px]">
              <DialogHeader>
                <DialogTitle>Add User</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onCreate)}
                  className="space-y-4"
                >
                  {effectiveAuthMethod === "sso" && (
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
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  {role !== "student" && (
                    <FormField
                      control={form.control}
                      name="authMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sign-in method</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-auth-method">
                                <SelectValue placeholder="Select sign-in method" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="sso">Forms SSO</SelectItem>
                              <SelectItem value="password">
                                Email + password
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  {effectiveAuthMethod === "password" && role !== "student" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={
                                    showCreatePassword ? "text" : "password"
                                  }
                                  autoComplete="new-password"
                                  className="pr-10"
                                  data-testid="input-create-password"
                                  {...field}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowCreatePassword((v) => !v)
                                  }
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                  aria-label={
                                    showCreatePassword
                                      ? "Hide password"
                                      : "Show password"
                                  }
                                  tabIndex={-1}
                                >
                                  {showCreatePassword ? (
                                    <EyeOff className="w-4 h-4" />
                                  ) : (
                                    <Eye className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirm password</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showCreateConfirm ? "text" : "password"}
                                  autoComplete="new-password"
                                  className="pr-10"
                                  data-testid="input-create-confirm-password"
                                  {...field}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowCreateConfirm((v) => !v)
                                  }
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                  aria-label={
                                    showCreateConfirm
                                      ? "Hide password"
                                      : "Show password"
                                  }
                                  tabIndex={-1}
                                >
                                  {showCreateConfirm ? (
                                    <EyeOff className="w-4 h-4" />
                                  ) : (
                                    <Eye className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>NIAT ID</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Forms User ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Campus ID</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead className="text-center">Logins</TableHead>
                  <TableHead className="text-center">Terms</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allUsers.map((user) => (
                  <TableRow
                    key={user.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    {/* User — name only, single line */}
                    <TableCell className="whitespace-nowrap">
                      <div
                        className="font-semibold truncate max-w-[180px]"
                        title={`${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()}
                      >
                        {user.firstName} {user.lastName}
                      </div>
                    </TableCell>
                    {/* NIAT ID — short, copyable on double-click */}
                    <TableCell className="font-mono text-xs">
                      <span
                        className="inline-block select-all truncate max-w-[120px] align-middle"
                        title={user.niatId ?? ""}
                      >
                        {user.niatId || "—"}
                      </span>
                    </TableCell>
                    {/* Email — truncate but full value selectable on double-click */}
                    <TableCell className="text-xs">
                      <span
                        className="inline-block select-all truncate max-w-[200px] align-middle"
                        title={user.email}
                      >
                        {user.email}
                      </span>
                    </TableCell>
                    {/* Forms User ID — long UUID, truncate + select-all */}
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <span
                        className="inline-block select-all truncate max-w-[160px] align-middle"
                        title={user.formsUserId ?? ""}
                      >
                        {user.formsUserId ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>{renderRoleBadge(user.role)}</TableCell>
                    {/* Tags — coordinators only. Blank for other roles. */}
                    <TableCell data-testid={`tags-${user.id}`}>
                      {user.role === "coordinator" ? (
                        (() => {
                          const tags = tagAssignments?.[user.id] ?? [];
                          if (tags.length === 0)
                            return (
                              <span className="text-muted-foreground">—</span>
                            );
                          return (
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {tags.map((t) => (
                                <Badge key={t.id} variant="outline">
                                  {t.name}
                                </Badge>
                              ))}
                            </div>
                          );
                        })()
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.role === "admin" ? "—" : user.campusName || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {user.role === "admin" ? "—" : (user.campusId ?? "—")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        data-testid={`badge-source-${user.id}`}
                      >
                        {SOURCE_LABEL[user.provisionedVia] ??
                          user.provisionedVia}
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
                    <TableCell
                      className="text-sm text-muted-foreground whitespace-nowrap"
                      data-testid={`last-login-${user.id}`}
                    >
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString("en-IN")
                        : "Never"}
                    </TableCell>
                    <TableCell
                      className="text-sm text-muted-foreground whitespace-nowrap"
                      data-testid={`last-seen-${user.id}`}
                    >
                      {user.lastSeenAt
                        ? new Date(user.lastSeenAt).toLocaleString("en-IN")
                        : "Never"}
                    </TableCell>
                    <TableCell
                      className="text-center text-sm tabular-nums"
                      data-testid={`login-count-${user.id}`}
                    >
                      {user.loginCount ?? 0}
                    </TableCell>
                    <TableCell
                      className="text-center text-sm font-medium"
                      data-testid={`terms-${user.id}`}
                    >
                      {user.termsAcceptedAt ? (
                        <span className="text-green-600">Yes</span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
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
                          {canEditUsers && (
                            <DropdownMenuItem
                              onClick={() => openEdit(user)}
                              data-testid={`button-edit-${user.id}`}
                            >
                              <Pencil className="w-4 h-4 mr-2" /> Edit
                            </DropdownMenuItem>
                          )}
                          {canEditUsers && user.role === "coordinator" && (
                            <DropdownMenuItem
                              onClick={() => openTags(user)}
                              data-testid={`button-tags-${user.id}`}
                            >
                              <Tags className="w-4 h-4 mr-2" /> Tags
                            </DropdownMenuItem>
                          )}
                          {callerIsSuperAdmin && user.role === "admin" && (
                            <DropdownMenuItem
                              onClick={() =>
                                setLocation(
                                  `/admin/users/${user.id}/permissions`,
                                )
                              }
                              data-testid={`button-permissions-${user.id}`}
                            >
                              <ShieldCheck className="w-4 h-4 mr-2" />{" "}
                              Permissions
                            </DropdownMenuItem>
                          )}
                          {user.role !== "student" &&
                            user.hasPassword &&
                            canEditUsers && (
                              <DropdownMenuItem
                                onClick={() => setChangePasswordTarget(user)}
                                data-testid={`button-change-password-${user.id}`}
                              >
                                <KeyRound className="w-4 h-4 mr-2" /> Change
                                password
                              </DropdownMenuItem>
                            )}
                          {canDeleteUsers && (
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(user)}
                              className="text-destructive focus:text-destructive"
                              data-testid={`button-delete-${user.id}`}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {allUsers.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={14}
                      className="h-24 text-center text-muted-foreground"
                    >
                      <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No users found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {users && users.total > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <PageSizeSelect
              value={pageSize}
              onChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
              testId="select-users-page-size"
            />
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
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit {editTarget?.firstName} {editTarget?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  First name
                </label>
                <Input
                  value={editFirstName}
                  onChange={(e) => setEditFirstName(e.target.value)}
                  data-testid="input-edit-firstName"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Last name
                </label>
                <Input
                  value={editLastName}
                  onChange={(e) => setEditLastName(e.target.value)}
                  data-testid="input-edit-lastName"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Email</label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                data-testid="input-edit-email"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  NIAT ID
                </label>
                <Input
                  value={editNiatId}
                  onChange={(e) => setEditNiatId(e.target.value)}
                  placeholder="Optional"
                  data-testid="input-edit-niatId"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  Profile image URL
                </label>
                <Input
                  value={editProfileImage}
                  onChange={(e) => setEditProfileImage(e.target.value)}
                  placeholder="https://…"
                  data-testid="input-edit-profileImage"
                />
              </div>
            </div>
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
                <SelectTrigger data-testid="select-edit-role">
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
                  <SelectTrigger data-testid="select-edit-campus">
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
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Active</div>
                <div className="text-xs text-muted-foreground">
                  Inactive users cannot sign in.
                </div>
              </div>
              <Switch
                checked={editIsActive}
                onCheckedChange={setEditIsActive}
                data-testid="switch-edit-isActive"
              />
            </div>
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Read-only
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">
                    Forms User ID
                  </div>
                  <div className="font-mono text-xs break-all">
                    {editTarget?.formsUserId ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    Provisioned via
                  </div>
                  <div className="text-xs">
                    {editTarget?.provisionedVia ?? "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={onSaveEdit}
              disabled={updateUser.isPending}
              data-testid="button-save-edit-user"
            >
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
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

      {/* Assign coordinator tags */}
      <Dialog
        open={!!tagTarget}
        onOpenChange={(open) => !open && setTagTarget(null)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              Tags — {tagTarget?.firstName} {tagTarget?.lastName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Select one or more tags for this campus coordinator.
            </p>
            {loadingTagSelection ? (
              <div className="flex h-20 items-center justify-center">
                <Spinner />
              </div>
            ) : !tagCatalog || tagCatalog.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No tags available. Add tags in Setup → Config first.
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1 rounded-md border p-2">
                {tagCatalog.map((tag) => {
                  const checked = selectedTagIds.includes(tag.id);
                  return (
                    <label
                      key={tag.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
                      data-testid={`tag-option-${tag.id}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleTag(tag.id, v === true)}
                      />
                      <span className="text-sm">{tag.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={onSaveTags}
              disabled={savingTags || loadingTagSelection}
              data-testid="button-save-tags"
            >
              {savingTags && <Spinner className="w-4 h-4 mr-2" />}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ChangePasswordDialog
        open={changePasswordTarget !== null}
        onOpenChange={(open) => {
          if (!open) setChangePasswordTarget(null);
        }}
        mode={
          changePasswordTarget
            ? {
                kind: "admin",
                targetUserId: changePasswordTarget.id,
                targetLabel:
                  `${changePasswordTarget.firstName} ${changePasswordTarget.lastName}`.trim() ||
                  changePasswordTarget.email,
              }
            : { kind: "admin", targetUserId: "", targetLabel: "" }
        }
      />
    </div>
  );
}
