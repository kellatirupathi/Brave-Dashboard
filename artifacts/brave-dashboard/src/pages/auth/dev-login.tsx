import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { AlertTriangle, LogOut, Search, ShieldAlert, UserCheck } from "lucide-react";

type DevUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: "student" | "coordinator" | "admin";
  campusId: number | null;
  campusName: string | null;
  teamId: number | null;
};

type DevRosterUser = {
  id: number;
  studentId: string;
  fullName: string;
  email: string | null;
  campusId: number | null;
  campusName: string;
};

type ListResponse = { users: DevUser[]; rosterOnly: DevRosterUser[] };

const ROLE_LABEL: Record<DevUser["role"], string> = {
  admin: "Admins",
  coordinator: "Coordinators",
  student: "Students",
};

const ROLE_ORDER: DevUser["role"][] = ["admin", "coordinator", "student"];

export default function DevLogin() {
  const { user, isAuthenticated } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [data, setData] = useState<ListResponse | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | DevUser["role"]>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Dev-mode probe.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dev/enabled")
      .then((r) => {
        if (cancelled) return;
        setEnabled(r.ok);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch user list (debounced on search).
  useEffect(() => {
    if (enabled !== true) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (roleFilter !== "all") params.set("role", roleFilter);
    if (search.trim()) params.set("search", search.trim());
    params.set("limit", "150");
    const t = setTimeout(() => {
      fetch(`/api/dev/users?${params.toString()}`)
        .then(async (r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json() as Promise<ListResponse>;
        })
        .then((json) => {
          if (cancelled) return;
          setData(json);
          setLoading(false);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Failed to load users");
          setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [enabled, roleFilter, search]);

  const grouped = useMemo(() => {
    const out: Record<DevUser["role"], DevUser[]> = {
      admin: [],
      coordinator: [],
      student: [],
    };
    for (const u of data?.users ?? []) out[u.role].push(u);
    return out;
  }, [data]);

  async function signInAs(payload: { userId?: string; formsUserId?: string }) {
    const id = payload.userId ?? `roster:${payload.formsUserId}`;
    setPendingId(id);
    setError(null);
    try {
      const r = await fetch("/api/dev/sign-in-as", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      const json = (await r.json()) as { redirect: string };
      window.location.assign(json.redirect || "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in");
      setPendingId(null);
    }
  }

  async function signOut() {
    await fetch("/api/dev/sign-out", { method: "POST", credentials: "include" });
    window.location.reload();
  }

  if (enabled === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (enabled === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="flex justify-center">
            <ShieldAlert className="w-12 h-12 text-amber-500" />
          </div>
          <h1 className="text-xl font-semibold">Dev sign-in is disabled</h1>
          <p className="text-muted-foreground text-sm">
            This page is only available in development. Use the regular sign-in flow instead.
          </p>
          <Button asChild variant="outline">
            <a href="/login">Go to sign-in</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-300">
              Development sign-in tool
            </p>
            <p className="text-amber-700/80 dark:text-amber-300/80">
              Pick any roster user to sign in as them and impersonate their session. This page returns 404 in production.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sign in as…</h1>
            <p className="text-sm text-muted-foreground">
              Choose any user to walk through the dashboard from their perspective.
            </p>
          </div>
          {isAuthenticated && user && (
            <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2">
              <UserCheck className="w-4 h-4 text-green-600" />
              <div className="text-sm leading-tight">
                <p className="font-medium">
                  {user.firstName} {user.lastName}{" "}
                  <span className="text-muted-foreground font-normal">({user.role})</span>
                </p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={signOut} className="gap-1">
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="search">Search</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name, email, or campus"
                className="pl-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">Role</Label>
            <Select
              value={roleFilter}
              onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}
            >
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
                <SelectItem value="coordinator">Coordinators</SelectItem>
                <SelectItem value="student">Students</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading && !data ? (
          <div className="flex items-center justify-center py-16">
            <Spinner className="size-8" />
          </div>
        ) : (
          <div className="space-y-6">
            {ROLE_ORDER.map((role) => {
              if (roleFilter !== "all" && roleFilter !== role) return null;
              const users = grouped[role];
              if (users.length === 0) return null;
              return (
                <section key={role} className="space-y-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {ROLE_LABEL[role]} ({users.length})
                  </h2>
                  <div className="rounded-lg border bg-card divide-y">
                    {users.map((u) => {
                      const id = u.id;
                      const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;
                      return (
                        <div
                          key={id}
                          className="flex items-center justify-between gap-4 px-4 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {u.email}
                              {u.campusName && (
                                <>
                                  <span className="mx-1.5">•</span>
                                  {u.campusName}
                                </>
                              )}
                              {u.teamId && (
                                <>
                                  <span className="mx-1.5">•</span>
                                  Team #{u.teamId}
                                </>
                              )}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pendingId === id}
                            onClick={() => signInAs({ userId: id })}
                            className="shrink-0"
                          >
                            {pendingId === id && <Spinner className="w-3.5 h-3.5 mr-1.5" />}
                            Sign in as
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {(roleFilter === "all" || roleFilter === "student") &&
              (data?.rosterOnly?.length ?? 0) > 0 && (
                <section className="space-y-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Roster (not yet signed in) ({data!.rosterOnly.length})
                  </h2>
                  <p className="text-xs text-muted-foreground -mt-1">
                    Whitelisted students who haven't logged in yet. Signing in as them auto-creates their user record.
                  </p>
                  <div className="rounded-lg border bg-card divide-y">
                    {data!.rosterOnly.map((r) => {
                      const id = `roster:${r.studentId}`;
                      return (
                        <div
                          key={r.id}
                          className="flex items-center justify-between gap-4 px-4 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{r.fullName}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {r.email ?? r.studentId}
                              <span className="mx-1.5">•</span>
                              {r.campusName}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pendingId === id}
                            onClick={() => signInAs({ formsUserId: r.studentId })}
                            className="shrink-0"
                          >
                            {pendingId === id && <Spinner className="w-3.5 h-3.5 mr-1.5" />}
                            Sign in as
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

            {!loading &&
              data &&
              data.users.length === 0 &&
              (data.rosterOnly?.length ?? 0) === 0 && (
                <div className="text-center py-16 text-sm text-muted-foreground">
                  No users match your filters.
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}
