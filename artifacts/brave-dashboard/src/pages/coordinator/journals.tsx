// Coordinator and admin share the same journals view; the API scopes
// coordinator users to their own campus automatically. Passing
// scope="coordinator" hides the campus filter (redundant for coordinators).
import AdminJournals from "@/pages/admin/journals";

export default function CoordinatorJournals() {
  return <AdminJournals scope="coordinator" />;
}
