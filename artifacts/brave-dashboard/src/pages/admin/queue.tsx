import { useGetAdminReviewQueue, useVerifyOrderBookEntry, useRejectOrderBookEntry, useVerifyRevenueEntry, useRejectRevenueEntry, getGetAdminReviewQueueQueryKey } from "@workspace/api-client-react";
import { formatINR, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, Check, X, FileText, IndianRupee } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

export default function AdminQueue() {
  const [type, setType] = useState<"revenue" | "order_book">("revenue");
  const { data: queue, isLoading } = useGetAdminReviewQueue({ type });
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const verifyOrderBook = useVerifyOrderBookEntry();
  const rejectOrderBook = useRejectOrderBookEntry();
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
      if (type === "order_book") {
        verifyOrderBook.mutate({ id: actionItem.id, data: { verifiedAmount: amount, adminNotes } }, {
          onSuccess: () => {
            toast({ title: "Order book entry verified" });
            queryClient.invalidateQueries({ queryKey: getGetAdminReviewQueueQueryKey({ type }) });
            resetAction();
          }
        });
      } else {
        verifyRevenue.mutate({ id: actionItem.id, data: { verifiedAmount: amount, adminNotes } }, {
          onSuccess: () => {
            toast({ title: "Revenue entry verified" });
            queryClient.invalidateQueries({ queryKey: getGetAdminReviewQueueQueryKey({ type }) });
            resetAction();
          }
        });
      }
    } else {
      if (type === "order_book") {
        rejectOrderBook.mutate({ id: actionItem.id, data: { adminNotes } }, {
          onSuccess: () => {
            toast({ title: "Order book entry rejected" });
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

  const isPending = verifyOrderBook.isPending || rejectOrderBook.isPending || verifyRevenue.isPending || rejectRevenue.isPending;

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Review Queue</h1>
          <p className="text-muted-foreground mt-1">
            {queue?.overdueCount ? <span className="text-destructive font-medium mr-2">{queue.overdueCount} overdue items</span> : null}
            Verify submitted revenue and order book entries
          </p>
        </div>
        
        <Tabs value={type} onValueChange={(v: any) => setType(v)}>
          <TabsList>
            <TabsTrigger value="revenue"><IndianRupee className="w-4 h-4 mr-2" /> Revenue</TabsTrigger>
            <TabsTrigger value="order_book"><FileText className="w-4 h-4 mr-2" /> Order Book</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4">
        {queue?.items?.map((item) => (
          <Card key={item.id} className={item.isOverdue ? "border-destructive/50 shadow-sm" : ""}>
            <div className="p-4 flex flex-col md:flex-row gap-6">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-lg">{item.teamName}</h3>
                  <Badge variant="outline">{item.campusName}</Badge>
                  {item.isOverdue && <Badge variant="destructive" className="h-5 px-1.5"><AlertCircle className="w-3 h-3 mr-1" /> Overdue</Badge>}
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

                {item.notes && (
                  <div className="mt-4 text-sm bg-muted/50 p-3 rounded-md">
                    <strong>Student notes:</strong> {item.notes}
                  </div>
                )}
              </div>
              
              <div className="w-full md:w-64 flex flex-col justify-between gap-4 border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-6">
                <div className="space-y-2">
                  {item.supportingDocUrl && (
                    <Button variant="outline" className="w-full justify-start" asChild>
                      <a href={item.supportingDocUrl.startsWith("/") ? `/api${item.supportingDocUrl}` : item.supportingDocUrl} target="_blank" rel="noopener noreferrer">
                        <FileText className="w-4 h-4 mr-2" /> View Document
                      </a>
                    </Button>
                  )}
                  {item.paymentProofUrl && (
                    <Button variant="outline" className="w-full justify-start" asChild>
                      <a href={item.paymentProofUrl.startsWith("/") ? `/api${item.paymentProofUrl}` : item.paymentProofUrl} target="_blank" rel="noopener noreferrer">
                        <FileText className="w-4 h-4 mr-2" /> Payment Proof
                      </a>
                    </Button>
                  )}
                  {item.invoiceUrl && (
                    <Button variant="outline" className="w-full justify-start" asChild>
                      <a href={item.invoiceUrl.startsWith("/") ? `/api${item.invoiceUrl}` : item.invoiceUrl} target="_blank" rel="noopener noreferrer">
                        <FileText className="w-4 h-4 mr-2" /> Invoice
                      </a>
                    </Button>
                  )}
                </div>

                <div className="flex gap-2">
                  <Dialog open={actionItem?.id === item.id && actionType === 'approve'} onOpenChange={(open) => { if(!open) resetAction(); else openAction(item, 'approve'); }}>
                    <DialogTrigger asChild>
                      <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white"><Check className="w-4 h-4 mr-1" /> Verify</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Verify {type === 'revenue' ? 'Revenue' : 'Order Book'} Entry</DialogTitle>
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
                        <DialogTitle>Reject {type === 'revenue' ? 'Revenue' : 'Order Book'} Entry</DialogTitle>
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
            <p>You're all caught up on {type === 'revenue' ? 'revenue' : 'order book'} reviews!</p>
          </div>
        )}
      </div>
    </div>
  );
}
