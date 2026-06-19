// Coordinator variant of the full-page journal team drill-down. Shares the
// admin page; the API scopes coordinators to their own campus automatically.
import JournalTeamDetail from "@/pages/admin/journal-team-detail";

export default function CoordinatorJournalTeamDetail() {
  return <JournalTeamDetail scope="coordinator" />;
}
