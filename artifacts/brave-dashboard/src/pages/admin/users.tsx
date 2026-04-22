import { useListUsers, useCreateUser, useUpdateUser, getListUsersQueryKey, useListCampuses } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Users, Plus, Shield, Search, ShieldCheck, Mail, ShieldOff, Trash2, Pencil } from "lucide-react";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  role: z.enum(["admin", "coordinator"]),
  campusId: z.string().optional(),
  password: z.string().min(8),
});

type StaffUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "coordinator" | "student";
  campusId?: number | null;
  campusName?: string | null;
  isActive: boolean;
};

export default function AdminUsers() {
  const [search, setSearch] = useState("");
  const { data: users, isLoading } = useListUsers({ search: search || undefined });
  const { data: campuses } = useListCampuses();

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffUser | null>(null);
  const [editCampusId, setEditCampusId] = useState<string>("");
  const [editRole, setEditRole] = useState<"admin" | "coordinator">("coordinator");
  const [isDeleting, setIsDeleting] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const form = useForm<z.infer<typeof createUserSchema>>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: "", firstName: "", lastName: "", role: "coordinator", password: "", campusId: "" },
  });
  const role = form.watch("role");

  const onCreate = (values: z.infer<typeof createUserSchema>) => {
    if (values.role === "coordinator" && !values.campusId) {
      toast({ title: "Pick a campus for the coordinator", variant: "destructive" });
      return;
    }
    const payload = {
      ...values,
      campusId: values.campusId && values.role === "coordinator" ? parseInt(values.campusId) : undefined,
    };
    createUser.mutate({ data: payload }, {
      onSuccess: () => {
        toast({ title: "User created" });
        refresh();
        setIsCreateOpen(false);
        form.reset();
      },
      onError: (e: any) => toast({ title: "Failed to create user", description: e.message, variant: "destructive" }),
    });
  };

  const openEdit = (u: StaffUser) => {
    setEditTarget(u);
    setEditRole(u.role === "admin" ? "admin" : "coordinator");
    setEditCampusId(u.campusId ? String(u.campusId) : "");
  };

  const onSaveEdit = () => {
    if (!editTarget) return;
    if (editRole === "coordinator" && !editCampusId) {
      toast({ title: "Pick a campus for the coordinator", variant: "destructive" });
      return;
    }
    updateUser.mutate(
      {
        id: editTarget.id,
        data: {
          role: editRole,
          campusId: editRole === "coordinator" ? parseInt(editCampusId) : null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "User updated" });
          refresh();
          setEditTarget(null);
        },
        onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
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
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const staff = (users ?? []).filter((u: any) => u.role !== "student") as StaffUser[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Staff Users</h1>
          <p className="text-muted-foreground">Manage administrators and campus coordinators</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-staff"><Plus className="w-4 h-4 mr-2" /> Add Staff</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add Staff Member</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onCreate)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="firstName" render={({ field }) => (
                      <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="lastName" render={({ field }) => (
                      <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem><FormLabel>Temporary Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="role" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="coordinator">Campus Coordinator</SelectItem>
                          <SelectItem value="admin">Administrator</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  {role === "coordinator" && campuses && (
                    <FormField control={form.control} name="campusId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assigned Campus</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {campuses.map((c) => (
                              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  )}
                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={createUser.isPending}>
                      {createUser.isPending && <Spinner className="w-4 h-4 mr-2" />} Create User
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
          <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((user) => (
                <TableRow key={user.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell>
                    <div className="font-semibold">{user.firstName} {user.lastName}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Mail className="w-3 h-3" /> {user.email}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.role === "admin" ? (
                      <Badge variant="default" className="bg-purple-100 text-purple-800 hover:bg-purple-100 dark:bg-purple-900 dark:text-purple-100 border-none"><ShieldCheck className="w-3 h-3 mr-1" /> Admin</Badge>
                    ) : (
                      <Badge variant="outline"><Shield className="w-3 h-3 mr-1" /> Coordinator</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.campusName || "-"}</TableCell>
                  <TableCell>
                    {user.isActive ? (
                      <span className="inline-flex items-center gap-1.5 text-sm text-green-600 font-medium">
                        <span className="w-2 h-2 rounded-full bg-green-600"></span> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground font-medium">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground"></span> Inactive
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(user)} data-testid={`button-edit-${user.id}`}>
                        <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(user)}
                        data-testid={`button-delete-${user.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {staff.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No staff users found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit {editTarget?.firstName} {editTarget?.lastName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Role</label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as "admin" | "coordinator")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin"><span className="inline-flex items-center"><ShieldCheck className="w-3 h-3 mr-2" /> Administrator</span></SelectItem>
                  <SelectItem value="coordinator"><span className="inline-flex items-center"><Shield className="w-3 h-3 mr-2" /> Campus Coordinator</span></SelectItem>
                </SelectContent>
              </Select>
              {editTarget?.role === "admin" && editRole === "coordinator" && (
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <ShieldOff className="w-3 h-3" /> Removes admin privileges from this user.
                </p>
              )}
            </div>
            {editRole === "coordinator" && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Assigned Campus</label>
                <Select value={editCampusId} onValueChange={setEditCampusId}>
                  <SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger>
                  <SelectContent>
                    {(campuses ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={onSaveEdit} disabled={updateUser.isPending}>
              {updateUser.isPending && <Spinner className="w-4 h-4 mr-2" />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete user?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove <span className="font-semibold text-foreground">{deleteTarget?.firstName} {deleteTarget?.lastName}</span> ({deleteTarget?.email}) from the system. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={onConfirmDelete} disabled={isDeleting}>
              {isDeleting && <Spinner className="w-4 h-4 mr-2" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
