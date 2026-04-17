import Leaderboard from "../student/leaderboard";

export default function AdminLeaderboard() {
  return (
    <div className="space-y-4">
      <div className="bg-primary/10 text-primary p-4 rounded-lg text-sm font-medium border border-primary/20">
        Admin View: You can see all teams regardless of visibility status.
      </div>
      <Leaderboard />
    </div>
  );
}
