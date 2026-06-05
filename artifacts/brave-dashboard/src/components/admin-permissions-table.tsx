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
import { ShieldCheck } from "lucide-react";

type Props = {
  permissions: AdminPermissions;
  onChange: (next: AdminPermissions) => void;
  isSuperAdmin: boolean;
  onSuperAdminChange: (next: boolean) => void;
  disabled?: boolean;
};

type Field = keyof PagePermission;

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
              <TableHead className="text-center">View</TableHead>
              <TableHead className="text-center">Edit</TableHead>
              <TableHead className="text-center">Delete</TableHead>
              <TableHead className="text-center">Hide</TableHead>
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
