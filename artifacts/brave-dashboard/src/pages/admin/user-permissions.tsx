// Super-admin-only page to edit an existing admin's per-page permissions and
// super-admin status. Reached from the Users page row action menu and via
// /admin/users/:id/permissions.
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ArrowLeft, ScrollText } from "lucide-react";
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
      <div className="space-y-4 max-w-6xl">
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
    <div className="mx-auto w-full max-w-[1280px] space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/admin/users")}
            aria-label="Back to users"
            data-testid="button-back-users"
            className="size-8 shrink-0 rounded-full text-[#745f57] hover:bg-white hover:text-[#c53e36]"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-[#321812] sm:text-2xl">
              Admin permissions
            </h1>
            <p className="truncate text-xs text-[#8c7770] sm:text-sm">
              {data.email}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLocation("/admin/audit-log")}
          className="self-start border-[#e3d6cf] bg-white text-[#5e463e] shadow-sm hover:border-[#c53e36]/40 hover:bg-[#fff8f5] hover:text-[#b9342e] sm:self-auto"
          data-testid="button-view-audit-log"
        >
          <ScrollText className="mr-2 size-3.5" />
          View audit log
        </Button>
      </div>

      <AdminPermissionsTable
        permissions={permissions}
        onChange={setPermissions}
        isSuperAdmin={isSuperAdmin}
        onSuperAdminChange={setIsSuperAdmin}
        disabled={saving}
        variant="standalone"
      />

      <div className="flex justify-end gap-2 pb-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setLocation("/admin/users")}
          className="border-[#dfd0c8] bg-white px-5 text-[#5e463e] shadow-sm hover:bg-[#fff8f5]"
        >
          Cancel
        </Button>
        <Button
          onClick={onSave}
          disabled={saving}
          data-testid="button-save-permissions"
          className="bg-[#c53e36] px-5 text-white shadow-sm hover:bg-[#ad302b]"
        >
          {saving && <Spinner className="mr-2 size-4" />} Save changes
        </Button>
      </div>
    </div>
  );
}
