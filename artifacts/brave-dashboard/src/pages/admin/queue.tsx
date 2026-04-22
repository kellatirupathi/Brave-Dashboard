import { useGetAdminReviewQueue, useVerifyRevenueEntry, useRejectRevenueEntry, getGetAdminReviewQueueQueryKey } from "@workspace/api-client-react";
import { formatINR, formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Check, X, Sparkles } from "lucide-react";
import { DocumentLinkButton } from "@/components/document-viewer";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Search } from "lucide-react";

export default function AdminQueue() {
  const type = "revenue" as const;
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);
  const { data: queue, isLoading } = useGetAdminReviewQueue({ type, search: search || undefined });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const verifyRevenue = useVerifyRevenueEntry();
  const rejectRevenue = useRejectRevenueEntry();

  const [actionItem, setActionItem] = useState<any>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [verifiedAmount, setVerifiedAmount] = useState<number | "">("");
  const [adminNotes, setAdminNotes] = useState("");

  const handleAction = () => {
    if (!actionItem || !actionType) return;
    
    if (actionType === "approve") {
      const amount = Number(verifiedAmount) || actionItem.amount;
      verifyRevenue.mutate({ id: actionItem.id, data: { verifiedAmount: amount, adminNotes } }, {
        onSuccess: () => {
          toast({ title: "Revenue entry verified" });
          queryClient.invalidateQueries({ queryKey: getGetAdminReviewQueueQueryKey({ type }) });
          resetAction();
        }
      });
    } else {
      rejectRevenue.mutate({ id: actionItem.id, data: { adminNotes } }, {
        onSuccess: () => {
          toast({ title: "Revenue entry rejected" });
          queryClient.invalidateQueries({ queryKey: getGetAdminReviewQueueQueryKey({ type }) });
          resetAction();
        }
      });
    }
  };

  const resetAction = () => {
    setActionItem(null);
    setActionType(null);
    setVerifiedAmount("");
    setAdminNotes("");
  };

  const openAction = (item: any, aType: "approve" | "reject") => {
    setActionItem(item);
    setActionType(aType);
    setVerifiedAmount(item.amount);
    setAdminNotes("");
  };

  const isPending = verifyRevenue.isPending || rejectRevenue.isPending;

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Review Queue</h1>
          <p className="text-muted-foreground mt-1">
            <span className="mr-2">{queue?.totalCount ?? 0} total</span>
            {queue?.overdueCount ? <span className="text-destructive font-medium mr-2">· {queue.overdueCount} overdue</span> : null}
            · Verify submitted revenue entries
          </p>
        </div>
        <div className="relative w-full md:w-72">
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

      <div className="grid gap-4">
        {queue?.items?.map((item) => (
          <Card
            key={item.id}
            className={`group relative transition-shadow hover:shadow-md hover:border-primary/40 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${item.isOverdue ? "border-destructive/50 shadow-sm" : ""}`}
          >
            <Link
              href={`/admin/teams/${item.teamId}`}
              className="absolute inset-0 z-10 rounded-lg cursor-pointer focus:outline-none"
              aria-label={`Open ${item.teamName} team details`}
              data-testid={`link-queue-card-${item.id}`}
              onKeyDown={(e: React.KeyboardEvent<HTMLAnchorElement>) => {
                if (e.key === " ") {
                  e.preventDefault();
                  (e.currentTarget as HTMLAnchorElement).click();
                }
              }}
            />
            <div className="p-4 flex flex-col md:flex-row gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-lg group-hover:underline underline-offset-2">{item.teamName}</h3>
                  <Badge variant="outline">{item.campusName}</Badge>
                  {item.isOverdue ? (
                    <Badge variant="destructive" className="h-5 px-1.5"><AlertCircle className="w-3 h-3 mr-1" /> Overdue</Badge>
                  ) : (Date.now() - new Date(item.submittedAt).getTime() < 10 * 60 * 1000) ? (
                    <Badge className="h-5 px-1.5 bg-emerald-600 hover:bg-emerald-600 text-white" data-testid={`badge-just-submitted-${item.id}`}><Sparkles className="w-3 h-3 mr-1" /> Just submitted</Badge>
                  ) : null}
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Project</div>
                    <div className="font-medium">{item.projectTitle}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Client</div>
                    <div className="font-medium">{item.clientName}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Amount Claimed</div>
                    <div className="font-bold text-lg text-primary">{formatINR(item.amount)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Submitted</div>
                    <div>{formatDate(item.submittedAt)}</div>
                  </div>
                </div>

              </div>
              
              <div className="w-full md:w-64 flex flex-col justify-between gap-4 border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-6 relative z-20"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="space-y-2">
                  <DocumentLinkButton
                    url={item.supportingDocUrl}
                    label="View Document"
                    filename={`${item.teamName}-supporting-doc`}
                    testId={`button-view-doc-${item.id}`}
                  />
                  <DocumentLinkButton
                    url={item.brdUrl}
                    label="BRD"
                    filename={`${item.teamName}-brd`}
                    testId={`button-view-brd-${item.id}`}
                  />
                </div>

                <div className="flex gap-2">
                  <Dialog open={actionItem?.id === item.id && actionType === 'approve'} onOpenChange={(open) => { if(!open) resetAction(); else openAction(item, 'approve'); }}>
                    <DialogTrigger asChild>
                      <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white"><Check className="w-4 h-4 mr-1" /> Verify</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Verify Revenue Entry</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Verified Amount (₹)</label>
                          <Input 
                            type="number" 
                            value={verifiedAmount} 
                            onChange={(e) => setVerifiedAmount(Number(e.target.value))} 
                          />
                          <p className="text-xs text-muted-foreground">Original claim: {formatINR(item.amount)}</p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Admin Notes (Optional)</label>
                          <Textarea 
                            placeholder="Add internal notes or feedback..."
                            value={adminNotes} 
                            onChange={(e) => setAdminNotes(e.target.value)} 
                          />
                        </div>
                        <div className="flex justify-end pt-4">
                          <Button onClick={handleAction} disabled={isPending} className="bg-green-600 hover:bg-green-700 text-white">
                            {isPending && <Spinner className="w-4 h-4 mr-2" />} Confirm Verification
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={actionItem?.id === item.id && actionType === 'reject'} onOpenChange={(open) => { if(!open) resetAction(); else openAction(item, 'reject'); }}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" className="flex-1"><X className="w-4 h-4 mr-1" /> Reject</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Reject Revenue Entry</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-destructive">Rejection Reason (Required)</label>
                          <Textarea 
                            placeholder="Explain why this is being rejected so the student can fix it..."
                            value={adminNotes} 
                            onChange={(e) => setAdminNotes(e.target.value)} 
                            required
                          />
                        </div>
                        <div className="flex justify-end pt-4">
                          <Button variant="destructive" onClick={handleAction} disabled={isPending || !adminNotes.trim()}>
                            {isPending && <Spinner className="w-4 h-4 mr-2" />} Reject Entry
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
          </Card>
        ))}

        {queue?.items?.length === 0 && (
          <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-lg">
            <Check className="w-12 h-12 mx-auto mb-4 text-green-500 opacity-50" />
            <h3 className="text-lg font-semibold text-foreground">Queue is empty</h3>
            <p>You're all caught up on revenue reviews!</p>
          </div>
        )}
      </div>
    </div>
  );
}
