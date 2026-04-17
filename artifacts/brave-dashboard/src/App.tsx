import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@workspace/replit-auth-web";
import NotFound from "@/pages/not-found";

// Auth
import Login from "@/pages/auth/login";

// Student
import TeamDashboard from "@/pages/student/dashboard";
import ProjectsList from "@/pages/student/projects/list";
import ProjectDetail from "@/pages/student/projects/detail";
import Leaderboard from "@/pages/student/leaderboard";
import TeamProfile from "@/pages/student/team";
import DemoDay from "@/pages/student/demo-day";
import Notifications from "@/pages/student/notifications";

// Coordinator
import CoordinatorDashboard from "@/pages/coordinator/dashboard";
import CoordinatorTeams from "@/pages/coordinator/teams";
import CoordinatorLeaderboard from "@/pages/coordinator/leaderboard";
import CoordinatorAnnouncements from "@/pages/coordinator/announcements";

// Admin
import AdminDashboard from "@/pages/admin/dashboard";
import AdminQueue from "@/pages/admin/queue";
import AdminTeams from "@/pages/admin/teams";
import AdminLeaderboard from "@/pages/admin/leaderboard";
import AdminDemoDay from "@/pages/admin/demo-day";
import AdminUsers from "@/pages/admin/users";
import AdminCampuses from "@/pages/admin/campuses";
import AdminConfig from "@/pages/admin/config";
import AdminRoster from "@/pages/admin/roster";
import AdminAuditLog from "@/pages/admin/audit-log";
import AdminAnnouncements from "@/pages/admin/announcements";

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

function ProtectedRoute({ component: Component, allowedRoles }: { component: React.ComponentType, allowedRoles: string[] }) {
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
    return <Redirect to="/login" />;
  }

  if (user.role === "coordinator") return <Redirect to="/coordinator" />;
  if (user.role === "admin") return <Redirect to="/admin" />;

  // Student dashboard
  return (
    <Layout>
      <TeamDashboard />
    </Layout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />

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
      <Route path="/demo-day">
        <ProtectedRoute component={DemoDay} allowedRoles={["student"]} />
      </Route>
      <Route path="/notifications">
        <ProtectedRoute component={Notifications} allowedRoles={["student"]} />
      </Route>

      {/* Coordinator Routes */}
      <Route path="/coordinator">
        <ProtectedRoute component={CoordinatorDashboard} allowedRoles={["coordinator"]} />
      </Route>
      <Route path="/coordinator/teams">
        <ProtectedRoute component={CoordinatorTeams} allowedRoles={["coordinator"]} />
      </Route>
      <Route path="/coordinator/leaderboard">
        <ProtectedRoute component={CoordinatorLeaderboard} allowedRoles={["coordinator"]} />
      </Route>
      <Route path="/coordinator/announcements">
        <ProtectedRoute component={CoordinatorAnnouncements} allowedRoles={["coordinator"]} />
      </Route>

      {/* Admin Routes */}
      <Route path="/admin">
        <ProtectedRoute component={AdminDashboard} allowedRoles={["admin"]} />
      </Route>
      <Route path="/admin/queue">
        <ProtectedRoute component={AdminQueue} allowedRoles={["admin"]} />
      </Route>
      <Route path="/admin/teams">
        <ProtectedRoute component={AdminTeams} allowedRoles={["admin"]} />
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
        <ProtectedRoute component={AdminAnnouncements} allowedRoles={["admin"]} />
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
