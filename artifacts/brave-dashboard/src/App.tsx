import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  Switch,
  Route,
  Router as WouterRouter,
  useLocation,
  Redirect,
} from "wouter";
import { recordPageView } from "@/lib/page-views-api";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import { useMyAdminAccess, isRouteBlocked } from "@/lib/admin-access";
import {
  useGetMyTeam,
  getGetMyTeamQueryKey,
} from "@workspace/api-client-react";
import NotFound from "@/pages/not-found";

// Auth
import Login from "@/pages/auth/login";
import NotOnRoster from "@/pages/auth/not-on-roster";
import DevLogin from "@/pages/auth/dev-login";
import AdminLogin from "@/pages/auth/admin-login";

// Marketing
import Landing from "@/pages/marketing/landing";

// Student
import TeamDashboard from "@/pages/student/dashboard";
import ProjectsList from "@/pages/student/projects/list";
import ProjectDetail from "@/pages/student/projects/detail";
// Season 2 pipeline (additive — Season 1 keeps the Projects pages above).
import LeadsList from "@/pages/student/leads/list";
import LeadDetail from "@/pages/student/leads/detail";
import LeadProject from "@/pages/student/leads/project";
import LeadDelivery from "@/pages/student/leads/delivery";
import GetApp from "@/pages/student/get-app";
import Leaderboard from "@/pages/student/leaderboard";
import TeamProfile from "@/pages/student/team";
import GetStarted from "@/pages/student/get-started";
import GritMilesPage from "@/pages/student/demo-day";
import DemoDayUpload from "@/pages/student/demo-day-upload";
import TeamDashboardLegacy from "@/pages/student/dashboard-legacy";
import { getStudentGritConfig } from "@/lib/grit-config-api";
import { getFinaleMe } from "@/lib/finale-api";
import Notifications from "@/pages/student/notifications";
import Invitations from "@/pages/student/invitations";
import JoinByCode from "@/pages/student/join";
import BrowseTeams from "@/pages/student/browse-teams";
import StudentAssistant from "@/pages/student/assistant";

// Coordinator
import CoordinatorDashboard from "@/pages/coordinator/dashboard";
import CoordinatorTeams from "@/pages/coordinator/teams";
import CoordinatorLeaderboard from "@/pages/coordinator/leaderboard";
import CoordinatorAnnouncements from "@/pages/coordinator/announcements";
import CoordinatorQueue from "@/pages/coordinator/queue";

// Admin
import AdminDashboard from "@/pages/admin/dashboard";
import AdminQueue from "@/pages/admin/queue";
import AdminTeamRequests from "@/pages/admin/team-requests";
import AdminDetailedAnalysis from "@/pages/admin/detailed-analysis";
import AdminTeams from "@/pages/admin/teams";
import AdminTeamDetail from "@/pages/admin/team-detail";
import AdminProjects from "@/pages/admin/projects";
import AdminLeads from "@/pages/admin/leads";
import AdminProjectDetail from "@/pages/admin/project-detail";
import AdminLeaderboard from "@/pages/admin/leaderboard";
import AdminDemoDay from "@/pages/admin/demo-day";
import AdminDemoDaySubmissions from "@/pages/admin/demo-day-submissions";
import AdminFinaleSubmissions from "@/pages/admin/finale-submissions";
import AdminPcaVotes from "@/pages/admin/pca-votes";
import FinalePage from "@/pages/student/finale";
import VotePeoplesChoice from "@/pages/student/vote-peoples-choice";
import { getPcaMe } from "@/lib/pca-api";
import AdminUsers from "@/pages/admin/users";
import AdminUserNew from "@/pages/admin/user-new";
import AdminUserPermissions from "@/pages/admin/user-permissions";
import AdminCampuses from "@/pages/admin/campuses";
import AdminCampusDetail from "@/pages/admin/campus-detail";
import AdminCampusLeaderboard from "@/pages/admin/campus-leaderboard";
import AdminConfig from "@/pages/admin/config";
import AdminRoster from "@/pages/admin/roster";
import AdminAuditLog from "@/pages/admin/audit-log";
import AdminAnnouncements from "@/pages/admin/announcements";
import AdminFeedback from "@/pages/admin/feedback";
import AdminResources from "@/pages/admin/resources";
import AdminNewUsersRequests from "@/pages/admin/new-users-requests";
import AdminNewUserDetail from "@/pages/admin/new-user-detail";

// Coordinator
import CoordinatorProjects from "@/pages/coordinator/projects";

// Progress-enforcement modules (new — additive)
import StudentJournal from "@/pages/student/journal";
import StudentResourcesLibrary from "@/pages/student/resources";
import AdminJournals from "@/pages/admin/journals";
import AdminJournalTeamDetail from "@/pages/admin/journal-team-detail";
import AdminHeatmap from "@/pages/admin/heatmap";
import AdminCampusInsights from "@/pages/admin/campus-insights";
import AdminChatbotHistory from "@/pages/admin/chatbot-history";
import AdminPopups from "@/pages/admin/popups";
import AdminSubmissionRequests from "@/pages/admin/submission-requests";
import AdminNotifications from "@/pages/admin/notifications";
import CoordinatorJournals from "@/pages/coordinator/journals";
import CoordinatorJournalTracking from "@/pages/coordinator/journal-tracking";
import AdminReports from "@/pages/admin/reports";
import AdminReelsScripts from "@/pages/admin/reels-scripts";
import ReportView from "@/pages/reports/view";
import CoordinatorJournalTeamDetail from "@/pages/coordinator/journal-team-detail";
import CoordinatorHeatmap from "@/pages/coordinator/heatmap";

// Shared
import Profile from "@/pages/profile";
import Guidebook from "@/pages/guidebook";
import DocsPage from "@/pages/docs";

// Components
import { Layout } from "@/components/layout";
import { Spinner } from "@/components/ui/spinner";
import { BraveLoader } from "@/components/brave-loader";
import { AccessGate } from "@/components/access-gate";
import { TermsGate } from "@/components/terms-gate";
import { PopupGate } from "@/components/popup-gate";
import { GritIntroDialog } from "@/components/grit-intro-dialog";
import { SeasonProvider, useSeason } from "@/lib/season-context";
import { InstallPrompt, UpdatePrompt } from "@/components/pwa-prompts";
import { isNativeApp } from "@/lib/native-auth";
import { NativeAuthBridge } from "@/components/native-auth-bridge";
import { ProductTour } from "@/components/product-tour";
import {
  canonicalToLegacyPath,
  legacyToCanonicalPath,
  parseCanonicalSeasonPath,
  type CanonicalSeasonRole,
} from "@/lib/season-routing";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const ROUTER_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function browserRoute(): string {
  const full =
    window.location.pathname + window.location.search + window.location.hash;
  if (!ROUTER_BASE) return full;
  if (full === ROUTER_BASE) return "/";
  return full.startsWith(ROUTER_BASE + "/")
    ? full.slice(ROUTER_BASE.length)
    : full;
}

function browserUrl(route: string): string {
  return `${ROUTER_BASE}${route === "/" ? "/" : route}`;
}

// One subscription shape for every reader of the browser URL below.
//
// WHY useSyncExternalStore AND NOT useState + useEffect
// A `useState(read)` + `useEffect(addEventListener)` pair has a hole between
// mount and the effect running. A child that navigates during that window
// — wouter's <Redirect>, whose effect fires BEFORE its ancestors' effects —
// dispatches `popstate` to nobody, and the parent keeps rendering the old
// route for the rest of the session while the address bar shows the new one.
//
// That is exactly what the installed app hit: "/" mounts the router, the
// same commit renders <Redirect to="/login" />, the URL becomes /login, and
// the <Switch> stays on "/" rendering a <Redirect> that renders null. The
// student saw a blank cream page with nothing on it. The browser build never
// noticed because "/" renders the landing page rather than a redirect there.
//
// useSyncExternalStore re-reads the snapshot when it subscribes and re-renders
// if it moved, which closes that hole by construction.
function subscribeToBrowserRoute(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function useBrowserRouteState(): string {
  return useSyncExternalStore(
    subscribeToBrowserRoute,
    browserRoute,
    browserRoute,
  );
}

function seasonDashboardHref(role: CanonicalSeasonRole, slug: string): string {
  const suffix = role === "student" ? "/dashboard" : "";
  return `/${role}/season/${encodeURIComponent(slug)}${suffix}`;
}

function seasonHref(href: string): string {
  const route =
    ROUTER_BASE &&
    (href === ROUTER_BASE || href.startsWith(ROUTER_BASE + "/"))
      ? href.slice(ROUTER_BASE.length) || "/"
      : href;
  const current = parseCanonicalSeasonPath(browserRoute());
  const canonical =
    current && !parseCanonicalSeasonPath(route)
      ? legacyToCanonicalPath(route, current.role, current.slug)
      : route;
  return browserUrl(canonical);
}

/** The wouter-facing path for the current browser URL: canonical → legacy. */
function readLegacyLocation(): string {
  return browserUrl(canonicalToLegacyPath(browserRoute()).split(/[?#]/, 1)[0]);
}

/**
 * The page tree intentionally continues to use its established paths. This
 * adapter makes canonical URLs look like those paths to wouter, while keeping
 * the browser address bar canonical. It also upgrades links emitted by older
 * page components without requiring a risky sweep through every page.
 */
function useSeasonLocation(): [
  string,
  (
    to: string,
    options?: { replace?: boolean; state?: unknown },
  ) => void,
] {
  // See useBrowserRouteState for why this is not useState + useEffect.
  const location = useSyncExternalStore(
    subscribeToBrowserRoute,
    readLegacyLocation,
    readLegacyLocation,
  );

  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      const route =
        ROUTER_BASE && (to === ROUTER_BASE || to.startsWith(ROUTER_BASE + "/"))
          ? to.slice(ROUTER_BASE.length) || "/"
          : to;
      const current = browserRoute();
      const currentCanonical = parseCanonicalSeasonPath(current);
      const next =
        currentCanonical && !parseCanonicalSeasonPath(route)
          ? legacyToCanonicalPath(
              route,
              currentCanonical.role,
              currentCanonical.slug,
            )
          : route;
      window.history[options?.replace ? "replaceState" : "pushState"](
        options?.state ?? null,
        "",
        browserUrl(next),
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    [],
  );
  return [location, navigate];
}

function SeasonRouteRedirect({
  to,
  replace = true,
}: {
  to: string;
  replace?: boolean;
}) {
  // Wouter's Redirect intentionally renders null while navigation is being
  // scheduled. Keep the existing loader visible during canonicalization so a
  // first-login redirect can never present a blank frame.
  return (
    <>
      <BraveLoader />
      <Redirect to={to} replace={replace} />
    </>
  );
}

function SeasonUrlGate({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { seasons, viewing, viewingId, isLoading: seasonsLoading } = useSeason();
  // This must track the real canonical URL, not Wouter's adapted legacy path.
  // The first-login redirect changes "/" to
  // "/student/season/<slug>/dashboard", but both map internally to "/".
  // Subscribing here guarantees that canonicalization re-renders this gate.
  const raw = useBrowserRouteState();
  const canonical = parseCanonicalSeasonPath(raw);

  // Auth, landing, guidebook and development routes deliberately stay outside
  // the season namespace. Do not wait for seasons for a public URL.
  if (authLoading) return <BraveLoader />;
  if (!isAuthenticated) return <>{children}</>;
  if (seasonsLoading) return <BraveLoader />;

  if (canonical) {
    if (
      user?.role &&
      ["admin", "coordinator", "student"].includes(user.role) &&
      canonical.role !== user.role
    ) {
      if (!viewing) return <BraveLoader />;
      return (
        <SeasonRouteRedirect
          to={seasonDashboardHref(user.role as CanonicalSeasonRole, viewing.slug)}
        />
      );
    }
    const requested = seasons.find((season) => season.slug === canonical.slug);
    const activeSeason = seasons.find((season) => season.isActive);
    // The season this student belongs in: the live one for almost everyone,
    // but their own where an admin has pinned them. `viewing` is what the
    // server resolved for this user, so it already accounts for the pin.
    const studentSeason =
      canonical.role === "student" ? (viewing ?? activeSeason) : undefined;
    // An inactive season is only wrong for a student who has NOT been pinned
    // to it — a pinned student's season is inactive by definition, and
    // bouncing them to the live one would undo the pin on every navigation.
    const studentSeasonIsInactive =
      canonical.role === "student" &&
      !!requested &&
      !requested.isActive &&
      requested.id !== studentSeason?.id;
    if (!requested || studentSeasonIsInactive) {
      const fallback =
        canonical.role === "student"
          ? studentSeason
          : (activeSeason ?? viewing);
      if (!fallback) return <BraveLoader />;
      return (
        <SeasonRouteRedirect
          to={seasonDashboardHref(canonical.role, fallback.slug)}
        />
      );
    }
    if (
      canonical.role === "student" &&
      (canonical.suffix === "" || canonical.suffix === "/")
    ) {
      return (
        <SeasonRouteRedirect
          to={seasonDashboardHref("student", requested.slug)}
        />
      );
    }
    // URL selection wins over local/session selection. Blocking here prevents
    // a component from issuing requests for the previous season on the frame
    // between navigation and provider synchronization.
    if (viewingId !== requested.id) return <BraveLoader />;
    return <>{children}</>;
  }

  // Every authenticated dashboard page gets a canonical URL. This also
  // preserves deep-link suffixes and query strings from historic bookmarks.
  const publicPaths = new Set([
    "/login",
    "/admin/login",
    "/not-on-roster",
    "/guidebook",
    ...(import.meta.env.DEV ? ["/dev/login"] : []),
  ]);
  const rawPath = raw.split(/[?#]/, 1)[0];
  // Role documentation is public and season-agnostic (the season is part of
  // the docs URL itself), so it must never be canonicalised.
  if (publicPaths.has(rawPath) || rawPath.startsWith("/docs/"))
    return <>{children}</>;
  if (!viewing || !user?.role || !["admin", "coordinator", "student"].includes(user.role)) {
    return <BraveLoader />;
  }
  return (
    <SeasonRouteRedirect
      to={legacyToCanonicalPath(
        raw,
        user.role as CanonicalSeasonRole,
        viewing.slug,
      )}
      replace
    />
  );
}

function ProtectedRoute({
  component: Component,
  allowedRoles,
  bare = false,
}: {
  component: React.ComponentType;
  allowedRoles: string[];
  /**
   * Render WITHOUT the app shell (sidebar, bottom nav, banners). For pages
   * opened in their own tab that are read rather than navigated from — the
   * mobile install guide is the only one today. Every auth and role check
   * above still applies.
   */
  bare?: boolean;
}) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();
  // Resolve per-page admin permissions (default-allow). Enabled only for
  // admins; the query is cached and shared with the sidebar.
  const isAdmin = user?.role === "admin";
  const { data: adminAccess, isLoading: accessLoading } =
    useMyAdminAccess(!!isAdmin);

  if (isLoading) {
    return <BraveLoader />;
  }

  if (!isAuthenticated || !user) {
    return <Redirect to="/login" />;
  }

  // New-user access gate: students not yet on the roster see only the
  // full-screen gate (request form / pending / rejected) — every other
  // student page is blocked until an admin approves their access request.
  if (user.role === "student" && !user.isOnRoster) {
    return <AccessGate />;
  }

  if (!allowedRoles.includes(user.role || "")) {
    if (user.role === "student") return <Redirect to="/" />;
    if (user.role === "coordinator") return <Redirect to="/coordinator" />;
    if (user.role === "admin") return <Redirect to="/admin" />;
    return <Redirect to="/login" />;
  }

  // Restricted-admin route gate (default-allow). Super admins and admins with
  // no stored permissions are never blocked. A restricted admin hitting a
  // blocked page is bounced to the dashboard (or /profile if the dashboard
  // itself is blocked, to avoid a redirect loop).
  if (isAdmin) {
    if (accessLoading) {
      return <BraveLoader />;
    }
    if (adminAccess && isRouteBlocked(adminAccess, location)) {
      const dashboardBlocked = isRouteBlocked(adminAccess, "/admin");
      return <Redirect to={dashboardBlocked ? "/profile" : "/admin"} />;
    }
  }

  if (bare) return <Component />;

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

// Wraps the student Resources page so it respects the admin-controlled
// visibility toggle. When the flag is OFF, the student is bounced back
// to "/" — keeps the URL un-bookmarkable when the feature is hidden.
function StudentResourcesLibraryGuarded() {
  const { data, isLoading } = useQuery<{ enabledForStudents: boolean }>({
    queryKey: ["public-resources-settings"],
    queryFn: async () => {
      const r = await fetch("/api/resources-settings", {
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to load resources settings");
      return r.json();
    },
    staleTime: 60_000,
  });
  if (isLoading) {
    return (
      <div className="min-h-[40vh] w-full flex items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (data && data.enabledForStudents === false) {
    return <Redirect to="/" />;
  }
  return <StudentResourcesLibrary />;
}

function StudentDashboardOrGetStarted() {
  const { user } = useAuth();
  const { data: team, isLoading } = useGetMyTeam({
    query: { queryKey: getGetMyTeamQueryKey(), retry: false },
  });
  // Demo Day → GRIT Miles dashboard version flag (admin-controlled, default
  // false = previous Demo Day dashboard). Reuses the shared student-grit-config
  // cache. Independent from the menu/page flag.
  const { data: gritConfig, isLoading: gritLoading } = useQuery({
    queryKey: ["student-grit-config"],
    queryFn: getStudentGritConfig,
    staleTime: 60_000,
    enabled: user?.role === "student",
  });
  // Wait for the flag before choosing a dashboard so a flag-ON student never
  // sees the legacy UI flash before switching. isLoading is false when the
  // query is disabled (non-students), so this only gates students.
  if (isLoading || gritLoading) {
    return <BraveLoader />;
  }
  // First-time profile completion: students with no team and who have never
  // saved their profile go to /profile first; the profile page then sends
  // them on to /get-started after a successful save.
  if (!team && user && !user.profileCompletedAt) {
    return <Redirect to="/profile" />;
  }
  if (!team) return <Redirect to="/get-started" />;

  // ── Installed app: open on the dashboard ───────────────────────────────
  //
  // This used to force a one-off redirect to /leads on the first render after
  // launch, on the theory that a student opens BRAVE on their phone to log a
  // lead rather than to read a summary.
  //
  // That is no longer what we want. The dashboard IS the app's home: it is
  // slot 1 of the bottom nav, it is where sign-in should land, and jumping
  // past it made the nav lie about where the student was. Leads is one tap
  // away in slot 3, which is the right cost for a secondary destination.
  //
  // The `nativeLaunchLanded` module flag that guarded the redirect is gone
  // with it — there is nothing left to fire once per launch.

  return gritConfig?.gritMilesDashboardEnabled ? (
    <TeamDashboard />
  ) : (
    <TeamDashboardLegacy />
  );
}

// Gates the student Demo Day page behind the admin-controlled demoDayMenuEnabled
// flag so a student can't reach /demo-day by typing the URL when it's hidden.
// Admins/coordinators are unaffected (they reach this route via different nav).
function StudentDemoDayGuard() {
  const { user } = useAuth();
  const { data: gritConfig, isLoading } = useQuery({
    queryKey: ["student-grit-config"],
    queryFn: getStudentGritConfig,
    staleTime: 60_000,
    enabled: user?.role === "student",
  });
  if (user?.role === "student" && isLoading) {
    return <BraveLoader />;
  }
  if (user?.role === "student" && gritConfig?.demoDayMenuEnabled === false) {
    return <Redirect to="/" />;
  }
  return <DemoDayUpload />;
}

// Gates the student Finale page: the feature must be on AND the team must have
// cleared the verified-revenue bar. Same shape as StudentDemoDayGuard — only
// bounce on an explicit `false`/ineligible so a slow load doesn't redirect.
function StudentFinaleGuard() {
  const { user } = useAuth();
  const { data: finaleMe, isLoading } = useQuery({
    queryKey: ["finale-me"],
    queryFn: getFinaleMe,
    staleTime: 60_000,
    enabled: user?.role === "student",
  });
  if (user?.role === "student" && isLoading) {
    return <BraveLoader />;
  }
  if (
    user?.role === "student" &&
    (finaleMe?.enabled === false || finaleMe?.eligible === false)
  ) {
    return <Redirect to="/" />;
  }
  return <FinalePage />;
}

// Gates the People's Choice vote page: voting must be open AND this student's
// team must clear the revenue bar. Only bounce on an explicit false so a slow
// load never redirects someone who is allowed in.
function StudentPcaGuard() {
  const { user } = useAuth();
  const { data: pca, isLoading } = useQuery({
    queryKey: ["pca-me"],
    queryFn: getPcaMe,
    staleTime: 60_000,
    enabled: user?.role === "student",
  });
  if (user?.role === "student" && isLoading) {
    return <BraveLoader />;
  }
  if (
    user?.role === "student" &&
    (pca?.enabled === false || pca?.eligible === false)
  ) {
    return <Redirect to="/" />;
  }
  return <VotePeoplesChoice />;
}

/**
 * Sends a student to the flow that actually exists in the season they are
 * viewing.
 *
 * Season 1 ran on free-form Projects; Season 2 replaced that with the lead
 * pipeline. Hiding the sidebar entry was never enough — the URL is guessable
 * and stays in browser history, so a Season 1 student could open /leads and be
 * shown a pipeline their season has no data for. The API refuses those calls
 * independently (requireLeadPipelineSeason); this only makes the landing
 * graceful rather than an error page.
 *
 * Renders children unchanged while the season is still resolving, so there is
 * no redirect flash on first paint.
 */
function SeasonFlowRoute({
  children,
  requires,
}: {
  children: React.ReactNode;
  /** "pipeline" = Season 2 onwards. "projects" = Season 1 only. */
  requires: "pipeline" | "projects";
}) {
  const { viewing, isLoading } = useSeason();
  if (isLoading || !viewing) return <BraveLoader />;
  const usesPipeline = viewing.slug !== "1.0";
  // `replace`, not push: the URL being corrected must not stay in history, or
  // the hardware back button would land on it and be redirected forward again,
  // trapping the student in a loop they cannot back out of.
  if (requires === "pipeline" && !usesPipeline)
    return <Redirect to="/projects" replace />;
  if (requires === "projects" && usesPipeline)
    return <Redirect to="/leads" replace />;
  return <>{children}</>;
}

function RootRedirect() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <BraveLoader />;
  }

  if (!isAuthenticated || !user) {
    // The installed app skips the marketing landing page: the student tapped a
    // BRAVE icon on their own home screen, so selling them the programme again
    // is a page in the way. Straight to sign-in.
    if (isNativeApp()) return <Redirect to="/login" />;
    return <Landing />;
  }

  // New-user access gate (see ProtectedRoute): block the root route for
  // students who are not yet on the roster.
  if (user.role === "student" && !user.isOnRoster) {
    return <AccessGate />;
  }

  if (user.role === "coordinator") return <Redirect to="/coordinator" />;
  if (user.role === "admin") return <Redirect to="/admin" />;

  // Student dashboard - redirects to /get-started if no team

  return (
    <Layout>
      <StudentDashboardOrGetStarted />
    </Layout>
  );
}

// Guidebook renders as its OWN full-screen page (its own sidebar + content),
// deliberately NOT wrapped in <Layout> so it reads as a separate document app.
// PUBLIC — intentionally viewable by anyone, no login required.
function GuidebookStandalone() {
  return <Guidebook />;
}

// Records a page view whenever the route changes (for logged-in users only).
// Best-effort + de-duped on consecutive identical paths; never blocks nav.
function PageViewTracker() {
  const location = useBrowserRouteState();
  const { isAuthenticated } = useAuth();
  const lastRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthenticated) return;
    if (lastRef.current === location) return;
    lastRef.current = location;
    void recordPageView(location);
  }, [location, isAuthenticated]);
  return null;
}

function Router() {
  return (
    <SeasonUrlGate>
      <PageViewTracker />
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/not-on-roster" component={NotOnRoster} />
        {import.meta.env.DEV && (
          <Route path="/dev/login" component={DevLogin} />
        )}

        {/* Root - role-based redirect */}
        <Route path="/" component={RootRedirect} />

        {/* Student Routes */}
        <Route path="/projects">
          <SeasonFlowRoute requires="projects">
            <ProtectedRoute component={ProjectsList} allowedRoles={["student"]} />
          </SeasonFlowRoute>
        </Route>
        <Route path="/projects/:id">
          <SeasonFlowRoute requires="projects">
            <ProtectedRoute
              component={ProjectDetail}
              allowedRoles={["student"]}
            />
          </SeasonFlowRoute>
        </Route>
        {/* Season 2 pipeline. Additive routes — the Season 1 /projects routes
            above are untouched, and the sidebar decides which of the two a
            student is offered based on the season being viewed. The most
            specific path must be declared first: wouter matches in order. */}
        <Route path="/leads/:id/delivery/:projectId">
          <SeasonFlowRoute requires="pipeline">
            <ProtectedRoute component={LeadDelivery} allowedRoles={["student"]} />
          </SeasonFlowRoute>
        </Route>
        <Route path="/leads/:id/project">
          <SeasonFlowRoute requires="pipeline">
            <ProtectedRoute component={LeadProject} allowedRoles={["student"]} />
          </SeasonFlowRoute>
        </Route>
        <Route path="/leads/:id">
          <SeasonFlowRoute requires="pipeline">
            <ProtectedRoute component={LeadDetail} allowedRoles={["student"]} />
          </SeasonFlowRoute>
        </Route>
        <Route path="/leads">
          <SeasonFlowRoute requires="pipeline">
            <ProtectedRoute component={LeadsList} allowedRoles={["student"]} />
          </SeasonFlowRoute>
        </Route>
        {/* Public app-install guide. This exact URL is encoded in the campus QR
            code, so it must work in a fresh browser with no BRAVE session. */}
        <Route path="/get-app" component={GetApp} />
        <Route path="/leaderboard">
          <ProtectedRoute component={Leaderboard} allowedRoles={["student"]} />
        </Route>
        <Route path="/team">
          <ProtectedRoute component={TeamProfile} allowedRoles={["student"]} />
        </Route>
        <Route path="/get-started">
          <ProtectedRoute component={GetStarted} allowedRoles={["student"]} />
        </Route>
        <Route path="/invitations">
          <ProtectedRoute component={Invitations} allowedRoles={["student"]} />
        </Route>
        <Route path="/join">
          <ProtectedRoute component={JoinByCode} allowedRoles={["student"]} />
        </Route>
        <Route path="/browse-teams">
          <ProtectedRoute component={BrowseTeams} allowedRoles={["student"]} />
        </Route>
        <Route path="/assistant">
          <ProtectedRoute
            component={StudentAssistant}
            allowedRoles={["student"]}
          />
        </Route>
        <Route path="/grit-miles">
          <ProtectedRoute
            component={GritMilesPage}
            allowedRoles={["student"]}
          />
        </Route>
        <Route path="/demo-day">
          <ProtectedRoute
            component={StudentDemoDayGuard}
            allowedRoles={["student"]}
          />
        </Route>
        <Route path="/finale">
          <ProtectedRoute
            component={StudentFinaleGuard}
            allowedRoles={["student"]}
          />
        </Route>
        <Route path="/vote/people-choice-award">
          <ProtectedRoute
            component={StudentPcaGuard}
            allowedRoles={["student"]}
          />
        </Route>
        <Route path="/notifications">
          <ProtectedRoute
            component={Notifications}
            allowedRoles={["student"]}
          />
        </Route>

        {/* Progress enforcement (student) */}
        <Route path="/journal">
          <ProtectedRoute
            component={StudentJournal}
            allowedRoles={["student"]}
          />
        </Route>

        {/* Resources library (read-only for students). Hidden behind the
          admin Resources-visibility toggle — when OFF, students hitting
          this URL are redirected to /. */}
        <Route path="/resources-library">
          <ProtectedRoute
            component={StudentResourcesLibraryGuarded}
            allowedRoles={["student"]}
          />
        </Route>

        {/* Coordinator Routes */}
        <Route path="/coordinator">
          <ProtectedRoute
            component={CoordinatorDashboard}
            allowedRoles={["coordinator"]}
          />
        </Route>
        <Route path="/coordinator/queue">
          <ProtectedRoute
            component={CoordinatorQueue}
            allowedRoles={["coordinator"]}
          />
        </Route>
        <Route path="/coordinator/teams">
          <ProtectedRoute
            component={CoordinatorTeams}
            allowedRoles={["coordinator"]}
          />
        </Route>
        <Route path="/coordinator/projects">
          <ProtectedRoute
            component={CoordinatorProjects}
            allowedRoles={["coordinator"]}
          />
        </Route>
        <Route path="/coordinator/projects/:id">
          <ProtectedRoute
            component={AdminProjectDetail}
            allowedRoles={["coordinator"]}
          />
        </Route>
        <Route path="/coordinator/leaderboard">
          <ProtectedRoute
            component={CoordinatorLeaderboard}
            allowedRoles={["coordinator"]}
          />
        </Route>
        <Route path="/coordinator/announcements">
          <ProtectedRoute
            component={CoordinatorAnnouncements}
            allowedRoles={["coordinator"]}
          />
        </Route>
        <Route path="/coordinator/journal-tracking">
          <ProtectedRoute
            component={CoordinatorJournalTracking}
            allowedRoles={["coordinator"]}
          />
        </Route>
        <Route path="/coordinator/journals/team/:teamId">
          <ProtectedRoute
            component={CoordinatorJournalTeamDetail}
            allowedRoles={["coordinator"]}
          />
        </Route>
        <Route path="/coordinator/journals">
          <ProtectedRoute
            component={CoordinatorJournals}
            allowedRoles={["coordinator"]}
          />
        </Route>
        <Route path="/coordinator/heatmap">
          <ProtectedRoute
            component={CoordinatorHeatmap}
            allowedRoles={["coordinator"]}
          />
        </Route>
        {/* Coordinators share the generic notifications list. The canonical
            season URL maps /notifications → /coordinator/notifications for
            this role, so the page has to exist at this path too. */}
        <Route path="/coordinator/notifications">
          <ProtectedRoute
            component={Notifications}
            allowedRoles={["coordinator"]}
          />
        </Route>

        {/* Journal report viewer — admin + coordinator (login-gated). */}
        <Route path="/reports/view/:token">
          <ProtectedRoute
            component={ReportView}
            allowedRoles={["admin", "coordinator"]}
          />
        </Route>

        {/* Admin Routes */}
        <Route path="/admin">
          <ProtectedRoute component={AdminDashboard} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/reports">
          <ProtectedRoute component={AdminReports} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/reels-scripts">
          <ProtectedRoute
            component={AdminReelsScripts}
            allowedRoles={["admin"]}
          />
        </Route>
        <Route path="/admin/queue/detailed-analysis">
          <ProtectedRoute
            component={AdminDetailedAnalysis}
            allowedRoles={["admin"]}
          />
        </Route>
        <Route path="/admin/queue">
          <ProtectedRoute component={AdminQueue} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/team-requests">
          <ProtectedRoute
            component={AdminTeamRequests}
            allowedRoles={["admin"]}
          />
        </Route>
        <Route path="/admin/teams">
          <ProtectedRoute component={AdminTeams} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/teams/:id">
          <ProtectedRoute
            component={AdminTeamDetail}
            allowedRoles={["admin"]}
          />
        </Route>
        <Route path="/teams/:id">
          <ProtectedRoute
            component={AdminTeamDetail}
            allowedRoles={["student", "coordinator", "admin"]}
          />
        </Route>
        <Route path="/admin/leads">
          <ProtectedRoute component={AdminLeads} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/projects">
          <ProtectedRoute component={AdminProjects} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/projects/:id">
          <ProtectedRoute
            component={AdminProjectDetail}
            allowedRoles={["admin"]}
          />
        </Route>
        <Route path="/admin/leaderboard">
          <ProtectedRoute
            component={AdminLeaderboard}
            allowedRoles={["admin"]}
          />
        </Route>
        <Route path="/admin/demo-day">
          <ProtectedRoute component={AdminDemoDay} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/demo-day-submissions">
          <ProtectedRoute
            component={AdminDemoDaySubmissions}
            allowedRoles={["admin"]}
          />
        </Route>
        <Route path="/admin/finale-submissions">
          <ProtectedRoute
            component={AdminFinaleSubmissions}
            allowedRoles={["admin"]}
          />
        </Route>
        <Route path="/admin/votes/peoples-choice-votes">
          <ProtectedRoute component={AdminPcaVotes} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/users/new">
          <ProtectedRoute component={AdminUserNew} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/users/:id/permissions">
          <ProtectedRoute
            component={AdminUserPermissions}
            allowedRoles={["admin"]}
          />
        </Route>
        <Route path="/admin/users">
          <ProtectedRoute component={AdminUsers} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/campus-leaderboard">
          <ProtectedRoute
            component={AdminCampusLeaderboard}
            allowedRoles={["admin"]}
          />
        </Route>
        <Route path="/admin/campuses">
          <ProtectedRoute component={AdminCampuses} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/campuses/:id">
          <ProtectedRoute
            component={AdminCampusDetail}
            allowedRoles={["admin"]}
          />
        </Route>
        {/* Config is a menu of sections, and each one now has its own URL so it
            can be linked, bookmarked and reported on. Both paths render the
            same page: the bare one lands on the default section. The season
            prefix is handled upstream -- canonicalToLegacyPath already maps
            /admin/season/2.0/config/seasons onto /admin/config/seasons. */}
        <Route path="/admin/config/:section">
          <ProtectedRoute component={AdminConfig} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/config">
          <ProtectedRoute component={AdminConfig} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/roster">
          <ProtectedRoute component={AdminRoster} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/new-users-requests/:id">
          <ProtectedRoute
            component={AdminNewUserDetail}
            allowedRoles={["admin"]}
          />
        </Route>
        <Route path="/admin/new-users-requests">
          <ProtectedRoute
            component={AdminNewUsersRequests}
            allowedRoles={["admin"]}
          />
        </Route>
        <Route path="/admin/audit-log">
          <ProtectedRoute component={AdminAuditLog} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/audit-log/pages">
          <ProtectedRoute component={AdminAuditLog} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/announcements">
          <ProtectedRoute
            component={AdminAnnouncements}
            allowedRoles={["admin"]}
          />
        </Route>
        {/* Hidden route — not linked from the admin sidebar; reachable only via direct URL. */}
        <Route path="/admin/feedback">
          <ProtectedRoute component={AdminFeedback} allowedRoles={["admin"]} />
        </Route>
        {/* Resources management (admin CRUD) */}
        <Route path="/admin/resources">
          <ProtectedRoute component={AdminResources} allowedRoles={["admin"]} />
        </Route>

        {/* Admin Campus Insights (now sidebar-linked). */}
        <Route path="/admin/campus-insights">
          <ProtectedRoute
            component={AdminCampusInsights}
            allowedRoles={["admin"]}
          />
        </Route>

        {/* Admin Chatbot History (sidebar-linked). */}
        <Route path="/admin/chatbot-history">
          <ProtectedRoute
            component={AdminChatbotHistory}
            allowedRoles={["admin"]}
          />
        </Route>

        {/* Admin Popups — student popup confirmations report (Communications). */}
        <Route path="/admin/popups">
          <ProtectedRoute component={AdminPopups} allowedRoles={["admin"]} />
        </Route>

        {/* Communications — student "Request to submit" queue. */}
        <Route path="/admin/submission-requests">
          <ProtectedRoute
            component={AdminSubmissionRequests}
            allowedRoles={["admin"]}
          />
        </Route>

        {/* Admin Notifications — overdue review-queue email subscribers. */}
        <Route path="/admin/notifications">
          <ProtectedRoute
            component={AdminNotifications}
            allowedRoles={["admin"]}
          />
        </Route>

        {/* Progress enforcement (admin) */}
        <Route path="/admin/journals/team/:teamId">
          <ProtectedRoute
            component={AdminJournalTeamDetail}
            allowedRoles={["admin"]}
          />
        </Route>
        <Route path="/admin/journals">
          <ProtectedRoute component={AdminJournals} allowedRoles={["admin"]} />
        </Route>
        <Route path="/admin/heatmap">
          <ProtectedRoute component={AdminHeatmap} allowedRoles={["admin"]} />
        </Route>

        {/* Shared */}
        <Route path="/profile">
          <ProtectedRoute
            component={Profile}
            allowedRoles={["student", "coordinator", "admin"]}
          />
        </Route>

        {/* Guidebook — standalone full-page experience (its own branded sidebar +
          content, no dashboard chrome). Auth-gated; open to every role. */}
        <Route path="/guidebook" component={GuidebookStandalone} />
        {/* Role documentation — PUBLIC, one page per role per season, e.g.
            /docs/student/2.0. Linked from every role's sidebar. */}
        <Route path="/docs/:role/:version" component={DocsPage} />
        <Route path="/docs/:role" component={DocsPage} />
        <Route path="/docs" component={DocsPage} />

        <Route component={NotFound} />
      </Switch>
    </SeasonUrlGate>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* Season 1 / Season 2 coexistence. Registers the season header with
            the API client, so every request below is answered for whichever
            season the viewer selected. Renders nothing itself. */}
        <SeasonProvider>
          <WouterRouter
            base={ROUTER_BASE}
            hook={useSeasonLocation}
            hrefs={seasonHref}
          >
            <Router />
            {/* Blocking student Terms & Conditions consent gate. Self-gates on
                role + acceptance; covers the whole app via a portalled overlay. */}
            <TermsGate />
            {/* Admin-managed student pop-ups, shown one at a time after T&C.
                Self-gates on role + terms + pending list. Separate from T&C. */}
            <PopupGate />
            <ProductTour />
            {/* One-time GRIT Miles intro pop-up. Self-gates on role + terms +
                dashboard route + a localStorage "seen" flag. Never blocking. */}
            <GritIntroDialog />
            {/* Installable-app prompts. Both self-gate: the install invite is
                students-only and hidden once installed; the update banner
                appears only when a new build has been deployed. */}
            <InstallPrompt />
            <UpdatePrompt />
            {/* Catches the SSO deep link that carries the auth token back into
                the APK. Renders nothing, and no-ops entirely on web. */}
            <NativeAuthBridge />
          </WouterRouter>
        </SeasonProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
