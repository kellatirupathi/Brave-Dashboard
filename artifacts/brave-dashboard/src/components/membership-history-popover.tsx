import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getStudentMembershipHistory,
  type MembershipTimelineEvent,
} from "@/lib/membership-api";
import { normalizeError } from "@/lib/api-error";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  History,
  UserPlus,
  LogIn,
  LogOut,
  UserMinus,
  CircleUser,
} from "lucide-react";

function EventIcon({ kind }: { kind: MembershipTimelineEvent["kind"] }) {
  const cls = "h-3.5 w-3.5";
  switch (kind) {
    case "account_created":
      return <CircleUser className={cls} />;
    case "joined":
      return <LogIn className={cls} />;
    case "left":
      return <LogOut className={cls} />;
    case "removed":
      return <UserMinus className={cls} />;
    default:
      return <UserPlus className={cls} />;
  }
}

function StatusPill({
  status,
}: {
  status: MembershipTimelineEvent["status"];
}) {
  if (!status) return null;
  if (status === "approved")
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        Approved
      </Badge>
    );
  if (status === "rejected")
    return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

export function MembershipHistoryPopover({
  userId,
  name,
}: {
  userId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["admin", "membership-history", userId],
    queryFn: () => getStudentMembershipHistory(userId),
    enabled: open,
    staleTime: 30_000,
  });

  const events = query.data?.events ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <History className="h-3.5 w-3.5" />
          History
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={6}
        collisionPadding={12}
        className="w-80 max-h-[60vh] overflow-y-auto p-0"
      >
        <div className="border-b px-4 py-3">
          <div className="text-sm font-medium">Membership history</div>
          <div className="truncate text-xs text-muted-foreground">{name}</div>
        </div>
        <div className="px-4 py-3">
          {query.isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : query.isError ? (
            <div className="py-4 text-sm text-destructive">
              {normalizeError(query.error).message}
            </div>
          ) : events.length === 0 ? (
            <div className="py-4 text-sm text-muted-foreground">
              No membership activity yet.
            </div>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-5">
              {events.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full border bg-background text-muted-foreground">
                    <EventIcon kind={ev.kind} />
                  </span>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium leading-tight">
                      {ev.title}
                    </div>
                    <StatusPill status={ev.status} />
                  </div>
                  {ev.teamName ? (
                    <div className="text-xs text-muted-foreground">
                      {ev.teamName}
                    </div>
                  ) : null}
                  {ev.note ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {ev.note}
                    </div>
                  ) : null}
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatDateTime(ev.at)}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
