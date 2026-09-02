import { useLocation, useRoute } from "wouter";

/** Section shown when the URL names none, or names one that does not exist. */
const DEFAULT_SECTION = "seasons";

import { useSeason } from "@/lib/season-context";
import { legacyToCanonicalPath } from "@/lib/season-routing";
import {
  useGetProgrammeConfig,
  useUpdateProgrammeConfig,
  getGetProgrammeConfigQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
  Settings,
  Calendar,
  Save,
  RotateCcw,
  AlertTriangle,
  Mail,
  CalendarDays,
  CalendarRange,
  MessageCircle,
  Trophy,
  Bell,
  GraduationCap,
  XCircle,
  Users,
  Plug,
  Wrench,
  Unlock,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ProgrammeWeeksManager } from "@/components/programme-weeks-manager";
import { ReminderSettingsCard } from "@/components/reminder-settings-card";
import { SeasonsAdminCard } from "@/components/seasons-admin-card";
import { WhatsAppAdminCard } from "@/components/whatsapp-admin-card";
import { useMyAdminAccess } from "@/lib/admin-access";
import { ResourcesSettingsCard } from "@/components/resources-settings-card";
import { CoordinatorTagsCard } from "@/components/coordinator-tags-card";
import { TeamNameUniquenessCard } from "@/components/team-name-uniqueness-card";
import { GritConfigCard } from "@/components/grit-config-card";
import { BrdDriveCard } from "@/components/brd-drive-card";
import { PopupsAdminCard } from "@/components/popups-admin-card";
import { ProjectsLockCard } from "@/components/projects-lock-card";
import { RejectionReasonsCard } from "@/components/rejection-reasons-card";
import { TeamSubmissionsPage } from "@/components/team-submissions-card";
import { FinaleConfigCard } from "@/components/finale-config-card";
import { PcaConfigCard } from "@/components/pca-config-card";
import { LeaderboardConfigCard } from "@/components/leaderboard-config-card";
import { Label } from "@/components/ui/label";
import { BraveAppSettingsCard } from "@/components/brave-app-settings-card";
import { regenerateProgrammeWeeks } from "@/lib/progress-api";

type ChatbotProvider = "cloudflare" | "cerebras";

function providerLabel(p: ChatbotProvider): string {
  return p === "cloudflare" ? "Cloudflare Workers AI" : "Cerebras";
}

function ChatbotProviderCard() {
  const { toast } = useToast();
  const [loaded, setLoaded] = useState<ChatbotProvider | null>(null);
  const [selected, setSelected] = useState<ChatbotProvider>("cloudflare");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/chatbot-provider", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as { provider: ChatbotProvider };
      })
      .then((data) => {
        if (cancelled) return;
        setLoaded(data.provider);
        setSelected(data.provider);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded("cloudflare");
        setSelected("cloudflare");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = loaded !== null && selected !== loaded;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/chatbot-provider", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: selected }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        provider?: ChatbotProvider;
        error?: string;
      };
      if (!res.ok) {
        toast({
          title: "Failed to update provider",
          description: data.error || `HTTP ${res.status}`,
          variant: "destructive",
        });
        return;
      }
      const newProvider = data.provider ?? selected;
      setLoaded(newProvider);
      setSelected(newProvider);
      toast({
        title: `Chatbot provider updated to ${providerLabel(newProvider)}`,
      });
    } catch (err) {
      toast({
        title: "Failed to update provider",
        description: err instanceof Error ? err.message : "Network error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const credsHint =
    selected === "cloudflare"
      ? "Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in Replit Secrets."
      : "Requires CEREBRAS_API_KEY in Replit Secrets.";

  return (
    <Card data-testid="card-chatbot-provider">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary" /> Chatbot LLM Provider
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Choose which LLM powers the BRAVE Assistant. The switch takes effect
          within ~30 seconds, no redeploy needed.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div className="space-y-2">
            <Label htmlFor="chatbot-provider-select">Provider</Label>
            <Select
              value={selected}
              onValueChange={(v) => setSelected(v as ChatbotProvider)}
              disabled={loaded === null || saving}
            >
              <SelectTrigger
                id="chatbot-provider-select"
                data-testid="select-chatbot-provider"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cloudflare">
                  Cloudflare Workers AI (default, recommended)
                </SelectItem>
                <SelectItem value="cerebras">Cerebras</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleSave}
            disabled={!dirty || saving}
            data-testid="button-save-chatbot-provider"
          >
            {saving ? (
              <Spinner className="w-4 h-4 mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{credsHint}</p>
      </CardContent>
    </Card>
  );
}

export default function AdminConfig() {
  const { data: config, isLoading } = useGetProgrammeConfig();
  const updateConfig = useUpdateProgrammeConfig();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formData, setFormData] = useState<any>({});
  const [devEnabled, setDevEnabled] = useState<boolean>(false);
  const [reseeding, setReseeding] = useState<boolean>(false);
  // Which config section is shown in the right pane (left-menu navigation).
  const [, setLocation] = useLocation();
  const { viewing } = useSeason();
  // Matches both the season-prefixed URL and the legacy one; SeasonUrlGate
  // rewrites the second into the first, so in practice this reads the former.
  const [, canonicalParams] = useRoute("/admin/season/:season/config/:section");
  const [, legacyParams] = useRoute("/admin/config/:section");
  const sectionSlug = canonicalParams?.section ?? legacyParams?.section ?? null;
  // Super-admin flag for the Seasons card. Cached + shared with the sidebar
  // and ProtectedRoute, so this adds no extra request.
  const { data: adminAccess } = useMyAdminAccess(true);

  // SES test-email state.
  const [testEmail, setTestEmail] = useState<string>("");
  const [testTemplate, setTestTemplate] = useState<
    "plain" | "revenue_verified" | "revenue_rejected"
  >("plain");
  const [sendingTestEmail, setSendingTestEmail] = useState<boolean>(false);

  const handleSendTestEmail = async () => {
    const email = testEmail.trim();
    if (!email) {
      toast({
        title: "Email required",
        description: "Enter a recipient email first.",
        variant: "destructive",
      });
      return;
    }
    setSendingTestEmail(true);
    try {
      const res = await fetch("/api/admin/test-email", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, template: testTemplate }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast({
          title: "Test email failed",
          description: data.error || "Email failed — check SES config/logs.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Test email sent",
        description: "Check the inbox (and the spam folder).",
      });
    } catch (err) {
      toast({
        title: "Test email failed",
        description: err instanceof Error ? err.message : "Network error",
        variant: "destructive",
      });
    } finally {
      setSendingTestEmail(false);
    }
  };

  const [reseedResult, setReseedResult] = useState<
    | { ok: true; durationMs: number; at: number }
    | { ok: false; error: string; at: number }
    | null
  >(null);

  useEffect(() => {
    if (config) setFormData(config);
  }, [config]);

  useEffect(() => {
    // The dev-only route intentionally returns 404 in production. Avoid
    // requesting it there; developer tools are never shown in a production
    // build anyway.
    if (!import.meta.env.DEV) return undefined;

    let cancelled = false;
    fetch("/api/dev/enabled")
      .then((r) => {
        if (!cancelled) setDevEnabled(r.ok);
      })
      .catch(() => {
        if (!cancelled) setDevEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleReseed = async () => {
    setReseeding(true);
    setReseedResult(null);
    try {
      const res = await fetch("/api/admin/dev/reseed", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Reseed failed (HTTP ${res.status})`);
      }
      const data = await res.json();
      setReseedResult({
        ok: true,
        durationMs: data.durationMs,
        at: Date.now(),
      });
      toast({
        title: "Demo data reset",
        description: `Re-seeded in ${(data.durationMs / 1000).toFixed(1)}s. Refresh other tabs to see new data.`,
        duration: 8000,
      });
      // Refresh data on this page (and any other live queries) so the user sees the new seed.
      queryClient.invalidateQueries();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setReseedResult({ ok: false, error: message, at: Date.now() });
      toast({
        title: "Reset failed",
        description: message,
        variant: "destructive",
        duration: 8000,
      });
    } finally {
      setReseeding(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    // Detect whether the programme date range changed so we can auto-rebuild
    // programme_weeks afterwards. We compare the date strings (ignoring any
    // timestamp the API may have returned).
    const datesChanged =
      (config?.startDate ?? "").split("T")[0] !==
        (formData.startDate ?? "").split("T")[0] ||
      (config?.endDate ?? "").split("T")[0] !==
        (formData.endDate ?? "").split("T")[0];

    updateConfig.mutate(
      { data: formData },
      {
        onSuccess: async () => {
          toast({ title: "Configuration saved" });
          queryClient.invalidateQueries({
            queryKey: getGetProgrammeConfigQueryKey(),
          });
          if (datesChanged) {
            try {
              const result = await regenerateProgrammeWeeks();
              toast({
                title: "Programme weeks rebuilt",
                description: `${result.total} weeks · +${result.created} created · ${result.updated} updated · ${result.removed} removed`,
              });
              queryClient.invalidateQueries({
                queryKey: ["admin-programme-weeks"],
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              toast({
                title: "Couldn't rebuild weeks",
                description: `${message}. Click "Regenerate from dates" in the Programme Weeks card.`,
                variant: "destructive",
              });
            }
          }
        },
      },
    );
  };

  // Left-menu sections. Each id maps to a block in the right pane below.
  // "developer" is only listed when dev tools are enabled.
  //
  // `slug` is the URL segment and is deliberately SEPARATE from `id`. The ids
  // are terse and used by dozens of `activeSection === "..."` checks below;
  // renaming them to read well in a URL would mean touching every one. The
  // slug is what a person sees and links to, so it spells the label out, and
  // the two can change independently -- a slug is a public address and must
  // stay stable even if the internal id is refactored.
  const SECTIONS: Array<{
    id: string;
    slug: string;
    label: string;
    icon: any;
  }> = [
    { id: "seasons", slug: "seasons", label: "Seasons", icon: CalendarRange },
    {
      id: "schedule",
      slug: "programme-schedule",
      label: "Programme Schedule",
      icon: Calendar,
    },
    {
      id: "weeks",
      slug: "programme-weeks",
      label: "Programme Weeks",
      icon: CalendarDays,
    },
    { id: "grit", slug: "grit-miles", label: "GRIT Miles", icon: Trophy },
    {
      id: "reminders",
      slug: "notifications",
      label: "Notifications & Reminders",
      icon: Bell,
    },
    {
      id: "student",
      slug: "student-content",
      label: "Student Content",
      icon: GraduationCap,
    },
    {
      id: "team-submissions",
      slug: "teams-submissions",
      label: "Teams Submissions",
      icon: Unlock,
    },
    {
      id: "finale",
      slug: "finale-submissions",
      label: "Finale Submissions",
      icon: Trophy,
    },
    {
      id: "pca",
      slug: "peoples-choice-award",
      label: "People's Choice Award",
      icon: Trophy,
    },
    { id: "queue", slug: "review-queue", label: "Review Queue", icon: XCircle },
    {
      id: "teams",
      slug: "teams-coordinators",
      label: "Teams & Coordinators",
      icon: Users,
    },
    { id: "whatsapp", slug: "whatsapp", label: "WhatsApp", icon: MessageCircle },
    {
      id: "integrations",
      slug: "integrations",
      label: "Integrations",
      icon: Plug,
    },
    ...(devEnabled
      ? [
          {
            id: "developer",
            slug: "developer-tools",
            label: "Developer Tools",
            icon: Wrench,
          },
        ]
      : []),
  ];

  // The URL is the source of truth for which section is open, so a section can
  // be linked to, bookmarked, opened in a second tab and counted in page-view
  // reporting. An unknown or missing slug falls back to the default rather
  // than rendering an empty pane.
  const activeSection =
    SECTIONS.find((s) => s.slug === sectionSlug)?.id ?? DEFAULT_SECTION;

  /**
   * Navigate to a section.
   *
   * Builds the CANONICAL season path directly rather than pushing the legacy
   * one and letting SeasonUrlGate rewrite it. Both arrive in the same place,
   * but the rewrite is a second navigation the user can see.
   */
  const openSection = (slug: string): void => {
    const legacy = `/admin/config/${slug}`;
    setLocation(
      viewing ? legacyToCanonicalPath(legacy, "admin", viewing.slug) : legacy,
    );
  };

  // Keep the address bar honest. /admin/config names no section, and a typo'd
  // or retired slug names one that no longer exists; both render the default
  // pane, so the URL is then describing something other than what is on
  // screen -- which defeats linking, bookmarking and per-section page-view
  // reporting alike. `replace` because neither is a place worth having in
  // history: Back should leave Config, not step through corrections to it.
  const activeSlug = SECTIONS.find((s) => s.id === activeSection)?.slug;
  useEffect(() => {
    if (!viewing || !activeSlug || sectionSlug === activeSlug) return;
    setLocation(
      legacyToCanonicalPath(`/admin/config/${activeSlug}`, "admin", viewing.slug),
      { replace: true },
    );
  }, [viewing, activeSlug, sectionSlug, setLocation]);

  // Keep every hook above this loading branch. Returning before the URL
  // canonicalization effect runs would change the hook count between the
  // loading and loaded renders and crash React with error #310.
  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div className="max-w-7xl mx-auto">
      {/* Sidebar-menu layout: the left section list stays fixed while the
          right content pane scrolls on its own (desktop). On mobile it's a
          normal stacked, page-scrolling layout. Cards/logic are unchanged. */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 items-start lg:h-[calc(100vh-2rem)]">
        {/* LEFT — fixed section menu (scrolls internally only if it overflows) */}
        <nav
          className="space-y-1 lg:h-full lg:overflow-y-auto lg:pr-1"
          data-testid="config-menu"
        >
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => openSection(s.slug)}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                data-testid={`config-menu-${s.id}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* RIGHT — selected section content (independent scroll on desktop) */}
        <div className="space-y-6 lg:h-full lg:overflow-y-auto lg:pr-2 lg:pb-6">
          {/* ── Programme Schedule ── */}
          {activeSection === "schedule" && (
            <div className="space-y-6">
              {/* SECTION 1 — Programme schedule (saved by the bottom Save button) */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" /> Key Dates &
                    Deadlines
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Start Date</label>
                      <Input
                        type="date"
                        value={formData.startDate?.split("T")[0] || ""}
                        onChange={(e) =>
                          handleChange("startDate", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">End Date</label>
                      <Input
                        type="date"
                        value={formData.endDate?.split("T")[0] || ""}
                        onChange={(e) =>
                          handleChange("endDate", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Demo Day Date
                      </label>
                      <Input
                        type="date"
                        value={formData.demoDayDate?.split("T")[0] || ""}
                        onChange={(e) =>
                          handleChange("demoDayDate", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Application Deadline
                      </label>
                      <Input
                        type="date"
                        value={
                          formData.demoDayApplicationDeadline?.split("T")[0] ||
                          ""
                        }
                        onChange={(e) =>
                          handleChange(
                            "demoDayApplicationDeadline",
                            e.target.value,
                          )
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* SECTION 2 — Programme thresholds & visibility (saved by the Save button below). */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-primary" /> Thresholds &
                    Toggles
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Demo Eligibility Threshold (₹)
                    </label>
                    <Input
                      type="number"
                      value={formData.demoEligibilityThreshold || ""}
                      onChange={(e) =>
                        handleChange(
                          "demoEligibilityThreshold",
                          Number(e.target.value),
                        )
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Team Members Count Limit
                    </label>
                    <Input
                      type="number"
                      min={1}
                      value={formData.teamMemberLimit ?? ""}
                      onChange={(e) =>
                        handleChange("teamMemberLimit", Number(e.target.value))
                      }
                      data-testid="input-team-member-limit"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum number of students allowed on a single team. New
                      invites, join requests, and acceptances will be rejected
                      once a team reaches this limit.
                    </p>
                  </div>

                  <div className="flex items-center justify-between border p-4 rounded-lg">
                    <div>
                      <p className="font-medium">Leaderboard Frozen</p>
                      <p className="text-sm text-muted-foreground">
                        Hide the leaderboard from students to build suspense.
                      </p>
                    </div>
                    <Switch
                      checked={formData.leaderboardFrozen || false}
                      onCheckedChange={(c) =>
                        handleChange("leaderboardFrozen", c)
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between border p-4 rounded-lg">
                    <div>
                      <p className="font-medium">Demo Day Applications Open</p>
                      <p className="text-sm text-muted-foreground">
                        Allow eligible teams to submit their pitches.
                      </p>
                    </div>
                    <Switch
                      checked={formData.demoDayApplicationsOpen || false}
                      onCheckedChange={(c) =>
                        handleChange("demoDayApplicationsOpen", c)
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={updateConfig.isPending}>
                  {updateConfig.isPending ? (
                    <Spinner className="w-4 h-4 mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save Configuration
                </Button>
              </div>
            </div>
          )}

          {/* ── Programme Weeks ── */}
          {activeSection === "weeks" && <ProgrammeWeeksManager />}

          {/* ── GRIT Miles ── */}
          {activeSection === "grit" && <GritConfigCard />}

          {/* ── Notifications & Reminders ── */}
          {activeSection === "whatsapp" && (
            <WhatsAppAdminCard
              callerIsSuperAdmin={!!adminAccess?.isSuperAdmin}
            />
          )}

          {activeSection === "seasons" && (
            <SeasonsAdminCard
              callerIsSuperAdmin={!!adminAccess?.isSuperAdmin}
            />
          )}

          {activeSection === "reminders" && <ReminderSettingsCard />}

          {/* ── Student Content ── */}
          {activeSection === "student" && (
            <div className="space-y-6">
              {/* Student-facing Resources visibility (auto-saves). */}
              <ResourcesSettingsCard />
              {/* Admin-managed student pop-ups (CRUD, additive). */}
              <PopupsAdminCard />
              {/* Projects submissions lock — pause student orders/BRD uploads. */}
              <ProjectsLockCard />
              {/* Leaderboard: hide rank from students + banner image. */}
              <LeaderboardConfigCard />
            </div>
          )}

          {/* ── Teams Submissions ── */}
          {activeSection === "team-submissions" && <TeamSubmissionsPage />}

          {activeSection === "finale" && <FinaleConfigCard />}

          {activeSection === "pca" && <PcaConfigCard />}

          {/* ── Review Queue ── */}
          {activeSection === "queue" && (
            /* Revenue rejection reasons — CRUD for the queue's quick chips. */
            <RejectionReasonsCard />
          )}

          {/* ── Teams & Coordinators ── */}
          {activeSection === "teams" && (
            <div className="space-y-6">
              {/* Coordinator Tags — admin-managed catalog (add / edit / delete). */}
              <CoordinatorTagsCard />
              {/* Team Name Uniqueness — notify duplicate-name teams to rename. */}
              <TeamNameUniquenessCard />
            </div>
          )}

          {/* ── Integrations ── */}
          {activeSection === "integrations" && (
            <div className="space-y-6">
              {/* Chatbot LLM provider runtime switch. */}
              <ChatbotProviderCard />
              {/* Manual BRD → Google Drive migration (click only). */}
              <BrdDriveCard />

              {/* Email delivery self-test (Amazon SES). */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-primary" />
                    Email delivery test (Amazon SES)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Send a sample transactional email to confirm Amazon SES is
                    delivering correctly. Use your own inbox first; results show
                    up in a toast.
                  </p>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Recipient email
                    </label>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      disabled={sendingTestEmail}
                      data-testid="input-test-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Template</label>
                    <Select
                      value={testTemplate}
                      onValueChange={(v) =>
                        setTestTemplate(
                          v as
                            | "plain"
                            | "revenue_verified"
                            | "revenue_rejected",
                        )
                      }
                      disabled={sendingTestEmail}
                    >
                      <SelectTrigger data-testid="select-test-template">
                        <SelectValue placeholder="Pick a template" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="plain">Plain test email</SelectItem>
                        <SelectItem value="revenue_verified">
                          Revenue verified
                        </SelectItem>
                        <SelectItem value="revenue_rejected">
                          Revenue rejected
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    type="button"
                    onClick={handleSendTestEmail}
                    disabled={sendingTestEmail || !testEmail.trim()}
                    className="gap-2"
                    data-testid="button-send-test-email"
                  >
                    {sendingTestEmail ? (
                      <Spinner className="w-4 h-4" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                    {sendingTestEmail ? "Sending…" : "Send test email"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    If the email doesn't arrive, the SES account may still be in
                    sandbox mode — in that case it can only deliver to verified
                    addresses until production access is granted.
                  </p>
                </CardContent>
              </Card>
              <BraveAppSettingsCard />
            </div>
          )}

          {/* ── Developer Tools (only when dev mode is enabled) ── */}
          {activeSection === "developer" && devEnabled && (
            <Card
              className="border-amber-300/60 bg-amber-50/40 dark:bg-amber-950/10"
              data-testid="card-dev-tools"
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-5 h-5" /> Developer Tools
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start justify-between gap-4 border border-amber-200 dark:border-amber-900/40 p-4 rounded-lg bg-background">
                  <div className="space-y-1">
                    <p className="font-medium">Reset demo data</p>
                    <p className="text-sm text-muted-foreground">
                      Wipes all seeded users, teams, and entries (those tagged
                      <code className="mx-1 px-1 rounded bg-muted text-xs">
                        @brave.seed
                      </code>
                      ) and re-runs the canonical seed. Real users and their
                      data are not touched. This action is hidden in production.
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={reseeding}
                        data-testid="button-reseed"
                      >
                        {reseeding ? (
                          <Spinner className="w-4 h-4 mr-2" />
                        ) : (
                          <RotateCcw className="w-4 h-4 mr-2" />
                        )}
                        Reset demo data
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reset demo data?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete every seeded user, team, project,
                          order, revenue entry, milestone, demo-day application,
                          announcement, and notification, then re-create the
                          canonical demo dataset. Real (non-seed) users and data
                          will not be affected. The seed typically takes a few
                          seconds.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleReseed}
                          data-testid="button-reseed-confirm"
                        >
                          Yes, reset demo data
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                {reseedResult?.ok === true && (
                  <p
                    className="text-sm text-emerald-700 dark:text-emerald-400"
                    data-testid="text-reseed-success"
                  >
                    Demo data reset — re-seeded in{" "}
                    {(reseedResult.durationMs / 1000).toFixed(1)}s.
                  </p>
                )}
                {reseedResult?.ok === false && (
                  <p
                    className="text-sm text-destructive"
                    data-testid="text-reseed-error"
                  >
                    Reset failed: {reseedResult.error}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
