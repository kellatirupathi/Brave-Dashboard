// Controlled editor for a single admin's per-page permissions plus the
// "super admin" promotion toggle. Used by both the Add User page (when the new
// user is an admin) and the standalone edit-permissions page.
import { useMemo, useState } from "react";
import {
  ADMIN_PAGES,
  FULL_PAGE_PERMISSION,
  pageHasAction,
  type AdminPermissions,
  type PagePermission,
} from "@/lib/admin-access";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import {
  Activity,
  Archive,
  Bell,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  CircleX,
  ClipboardCheck,
  Download,
  Eye,
  EyeOff,
  FileBarChart,
  FileText,
  FolderKanban,
  Gauge,
  HardDrive,
  LayoutDashboard,
  ListChecks,
  Minus,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

type Props = {
  permissions: AdminPermissions;
  onChange: (next: AdminPermissions) => void;
  isSuperAdmin: boolean;
  onSuperAdminChange: (next: boolean) => void;
  disabled?: boolean;
  variant?: "default" | "standalone";
};

type Field = keyof PagePermission;

// The toggleable columns, in render order. Each gets a "select/deselect all"
// checkbox in the header that drives every row's value for that field.
//
// `optional` marks a column that only applies to SOME pages — those rows show
// "—" instead of a checkbox, because granting it would do nothing (see
// PAGE_ACTIONS). view / edit / delete / hidden apply to every page.
const COLUMNS: {
  field: Field;
  label: string;
  helper: string;
  optional?: boolean;
  Icon: LucideIcon;
}[] = [
  { field: "view", label: "View", helper: "Can view", Icon: Eye },
  { field: "edit", label: "Edit", helper: "Can edit", Icon: Pencil },
  {
    field: "approve",
    label: "Approve",
    helper: "Can approve",
    optional: true,
    Icon: CheckCircle2,
  },
  {
    field: "reject",
    label: "Reject",
    helper: "Can reject",
    optional: true,
    Icon: CircleX,
  },
  { field: "delete", label: "Delete", helper: "Can delete", Icon: Trash2 },
  {
    field: "export",
    label: "Export",
    helper: "Can export",
    optional: true,
    Icon: Download,
  },
  { field: "hidden", label: "Hide", helper: "Can hide", Icon: EyeOff },
];

const PAGE_ICONS: Array<[RegExp, LucideIcon]> = [
  [/^\/admin$/, LayoutDashboard],
  [/queue|requests/, ListChecks],
  [/teams|users|roster/, Users],
  [/projects/, FolderKanban],
  [/campus/, Building2],
  [/journal|reports/, BookOpen],
  [/leaderboard|heatmap|insights/, Gauge],
  [/demo-day|finale|votes/, ClipboardCheck],
  [/announcement|notification|popup/, Bell],
  [/audit/, Activity],
  [/config/, HardDrive],
  [/resources|reels/, Archive],
  [/chatbot/, FileText],
];

function pageIconFor(href: string): LucideIcon {
  return PAGE_ICONS.find(([pattern]) => pattern.test(href))?.[1] ?? FileBarChart;
}

// Does this row render a real checkbox for this column?
function cellApplies(href: string, field: Field): boolean {
  if (field === "approve" || field === "reject" || field === "export") {
    return pageHasAction(href, field);
  }
  return true;
}

// Header "select all" checkbox. Tri-state: filled check when every page is on,
// a minus when only some are on, empty when none. Clicking when not fully on
// selects all; clicking when fully on deselects all.
function ColumnToggle({
  state,
  disabled,
  onToggle,
  testId,
  ariaLabel,
  className,
}: {
  state: boolean | "indeterminate";
  disabled?: boolean;
  onToggle: (next: boolean) => void;
  testId: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <CheckboxPrimitive.Root
      checked={state}
      disabled={disabled}
      onCheckedChange={(v) => onToggle(v === true)}
      aria-label={ariaLabel}
      data-testid={testId}
      className={cn(
        "grid place-content-center peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        className,
      )}
    >
      <CheckboxPrimitive.Indicator className="grid place-content-center text-current">
        {state === "indeterminate" ? (
          <Minus className="h-4 w-4" />
        ) : (
          <Check className="h-4 w-4" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function AdminPermissionsTable({
  permissions,
  onChange,
  isSuperAdmin,
  onSuperAdminChange,
  disabled = false,
  variant = "default",
}: Props) {
  // While a user is a super admin, the per-page grid is irrelevant (full
  // access) so we grey it out — but we keep the stored values intact so that
  // un-checking "super admin" restores the previous fine-grained map.
  const gridDisabled = disabled || isSuperAdmin;
  const [search, setSearch] = useState("");

  const updateField = (href: string, field: Field, value: boolean) => {
    const current = permissions[href] ?? { ...FULL_PAGE_PERMISSION };
    onChange({
      ...permissions,
      [href]: { ...current, [field]: value },
    });
  };

  // Set one field across every page it applies to (header "select all").
  // Pages the column doesn't apply to are skipped — flipping a bit no route
  // reads would just make the header state lie.
  const setColumn = (field: Field, value: boolean) => {
    const next: AdminPermissions = { ...permissions };
    for (const page of ADMIN_PAGES) {
      if (!cellApplies(page.href, field)) continue;
      const current = next[page.href] ?? { ...FULL_PAGE_PERMISSION };
      next[page.href] = { ...current, [field]: value };
    }
    onChange(next);
  };

  // Resolve a column's header checkbox state: all on → true, none on → false,
  // mixed → "indeterminate". Counted only over the rows the column applies to.
  const columnState = (field: Field): boolean | "indeterminate" => {
    let checked = 0;
    let total = 0;
    for (const page of ADMIN_PAGES) {
      if (!cellApplies(page.href, field)) continue;
      total++;
      const perm = permissions[page.href] ?? FULL_PAGE_PERMISSION;
      if (perm[field]) checked++;
    }
    if (total === 0 || checked === 0) return false;
    if (checked === total) return true;
    return "indeterminate";
  };

  const visiblePages = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return ADMIN_PAGES;
    return ADMIN_PAGES.filter(
      (page) =>
        page.label.toLowerCase().includes(query) ||
        page.href.toLowerCase().includes(query),
    );
  }, [search]);

  if (variant === "standalone") {
    return (
      <div className="space-y-4">
        <section className="rounded-xl border border-[#eadfd8] bg-white px-4 py-3 shadow-[0_2px_10px_rgba(82,39,22,0.04)] sm:px-5">
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="standalone-super-admin"
              className="flex min-w-0 cursor-pointer items-start gap-3"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#fff0ed] text-[#c53e36]">
                <ShieldCheck className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#321812]">
                  Make this admin a Super Admin
                </span>
                <span className="mt-0.5 block max-w-2xl text-xs leading-5 text-[#8c7770]">
                  Super Admins have full, unrestricted access to every page and
                  can manage other admins&apos; permissions.
                </span>
              </span>
            </label>
            <Switch
              id="standalone-super-admin"
              checked={isSuperAdmin}
              onCheckedChange={(v) => onSuperAdminChange(v === true)}
              disabled={disabled}
              data-testid="checkbox-super-admin"
              className="shrink-0 data-[state=checked]:bg-[#c53e36]"
              aria-label="Make this admin a Super Admin"
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#eadfd8] bg-white shadow-[0_2px_10px_rgba(82,39,22,0.04)]">
          <div className="border-b border-[#f0e8e3] px-4 py-3 sm:px-5">
            <div className="relative max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#ad9991]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search pages or paths..."
                aria-label="Search pages or paths"
                className="h-9 w-full rounded-md border border-[#e8ddd7] bg-[#fffdfb] pl-9 pr-3 text-xs text-[#321812] outline-none transition focus:border-[#c53e36] focus:ring-2 focus:ring-[#c53e36]/10"
                data-testid="input-permission-search"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[1020px] table-fixed">
              <TableHeader className="bg-[#fffdfb]">
                <TableRow className="border-b border-[#eee5e0] hover:bg-transparent">
                  <TableHead className="w-[230px] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#806d65] sm:px-5">
                    Page
                  </TableHead>
                  <TableHead className="w-[205px] px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#806d65]">
                    Path
                  </TableHead>
                  {COLUMNS.map((col) => {
                    const Icon = col.Icon;
                    return (
                      <TableHead
                        key={col.field}
                        className="w-[84px] px-1.5 py-2 text-center align-top"
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="flex items-center gap-1 text-[11px] font-semibold normal-case tracking-normal text-[#4c342c]">
                            <Icon className="size-3 text-[#c53e36]" aria-hidden="true" />
                            {col.label}
                          </span>
                          <span className="text-[9px] font-normal normal-case tracking-normal text-[#a28e86]">
                            {col.helper}
                          </span>
                          <ColumnToggle
                            state={columnState(col.field)}
                            disabled={gridDisabled}
                            onToggle={(v) => setColumn(col.field, v)}
                            testId={`checkbox-col-${col.field}`}
                            ariaLabel={`Select all ${col.label} for every page`}
                            className="mt-1 size-3.5 rounded-[3px]"
                          />
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePages.map((page) => {
                  const perm = permissions[page.href] ?? {
                    ...FULL_PAGE_PERMISSION,
                  };
                  const PageIcon = pageIconFor(page.href);
                  return (
                    <TableRow
                      key={page.href}
                      className="border-b border-[#f1e9e5] hover:bg-[#fffaf7]"
                    >
                      <TableCell className="px-4 py-2.5 sm:px-5">
                        <div className="flex min-w-0 items-center gap-2">
                          <PageIcon
                            className="size-3.5 shrink-0 text-[#8c7770]"
                            aria-hidden="true"
                          />
                          <span className="truncate text-xs font-semibold text-[#432a22]">
                            {page.label}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="truncate px-3 py-2.5 font-mono text-[10px] text-[#a28e86]">
                        {page.href}
                      </TableCell>
                      {COLUMNS.map((col) => {
                        if (!cellApplies(page.href, col.field)) {
                          return (
                            <TableCell
                              key={col.field}
                              className="px-1.5 py-2.5 text-center text-xs text-[#b9aaa4]"
                              data-testid={`cell-na-${col.field}-${page.href}`}
                            >
                              —
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell
                            key={col.field}
                            className="px-1.5 py-2.5 text-center"
                          >
                            <Checkbox
                              checked={perm[col.field]}
                              disabled={
                                gridDisabled ||
                                (col.field !== "hidden" && perm.hidden)
                              }
                              onCheckedChange={(v) =>
                                updateField(page.href, col.field, v === true)
                              }
                              data-testid={`checkbox-${col.field}-${page.href}`}
                              className="mx-auto size-3.5 rounded-[3px] border-[#c53e36] bg-white shadow-none data-[state=checked]:bg-[#c53e36] data-[state=checked]:text-white"
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
                {visiblePages.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={2 + COLUMNS.length}
                      className="px-5 py-10 text-center text-xs text-[#8c7770]"
                    >
                      No pages match &quot;{search}&quot;.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="border-t border-[#f0e8e3] bg-[#fffdfb] px-4 py-3 text-[11px] leading-5 text-[#806d65] sm:px-5">
            <div className="grid gap-1.5 md:grid-cols-2 md:gap-x-8">
              <p>
                <strong className="font-semibold text-[#4c342c]">View</strong>{" "}
                controls whether the page is reachable at all.{" "}
                <strong className="font-semibold text-[#4c342c]">Hide</strong>{" "}
                also removes it from the sidebar and blocks the URL.
              </p>
              <p>
                <strong className="font-semibold text-[#4c342c]">
                  Approve / Reject
                </strong>{" "}
                split review decisions. Both also need{" "}
                <strong className="font-semibold text-[#4c342c]">Edit</strong>
                .
              </p>
              <p>
                <strong className="font-semibold text-[#4c342c]">Edit</strong>{" "}
                controls changes to page data.{" "}
                <strong className="font-semibold text-[#4c342c]">Export</strong>{" "}
                covers CSV / Excel downloads.
              </p>
              <p>
                <strong className="font-semibold text-[#4c342c]">—</strong>{" "}
                means the page has no such action.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer">
        <Checkbox
          checked={isSuperAdmin}
          onCheckedChange={(v) => onSuperAdminChange(v === true)}
          disabled={disabled}
          data-testid="checkbox-super-admin"
          className="mt-0.5"
        />
        <span>
          <span className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Make this admin a Super Admin
          </span>
          <span className="block text-sm text-muted-foreground">
            Super Admins have full, unrestricted access to every page and can
            manage other admins' permissions.
          </span>
        </span>
      </label>

      {/* Scrolls sideways rather than wrapping — every row stays one line. */}
      <div className="overflow-x-auto rounded-lg border">
        <Table className="min-w-[880px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[190px] whitespace-nowrap">
                Page
              </TableHead>
              <TableHead className="w-[230px] whitespace-nowrap">
                Path
              </TableHead>
              {COLUMNS.map((col) => (
                <TableHead key={col.field} className="text-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="whitespace-nowrap">{col.label}</span>
                    <ColumnToggle
                      state={columnState(col.field)}
                      disabled={gridDisabled}
                      onToggle={(v) => setColumn(col.field, v)}
                      testId={`checkbox-col-${col.field}`}
                      ariaLabel={`Select all ${col.label} for every page`}
                    />
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ADMIN_PAGES.map((page) => {
              const perm = permissions[page.href] ?? {
                ...FULL_PAGE_PERMISSION,
              };
              return (
                <TableRow key={page.href}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {page.label}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {page.href}
                  </TableCell>
                  {COLUMNS.map((col) => {
                    // Column doesn't exist on this page — show a dash so it's
                    // clear there's nothing to grant, not an unchecked box.
                    if (!cellApplies(page.href, col.field)) {
                      return (
                        <TableCell
                          key={col.field}
                          className="text-center text-muted-foreground/50"
                          data-testid={`cell-na-${col.field}-${page.href}`}
                        >
                          —
                        </TableCell>
                      );
                    }
                    return (
                      <TableCell key={col.field} className="text-center">
                        <Checkbox
                          checked={perm[col.field]}
                          disabled={
                            gridDisabled ||
                            // Hiding a page moots every other column, but the
                            // Hide box itself must stay clickable to un-hide.
                            (col.field !== "hidden" && perm.hidden)
                          }
                          onCheckedChange={(v) =>
                            updateField(page.href, col.field, v === true)
                          }
                          data-testid={`checkbox-${col.field}-${page.href}`}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>
          <strong>View</strong> controls whether the page is reachable at all.{" "}
          <strong>Hide</strong> also removes it from the sidebar and blocks the
          URL. Leaving everything checked keeps full access (the default for
          every existing admin).
        </p>
        <p>
          <strong>Approve</strong> and <strong>Reject</strong> split a review
          decision, so an admin can be allowed to approve while rejections go to
          someone else. Both also need <strong>Edit</strong>.{" "}
          <strong>Export</strong> covers the CSV / Excel downloads. A{" "}
          <span className="font-medium">—</span> means the page has no such
          action.
        </p>
      </div>
    </div>
  );
}
