import { useGetAdminReviewQueue } from "@workspace/api-client-react";
import { formatINR, formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertCircle,
  Check,
  Sparkles,
  Search,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { DocumentLinkButton } from "@/components/document-viewer";
import { useEffect, useState } from "react";
import { Link } from "wouter";

/**
 * Campus-scoped review queue for coordinators — VIEW ONLY.
 *
 * Uses the same /api/admin/review-queue endpoint as admins — the backend
 * auto-scopes results to the coordinator's own campus. Coordinators can read
 * the queue and open documents, but cannot verify / reject / re-open; those
 * actions are admin-only (enforced server-side too).
 */

type QueueItem = {
  id: number;
  type: "revenue";
  teamId: number;
  teamName: string;
  campusName: string;
  projectTitle: string;
  clientName: string;
  amount: number;
  submittedAt: string | Date;
  isOverdue: boolean;
  supportingDocUrl?: string | null;
  brdUrl?: string | null;
  status: "submitted" | "verified" | "rejected";
  verifiedAmount?: number | null;
  verifiedAt?: string | Date | null;
  adminNotes?: string | null;
};

type Tab = "pending" | "approved" | "rejected";

export default function CoordinatorQueue() {
  const [tab, setTab] = useState<Tab>("pending");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setSearchInput("");
    setSearch("");
  }, [tab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Review Queue</h1>
          <p className="text-muted-foreground mt-1">
            View revenue entries from teams on your campus. Verification,
            rejection, and re-opening are handled by admins.
          </p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by team, project, client, amount…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
            data-testid="input-search-queue"
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending review
          </TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">
            Approved
          </TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">
            Rejected
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-6">
          <QueueList status="submitted" search={search} />
        </TabsContent>

        <TabsContent value="approved" className="mt-6">
          <QueueList status="verified" search={search} />
        </TabsContent>

        <TabsContent value="rejected" className="mt-6">
          <QueueList status="rejected" search={search} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QueueList({
  status,
  search,
}: {
  status: "submitted" | "verified" | "rejected";
  search: string;
}) {
  const type = "revenue" as const;
  const { data: queue, isLoading } = useGetAdminReviewQueue({
    type,
    status: status as "submitted" | "verified",
    search: search || undefined,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const items = (queue?.items ?? []) as QueueItem[];
  const totalCount = queue?.totalCount ?? items.length;
  const overdueCount = queue?.overdueCount ?? 0;

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        <span className="mr-2">{totalCount} total</span>
        {status === "submitted" && overdueCount > 0 ? (
          <span className="text-destructive font-medium">
            · {overdueCount} overdue
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <EmptyState status={status} />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <QueueRow key={item.id} item={item} status={status} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  status,
}: {
  status: "submitted" | "verified" | "rejected";
}) {
  if (status === "rejected") {
    return (
      <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
        <XCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-40" />
        <h3 className="text-lg font-semibold text-foreground">
          No rejected entries
        </h3>
        <p>No revenue entries from your campus have been rejected.</p>
      </div>
    );
  }
  return (
    <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
      <Check className="w-12 h-12 mx-auto mb-4 text-green-500 opacity-50" />
      <h3 className="text-lg font-semibold text-foreground">
        {status === "submitted"
          ? "Pending queue is empty"
          : "No approved entries"}
      </h3>
      <p>
        {status === "submitted"
          ? "You're all caught up on revenue reviews for your campus."
          : "No revenue entries from your campus have been verified yet."}
      </p>
    </div>
  );
}

function QueueRow({
  item,
  status,
}: {
  item: QueueItem;
  status: "submitted" | "verified" | "rejected";
}) {
  return (
    <Card
      className={`group relative transition-shadow hover:shadow-md hover:border-primary/40 ${
        item.isOverdue ? "border-destructive/50 shadow-sm" : ""
      }`}
      data-testid={`row-queue-${item.id}`}
    >
      <Link
        href={`/teams/${item.teamId}`}
        className="absolute inset-0 z-10 rounded-lg cursor-pointer focus:outline-none"
        aria-label={`Open ${item.teamName} team details`}
        data-testid={`link-queue-card-${item.id}`}
      />
      <div className="p-4 flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="font-bold text-base group-hover:underline underline-offset-2 truncate">
              {item.teamName}
            </h3>
            <Badge variant="outline">{item.campusName}</Badge>
            {status === "verified" ? (
              <Badge className="h-5 px-1.5 bg-green-600 hover:bg-green-600 text-white">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
              </Badge>
            ) : status === "rejected" ? (
              <Badge className="h-5 px-1.5 bg-destructive hover:bg-destructive text-destructive-foreground">
                <XCircle className="w-3 h-3 mr-1" /> Rejected
              </Badge>
            ) : item.isOverdue ? (
              <Badge variant="destructive" className="h-5 px-1.5">
                <AlertCircle className="w-3 h-3 mr-1" /> Overdue
              </Badge>
            ) : Date.now() - new Date(item.submittedAt).getTime() <
              10 * 60 * 1000 ? (
              <Badge
                className="h-5 px-1.5 bg-emerald-600 hover:bg-emerald-600 text-white"
                data-testid={`badge-just-submitted-${item.id}`}
              >
                <Sparkles className="w-3 h-3 mr-1" /> Just submitted
              </Badge>
            ) : null}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                Project
              </div>
              <div className="font-medium truncate">{item.projectTitle}</div>
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">
                Client
              </div>
              <div className="font-medium truncate">{item.clientName}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                {status === "verified" ? "Verified amount" : "Amount claimed"}
              </div>
              <div className="font-bold text-primary">
                {status === "verified"
                  ? formatINR(item.verifiedAmount ?? item.amount)
                  : formatINR(item.amount)}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-muted-foreground">
                {status === "verified" ? "Verified" : "Submitted"}
              </div>
              <div>
                {status === "verified" && item.verifiedAt
                  ? formatDateTime(item.verifiedAt as string)
                  : formatDateTime(item.submittedAt as string)}
              </div>
            </div>
          </div>

          {status === "verified" && item.amount !== item.verifiedAmount ? (
            <div className="mt-2 text-xs text-muted-foreground">
              Originally claimed: {formatINR(item.amount)}
            </div>
          ) : null}

          {status === "verified" && item.adminNotes ? (
            <div className="mt-2 text-xs text-muted-foreground italic line-clamp-2">
              Notes: {item.adminNotes}
            </div>
          ) : null}

          {status === "rejected" && item.adminNotes ? (
            <div className="mt-2 text-xs text-destructive/80 italic">
              Rejection reason: {item.adminNotes}
            </div>
          ) : null}
        </div>

        <div
          className="flex flex-col sm:flex-row lg:flex-row gap-2 lg:items-center lg:w-auto relative z-20 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap gap-2">
            <DocumentLinkButton
              url={item.supportingDocUrl ?? null}
              label="Document"
              filename={`${item.teamName}-supporting-doc`}
              testId={`button-view-doc-${item.id}`}
            />
            <DocumentLinkButton
              url={item.brdUrl ?? null}
              label="BRD"
              filename={`${item.teamName}-brd`}
              testId={`button-view-brd-${item.id}`}
            />
          </div>

          <Badge
            variant="outline"
            className="self-center text-muted-foreground"
          >
            View only
          </Badge>
        </div>
      </div>
    </Card>
  );
}
