// Full-screen gate shown to authenticated students who are not yet on the
// BRAVE roster. Drives the new-user access flow: no request -> form,
// pending -> waiting screen, rejected -> rejected screen. While the gate is
// rendered, the student cannot reach any other page in the app.
//
// Layout: a non-interactive ("frozen") replica of the dashboard sidebar is
// shown on the left purely as a preview — none of its items are links and the
// whole column is pointer-events-none / aria-hidden. The actual gate content
// (the access-request form or a status screen) sits to the right of it.
import { useState, type ComponentType } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { signOut } from "@/lib/native-auth";
import {
  getMyAccessRequest,
  submitAccessRequest,
  listCampusOptions,
  type CampusOption,
  type SubmitAccessRequestInput,
} from "@/lib/access-api";
import { normalizeError } from "@/lib/api-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { BraveLogo } from "@/components/brave-logo";
import { cn } from "@/lib/utils";
import {
  Clock,
  LogOut,
  ShieldAlert,
  RefreshCw,
  Check,
  ChevronsUpDown,
  ChevronRight,
  LayoutDashboard,
  BookOpenCheck,
  FolderKanban,
  Trophy,
  FileText,
  Users,
  BookOpen,
} from "lucide-react";

const MY_REQUEST_KEY = ["access-request", "me"];

// Forms-SSO auto-provisioned accounts get a synthetic address of the form
// `sso_<uuid>@forms.local`. We never want to prefill that into the editable
// email field — the student should type their real email instead.
function isSyntheticEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return /@forms\.local$/i.test(email) || /^sso_/i.test(email);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Static preview of the student sidebar. Intentionally inert: plain spans (not
// links), wrapped in pointer-events-none + aria-hidden so nothing here is
// clickable or focusable. Mirrors the styling tokens used by the real sidebar
// (components/sidebar.tsx) so it reads as the same component, frozen.
const FROZEN_NAV: Array<{
  name: string;
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
}> = [
  { name: "Dashboard", icon: LayoutDashboard, active: true },
  { name: "Weekly Journal", icon: BookOpenCheck },
  { name: "Projects", icon: FolderKanban },
  { name: "Leaderboard", icon: Trophy },
  { name: "Demo Day", icon: FileText },
  { name: "My Team", icon: Users },
  { name: "Resources", icon: BookOpen },
];

function FrozenSidebar() {
  const { user } = useAuth();
  const initials =
    `${user?.firstName?.[0] ?? ""}${user?.lastName?.[0] ?? ""}`.trim() || "?";
  return (
    <div
      aria-hidden="true"
      className="hidden lg:flex w-64 shrink-0 bg-sidebar border-r border-sidebar-border h-screen sticky top-0 flex-col text-sidebar-foreground pointer-events-none select-none"
    >
      <div className="p-6">
        <BraveLogo className="text-2xl" />
        <p className="text-xs text-sidebar-foreground/60 uppercase tracking-widest mt-2">
          Dashboard
        </p>
      </div>

      <nav className="flex-1 px-4 space-y-1 py-4">
        {FROZEN_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <span
              key={item.name}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium",
                item.active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/70",
              )}
            >
              <Icon className="w-4 h-4" />
              {item.name}
            </span>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="w-full flex items-center gap-3 px-3 py-3 rounded-md text-left">
          {user?.profileImage ? (
            <img
              src={user.profileImage}
              alt=""
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-sidebar-primary/20 text-sidebar-primary flex items-center justify-center text-sm font-bold uppercase">
              {initials}
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate">
              {user ? `${user.firstName} ${user.lastName}`.trim() : "Student"}
            </p>
            <p className="text-xs text-sidebar-foreground/50 truncate capitalize">
              {user?.role ?? "student"}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-sidebar-foreground/40" />
        </div>
      </div>
    </div>
  );
}

// Page shell: frozen sidebar on the left, gate content on the right.
function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <FrozenSidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="min-h-screen flex items-start lg:items-center justify-center p-6">
          <div className="w-full max-w-lg space-y-8 py-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

function LogoutLink() {
  const { logout } = useAuth();
  return (
    <div className="text-center">
      <button
        onClick={() => void signOut(logout)}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
      >
        Log out and try a different account
      </button>
    </div>
  );
}

// Searchable + scrollable campus picker. Built on Popover + cmdk Command:
// CommandInput gives free-text search, CommandList scrolls
// (max-h-[300px] overflow-y-auto by default).
function CampusCombobox({
  campuses,
  value,
  onChange,
  loading,
}: {
  campuses: CampusOption[];
  value: string;
  onChange: (id: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = campuses.find((c) => String(c.id) === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={loading}
          id="campus"
          className="w-full justify-between font-normal"
        >
          <span className={cn(!selected && "text-muted-foreground")}>
            {loading
              ? "Loading campuses…"
              : selected
                ? selected.name
                : "Select your campus"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput placeholder="Search campus…" />
          <CommandList>
            <CommandEmpty>No campus found.</CommandEmpty>
            <CommandGroup>
              {campuses.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.name}
                  onSelect={() => {
                    onChange(String(c.id));
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === String(c.id) ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AccessRequestForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: campuses, isLoading: campusesLoading } = useQuery({
    queryKey: ["access-request", "campuses"],
    queryFn: listCampusOptions,
  });

  const [fullName, setFullName] = useState(
    user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : "",
  );
  // Editable contact email. Never prefill the synthetic SSO placeholder —
  // start blank for those so the student types a real address.
  const [email, setEmail] = useState(
    isSyntheticEmail(user?.email) ? "" : (user?.email ?? ""),
  );
  const [campusId, setCampusId] = useState<string>("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [niatId, setNiatId] = useState("");
  const [error, setError] = useState("");

  const submit = useMutation({
    mutationFn: (input: SubmitAccessRequestInput) => submitAccessRequest(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_REQUEST_KEY });
    },
    onError: (err) => setError(normalizeError(err).message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmedEmail = email.trim();
    if (!isValidEmail(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }
    const id = Number(campusId);
    if (!Number.isInteger(id) || id <= 0) {
      setError("Please select your campus.");
      return;
    }
    submit.mutate({
      fullName: fullName.trim(),
      email: trimmedEmail,
      campusId: id,
      mobileNumber: mobileNumber.trim(),
      sectionName: sectionName.trim(),
      niatId: niatId.trim() || undefined,
    });
  };

  return (
    <GateShell>
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-4 py-1.5 rounded-full text-sm font-medium border border-amber-500/20">
          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
          Access Required
        </div>
        <h1 className="text-2xl font-bold tracking-tight">
          BRAVE Programme Dashboard
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          We couldn&apos;t find you on the BRAVE roster yet. Request access
          below and a programme administrator will review it.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5">
        <h2 className="font-semibold text-lg">Request Access</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your full name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll use this to contact you about your access request.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="niatId">NIAT ID</Label>
              <Input
                id="niatId"
                value={niatId}
                onChange={(e) => setNiatId(e.target.value)}
                placeholder="e.g. NIAT2024001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mobileNumber">Mobile Number</Label>
              <Input
                id="mobileNumber"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="10-digit mobile number"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sectionName">Section</Label>
            <Input
              id="sectionName"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder="e.g. CSE-A 2024"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="campus">Campus</Label>
            <CampusCombobox
              campuses={campuses ?? []}
              value={campusId}
              onChange={setCampusId}
              loading={campusesLoading}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full"
            disabled={
              submit.isPending ||
              !campusId ||
              !fullName.trim() ||
              !email.trim() ||
              !mobileNumber.trim() ||
              !sectionName.trim()
            }
          >
            {submit.isPending && <Spinner className="w-4 h-4 mr-2" />}
            Submit Access Request
          </Button>
        </form>
      </div>

      <LogoutLink />
    </GateShell>
  );
}

export function AccessGate() {
  const { data, isLoading } = useQuery({
    queryKey: MY_REQUEST_KEY,
    queryFn: getMyAccessRequest,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Spinner className="size-10" />
      </div>
    );
  }

  const request = data?.request ?? null;

  if (request?.status === "pending") {
    return (
      <GateShell>
        <div className="max-w-md w-full mx-auto text-center space-y-6">
          <div className="flex justify-center">
            <div className="rounded-full bg-amber-500/10 border border-amber-500/20 p-4">
              <Clock className="w-12 h-12 text-amber-500" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Request Under Review</h1>
            <p className="text-muted-foreground mt-2 leading-relaxed">
              Your access request has been sent to the BRAVE programme
              administrators. You&apos;ll be able to sign in once it&apos;s
              approved.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Requests are typically reviewed within 24–48 hours.
          </p>
          <LogoutLink />
        </div>
      </GateShell>
    );
  }

  if (request?.status === "rejected") {
    return (
      <GateShell>
        <div className="max-w-md w-full mx-auto text-center space-y-6">
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive/10 border border-destructive/20 p-4">
              <ShieldAlert className="w-12 h-12 text-destructive" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Access Not Approved</h1>
            <p className="text-muted-foreground mt-2 leading-relaxed">
              Your access request was not approved. If you believe this is a
              mistake, please contact your campus coordinator.
            </p>
          </div>
          {request.notes && (
            <div className="text-sm text-left bg-muted/50 border border-border rounded-lg p-3">
              <span className="font-medium">Note from admin: </span>
              {request.notes}
            </div>
          )}
          <LogoutLink />
        </div>
      </GateShell>
    );
  }

  if (request?.status === "approved") {
    return (
      <GateShell>
        <div className="max-w-md w-full mx-auto text-center space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Access Approved</h1>
            <p className="text-muted-foreground mt-2 leading-relaxed">
              Your access has been approved. Reload the page to enter the
              dashboard.
            </p>
          </div>
          <Button onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Reload
          </Button>
        </div>
      </GateShell>
    );
  }

  return <AccessRequestForm />;
}
