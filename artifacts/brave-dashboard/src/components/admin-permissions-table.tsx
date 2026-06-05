// Controlled editor for a single admin's per-page permissions plus the
// "super admin" promotion toggle. Used by both the Add User page (when the new
// user is an admin) and the standalone edit-permissions page.
import {
  ADMIN_PAGES,
  FULL_PAGE_PERMISSION,
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

// The four toggleable columns, in render order. Each gets a "select/deselect
// all" checkbox in the header that drives every row's value for that field.
const COLUMNS: { field: Field; label: string }[] = [
  { field: "view", label: "View" },
  { field: "edit", label: "Edit" },
  { field: "delete", label: "Delete" },
  { field: "hidden", label: "Hide" },
];

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

  // Set one field across every page in a single change (header "select all").
  const setColumn = (field: Field, value: boolean) => {
    const next: AdminPermissions = { ...permissions };
    for (const page of ADMIN_PAGES) {
      const current = next[page.href] ?? { ...FULL_PAGE_PERMISSION };
      next[page.href] = { ...current, [field]: value };
    }
    onChange(next);
  };

  // Resolve a column's header checkbox state: all on → true, none on → false,
  // mixed → "indeterminate".
  const columnState = (field: Field): boolean | "indeterminate" => {
    let checked = 0;
    for (const page of ADMIN_PAGES) {
      const perm = permissions[page.href] ?? FULL_PAGE_PERMISSION;
      if (perm[field]) checked++;
    }
    if (checked === 0) return false;
    if (checked === ADMIN_PAGES.length) return true;
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

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[180px]">Page</TableHead>
              {COLUMNS.map((col) => (
                <TableHead key={col.field} className="text-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <span>{col.label}</span>
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
                  <TableCell className="font-medium">
                    {page.label}
                    <span className="block text-xs text-muted-foreground">
                      {page.href}
                    </span>
                  </TableCell>
                  {(["view", "edit", "delete"] as const).map((field) => (
                    <TableCell key={field} className="text-center">
                      <Checkbox
                        checked={perm[field]}
                        disabled={gridDisabled || perm.hidden}
                        onCheckedChange={(v) =>
                          updateField(page.href, field, v === true)
                        }
                        data-testid={`checkbox-${field}-${page.href}`}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="text-center">
                    <Checkbox
                      checked={perm.hidden}
                      disabled={gridDisabled}
                      onCheckedChange={(v) =>
                        updateField(page.href, "hidden", v === true)
                      }
                      data-testid={`checkbox-hidden-${page.href}`}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        <strong>View</strong> controls whether the page is reachable at all.{" "}
        <strong>Hide</strong> also removes it from the sidebar and blocks the
        URL. Leaving everything checked keeps full access (the default for every
        existing admin).
      </p>
    </div>
  );
}
