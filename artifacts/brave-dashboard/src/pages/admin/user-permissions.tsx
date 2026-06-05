// Super-admin-only page to edit an existing admin's per-page permissions and
// super-admin status. Reached from the Users page row action menu and via
// /admin/users/:id/permissions.
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useParams, Redirect } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { normalizeError } from "@/lib/api-error";
import {
  useMyAdminAccess,
  fetchUserPermissions,
  saveUserPermissions,
  type AdminPermissions,
  type UserAdminPermissions,
} from "@/lib/admin-access";
import { AdminPermissionsTable } from "@/components/admin-permissions-table";

export default function AdminUserPermissions() {
  const params = useParams();
  const userId = params.id ?? "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: myAccess, isLoading: accessLoading } = useMyAdminAccess(true);

  const {
    data,
    isLoading: dataLoading,
    isError,
  } = useQuery<UserAdminPermissions>({
    queryKey: ["admin-permissions", userId],
    queryFn: () => fetchUserPermissions(userId),
    enabled: !!userId && myAccess?.isSuperAdmin === true,
    retry: false,
  });

  const [permissions, setPermissions] = useState<AdminPermissions>({});
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setPermissions(data.permissions);
      setIsSuperAdmin(data.isSuperAdmin);
    }
  }, [data]);

  // Gate: only super admins may view this page.
  if (!accessLoading && myAccess && !myAccess.isSuperAdmin) {
    return <Redirect to="/admin/users" />;
  }

  if (accessLoading || dataLoading) {
    return (
      <div className="min-h-[40vh] w-full flex items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Button variant="ghost" onClick={() => setLocation("/admin/users")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to users
        </Button>
        <Card className="p-6">
          <p className="text-destructive">Could not load this user.</p>
        </Card>
      </div>
    );
  }

  const onSave = async () => {
    setSaving(true);
    try {
      const updated = await saveUserPermissions(userId, {
        isSuperAdmin,
        permissions,
      });
      setPermissions(updated.permissions);
      setIsSuperAdmin(updated.isSuperAdmin);
      queryClient.invalidateQueries({
        queryKey: ["admin-permissions", userId],
      });
      // The edited user might be the current user — refresh own access too.
      queryClient.invalidateQueries({ queryKey: ["admin-access-me"] });
      toast({ title: "Permissions saved" });
    } catch (e) {
      toast({
        title: "Failed to save permissions",
        description: normalizeError(e, "Something went wrong.").message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/admin/users")}
          aria-label="Back to users"
          data-testid="button-back-users"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Admin permissions</h1>
          <p className="text-sm text-muted-foreground">{data.email}</p>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <AdminPermissionsTable
          permissions={permissions}
          onChange={setPermissions}
          isSuperAdmin={isSuperAdmin}
          onSuperAdminChange={setIsSuperAdmin}
          disabled={saving}
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation("/admin/users")}
          >
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving} data-testid="button-save-permissions">
            {saving && <Spinner className="w-4 h-4 mr-2" />} Save
          </Button>
        </div>
      </Card>
    </div>
  );
}
