// Standalone "Add User" page. Replaces the old Add User dialog so that, when
// the new user is an admin AND the current user is a Super Admin, the per-page
// permission editor can be shown inline (it's too large for a dialog).
import {
  useCreateUser,
  useListCampuses,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
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
import { useLocation } from "wouter";
import {
  useMyAdminAccess,
  fullPermissions,
  saveUserPermissions,
  type AdminPermissions,
} from "@/lib/admin-access";
import { AdminPermissionsTable } from "@/components/admin-permissions-table";

const createUserSchema = z.object({
  formsUserId: z.string().optional(),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: z.enum(["admin", "coordinator", "student"]),
  campusId: z.string().optional(),
  niatId: z.string().optional(),
  batchSectionName: z.string().optional(),
  authMethod: z.enum(["sso", "password"]).default("sso"),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
});

export default function AdminUserNew() {
  const [, setLocation] = useLocation();
  const { data: campuses } = useListCampuses();
  const createUser = useCreateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: myAccess } = useMyAdminAccess(true);
  const callerIsSuperAdmin = !!myAccess?.isSuperAdmin;

  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [showCreateConfirm, setShowCreateConfirm] = useState(false);

  // Permission state — only meaningful when creating an admin as a super admin.
  const [permissions, setPermissions] =
    useState<AdminPermissions>(fullPermissions());
  const [makeSuperAdmin, setMakeSuperAdmin] = useState(false);

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
  const effectiveAuthMethod = role === "student" ? "sso" : authMethod;
  const showPermissionEditor = role === "admin" && callerIsSuperAdmin;

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
        toast({ title: "Passwords do not match", variant: "destructive" });
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
        onSuccess: async (created: unknown) => {
          // If a super admin created an admin and configured permissions,
          // persist them in a follow-up call (the create endpoint is unchanged).
          const newId = (created as { id?: string } | null)?.id;
          if (showPermissionEditor && newId) {
            try {
              await saveUserPermissions(newId, {
                isSuperAdmin: makeSuperAdmin,
                permissions,
              });
            } catch (e) {
              toast({
                title: "User created, but saving permissions failed",
                description: normalizeError(e, "Something went wrong.").message,
                variant: "destructive",
              });
            }
          }
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          toast({ title: "User created" });
          setLocation("/admin/users");
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

  return (
    <div
      className={cn(
        "space-y-6",
        showPermissionEditor ? "max-w-6xl" : "max-w-3xl",
      )}
    >
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
        <h1 className="text-2xl font-semibold">Add User</h1>
      </div>

      <Card className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onCreate)} className="space-y-6">
            <div
              className={cn(
                "grid gap-6",
                showPermissionEditor ? "lg:grid-cols-2 lg:items-start" : "",
              )}
            >
              <div className="space-y-4">
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
                                type={showCreatePassword ? "text" : "password"}
                                autoComplete="new-password"
                                className="pr-10"
                                data-testid="input-create-password"
                                {...field}
                              />
                              <button
                                type="button"
                                onClick={() => setShowCreatePassword((v) => !v)}
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
                                onClick={() => setShowCreateConfirm((v) => !v)}
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
              </div>

              {showPermissionEditor && (
                <div className="space-y-3">
                  <div>
                    <h2 className="text-lg font-semibold">Admin permissions</h2>
                    <p className="text-sm text-muted-foreground">
                      Choose what this admin can access. Leaving everything
                      checked grants full access.
                    </p>
                  </div>
                  <AdminPermissionsTable
                    permissions={permissions}
                    onChange={setPermissions}
                    isSuperAdmin={makeSuperAdmin}
                    onSuperAdminChange={setMakeSuperAdmin}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/admin/users")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createUser.isPending}>
                {createUser.isPending && <Spinner className="w-4 h-4 mr-2" />}{" "}
                Create User
              </Button>
            </div>
          </form>
        </Form>
      </Card>
    </div>
  );
}
