import {
  Switch,
  Route,
  Router as WouterRouter,
  useLocation,
  Redirect,
} from "wouter";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
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
import Leaderboard from "@/pages/student/leaderboard";
import TeamProfile from "@/pages/student/team";
import GetStarted from "@/pages/student/get-started";
import DemoDay from "@/pages/student/demo-day";
import Notifications from "@/pages/student/notifications";
import Invitations from "@/pages/student/invitations";
import JoinByCode from "@/pages/student/join";
import BrowseTeams from "@/pages/student/browse-teams";

// Coordinator
import CoordinatorDashboard from "@/pages/coordinator/dashboard";
import CoordinatorTeams from "@/pages/coordinator/teams";
import CoordinatorLeaderboard from "@/pages/coordinator/leaderboard";
import CoordinatorAnnouncements from "@/pages/coordinator/announcements";
import CoordinatorQueue from "@/pages/coordinator/queue";

// Admin
import AdminDashboard from "@/pages/admin/dashboard";
import AdminQueue from "@/pages/admin/queue";
import AdminDetailedAnalysis from "@/pages/admin/detailed-analysis";
import AdminTeams from "@/pages/admin/teams";
import AdminTeamDetail from "@/pages/admin/team-detail";
import AdminProjects from "@/pages/admin/projects";
import AdminProjectDetail from "@/pages/admin/project-detail";
import AdminLeaderboard from "@/pages/admin/leaderboard";
import AdminDemoDay from "@/pages/admin/demo-day";
import AdminUsers from "@/pages/admin/users";
import AdminCampuses from "@/pages/admin/campuses";
import AdminCampusDetail from "@/pages/admin/campus-detail";
import AdminConfig from "@/pages/admin/config";
import AdminRoster from "@/pages/admin/roster";
import AdminAuditLog from "@/pages/admin/audit-log";
import AdminAnnouncements from "@/pages/admin/announcements";
import AdminFeedback from "@/pages/admin/feedback";
import AdminResources from "@/pages/admin/resources";

// Coordinator
import CoordinatorProjects from "@/pages/coordinator/projects";

// Progress-enforcement modules (new — additive)
import StudentJournal from "@/pages/student/journal";
import StudentResourcesLibrary from "@/pages/student/resources";
import AdminJournals from "@/pages/admin/journals";
import AdminHeatmap from "@/pages/admin/heatmap";
import AdminCampusInsights from "@/pages/admin/campus-insights";
import AdminNotifications from "@/pages/admin/notifications";
import CoordinatorJournals from "@/pages/coordinator/journals";
import CoordinatorHeatmap from "@/pages/coordinator/heatmap";

// Shared
import Profile from "@/pages/profile";

// Components
import { Layout } from "@/components/layout";
import { Spinner } from "@/components/ui/spinner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({
  component: Component,
  allowedRoles,
}: {
  component: React.ComponentType;
  allowedRoles: string[];
}) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Spinner className="size-10" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Redirect to="/login" />;
  }

  // TEMPORARILY DISABLED: roster gate for student dashboard access.
  // Any Forms-authenticated user is allowed in for now.
  // if (user.role === "student" && !user.isOnRoster) {
  //   return <Redirect to="/not-on-roster" />;
  // }

  if (!allowedRoles.includes(user.role || "")) {
    if (user.role === "student") return <Redirect to="/" />;
    if (user.role === "coordinator") return <Redirect to="/coordinator" />;
    if (user.role === "admin") return <Redirect to="/admin" />;
    return <Redirect to="/login" />;
  }

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
  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Spinner className="size-10" />
      </div>
    );
  }
  // First-time profile completion: students with no team and who have never
  // saved their profile go to /profile first; the profile page then sends
  // them on to /get-started after a successful save.
  if (!team && user && !user.profileCompletedAt) {
    return <Redirect to="/profile" />;
  }
  if (!team) return <Redirect to="/get-started" />;
  return <TeamDashboard />;
}

function RootRedirect() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <Spinner className="size-10" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Landing />;
  }

  // TEMPORARILY DISABLED: roster gate for student dashboard access.
  // Any Forms-authenticated user is allowed in for now.
  // if (user.role === "student" && !user.isOnRoster) {
  //   return <Redirect to="/not-on-roster" />;
  // }

  if (user.role === "coordinator") return <Redirect to="/coordinator" />;
  if (user.role === "admin") return <Redirect to="/admin" />;

  // Student dashboard - redirects to /get-started if no team

  return (
    <Layout>
      <StudentDashboardOrGetStarted />
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/not-on-roster" component={NotOnRoster} />
      {import.meta.env.DEV && <Route path="/dev/login" component={DevLogin} />}

      {/* Root - role-based redirect */}
      <Route path="/" component={RootRedirect} />

      {/* Student Routes */}
      <Route path="/projects">
        <ProtectedRoute component={ProjectsList} allowedRoles={["student"]} />
      </Route>
      <Route path="/projects/:id">
        <ProtectedRoute component={ProjectDetail} allowedRoles={["student"]} />
      </Route>
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
      <Route path="/demo-day">
        <ProtectedRoute component={DemoDay} allowedRoles={["student"]} />
      </Route>
      <Route path="/notifications">
        <ProtectedRoute component={Notifications} allowedRoles={["student"]} />
      </Route>

      {/* Progress enforcement (student) */}
      <Route path="/journal">
        <ProtectedRoute component={StudentJournal} allowedRoles={["student"]} />
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

      {/* Admin Routes */}
      <Route path="/admin">
        <ProtectedRoute component={AdminDashboard} allowedRoles={["admin"]} />
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
      <Route path="/admin/teams">
        <ProtectedRoute component={AdminTeams} allowedRoles={["admin"]} />
      </Route>
      <Route path="/admin/teams/:id">
        <ProtectedRoute component={AdminTeamDetail} allowedRoles={["admin"]} />
      </Route>
      <Route path="/teams/:id">
        <ProtectedRoute
          component={AdminTeamDetail}
          allowedRoles={["student", "coordinator", "admin"]}
        />
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
        <ProtectedRoute component={AdminLeaderboard} allowedRoles={["admin"]} />
      </Route>
      <Route path="/admin/demo-day">
        <ProtectedRoute component={AdminDemoDay} allowedRoles={["admin"]} />
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute component={AdminUsers} allowedRoles={["admin"]} />
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
      <Route path="/admin/config">
        <ProtectedRoute component={AdminConfig} allowedRoles={["admin"]} />
      </Route>
      <Route path="/admin/roster">
        <ProtectedRoute component={AdminRoster} allowedRoles={["admin"]} />
      </Route>
      <Route path="/admin/audit-log">
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

      {/* Admin Notifications — overdue review-queue email subscribers. */}
      <Route path="/admin/notifications">
        <ProtectedRoute
          component={AdminNotifications}
          allowedRoles={["admin"]}
        />
      </Route>

      {/* Progress enforcement (admin) */}
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

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
