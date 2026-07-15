// Admin → Communications → Submission Requests. Lists pending "Request to
// submit" requests filed by team leaders while the global Projects Submissions
// Lock is on. Shows team name, leader, requested date/time and purpose, with an
// Enable action. Reuses the shared list (also shown on Config → Teams
// Submissions).
import { Inbox } from "lucide-react";
import { SubmissionRequestsList } from "@/components/submission-requests-list";

export default function AdminSubmissionRequests() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Inbox className="w-7 h-7 text-primary" />
          Submission Requests
        </h1>
        <p className="text-muted-foreground mt-1">
          Team leaders' requests to submit revenue / order book entries while
          submissions are locked. Enable a team to let it submit.
        </p>
      </div>
      <SubmissionRequestsList />
    </div>
  );
}
