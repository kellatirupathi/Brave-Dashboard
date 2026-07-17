// Controlled editor for a single admin's per-page permissions plus the
// "super admin" promotion toggle. Used by both the Add User page (when the new
// user is an admin) and the standalone edit-permissions page.
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
import { Check, Minus, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  permissions: AdminPermissions;
  onChange: (next: AdminPermissions) => void;
  isSuperAdmin: boolean;
  onSuperAdminChange: (next: boolean) => void;
  disabled?: boolean;
};

type Field = keyof PagePermission;

// The toggleable columns, in render order. Each gets a "select/deselect all"
// checkbox in the header that drives every row's value for that field.
//
// `optional` marks a column that only applies to SOME pages — those rows show
// "—" instead of a checkbox, because granting it would do nothing (see
// PAGE_ACTIONS). view / edit / delete / hidden apply to every page.
const COLUMNS: { field: Field; label: string; optional?: boolean }[] = [
  { field: "view", label: "View" },
  { field: "edit", label: "Edit" },
  { field: "approve", label: "Approve", optional: true },
  { field: "reject", label: "Reject", optional: true },
  { field: "delete", label: "Delete" },
  { field: "export", label: "Export", optional: true },
  { field: "hidden", label: "Hide" },
];

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
}: {
  state: boolean | "indeterminate";
  disabled?: boolean;
  onToggle: (next: boolean) => void;
  testId: string;
  ariaLabel: string;
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
}: Props) {
  // While a user is a super admin, the per-page grid is irrelevant (full
  // access) so we grey it out — but we keep the stored values intact so that
  // un-checking "super admin" restores the previous fine-grained map.
  const gridDisabled = disabled || isSuperAdmin;

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
