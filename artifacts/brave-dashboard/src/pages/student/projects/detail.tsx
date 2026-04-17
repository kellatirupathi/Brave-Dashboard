import { useGetProject, useCreateOrderBookEntry, useCreateRevenueEntry, getGetProjectQueryKey } from "@workspace/api-client-react";
import { formatINR, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useParams } from "wouter";
import { ArrowLeft, Plus, CheckCircle2, Clock, XCircle, FileText } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function ProjectDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { data: project, isLoading } = useGetProject(id);
  
  const createOrderBook = useCreateOrderBookEntry();
  const createRevenue = useCreateRevenueEntry();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isOrderOpen, setIsOrderOpen] = useState(false);
  const [isRevenueOpen, setIsRevenueOpen] = useState(false);

  // Form states
  const [clientName, setClientName] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [paymentDate, setPaymentDate] = useState("");
  const [notes, setNotes] = useState("");

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (!project) return <div>Project not found</div>;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified": return <Badge className="bg-green-500 hover:bg-green-600 border-none text-white"><CheckCircle2 className="w-3 h-3 mr-1" /> Verified</Badge>;
      case "submitted": return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"><Clock className="w-3 h-3 mr-1" /> Pending Review</Badge>;
      case "rejected": return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      default: return <Badge variant="outline"><FileText className="w-3 h-3 mr-1" /> Draft</Badge>;
    }
  };

  const handleAddOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    createOrderBook.mutate({ data: { projectId: id, clientName, amount: Number(amount), notes } }, {
      onSuccess: () => {
        toast({ title: "Order added" });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        setIsOrderOpen(false);
        resetForms();
      }
    });
  };

  const handleAddRevenue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !paymentDate) return;
    createRevenue.mutate({ data: { projectId: id, clientName, amount: Number(amount), paymentDate, notes } }, {
      onSuccess: () => {
        toast({ title: "Revenue added" });
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
        setIsRevenueOpen(false);
        resetForms();
      }
    });
  };

  const resetForms = () => {
    setClientName("");
    setAmount("");
    setPaymentDate("");
    setNotes("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/projects">
          <Button variant="ghost" size="icon" className="rounded-full"><ArrowLeft className="w-5 h-5" /></Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{project.title}</h1>
          <p className="text-muted-foreground">{project.description}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-primary text-primary-foreground border-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium opacity-90">Verified Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatINR(project.verifiedRevenue)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Order Book</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatINR(project.verifiedOrderBook)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{project.clientCount}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="revenue" className="mt-8">
        <TabsList className="w-full justify-start border-b rounded-none h-auto bg-transparent p-0">
          <TabsTrigger value="revenue" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">Revenue Entries</TabsTrigger>
          <TabsTrigger value="orderbook" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3">Order Book</TabsTrigger>
        </TabsList>
        
        <TabsContent value="revenue" className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Revenue Entries</h3>
            <Dialog open={isRevenueOpen} onOpenChange={(open) => { setIsRevenueOpen(open); if(!open) resetForms(); }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add Revenue</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Revenue Entry</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddRevenue} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Client Name</label>
                    <Input value={clientName} onChange={e => setClientName(e.target.value)} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Amount (₹)</label>
                      <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Payment Date</label>
                      <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes</label>
                    <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
                  </div>
                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={createRevenue.isPending}>
                      {createRevenue.isPending && <Spinner className="w-4 h-4 mr-2" />} Save
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          
          <Card>
            <div className="divide-y">
              {project.revenueEntries.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No revenue entries yet.</div>
              ) : (
                project.revenueEntries.map((entry) => (
                  <div key={entry.id} className="p-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center hover:bg-muted/30 transition-colors">
                    <div>
                      <div className="font-semibold text-lg">{entry.clientName}</div>
                      <div className="text-sm text-muted-foreground flex gap-3 mt-1">
                        <span>Amount: <strong className="text-foreground">{formatINR(entry.amount)}</strong></span>
                        <span>•</span>
                        <span>Paid: {formatDate(entry.paymentDate)}</span>
                      </div>
                      {entry.adminNotes && entry.status === 'rejected' && (
                        <div className="text-sm text-destructive mt-2 bg-destructive/10 p-2 rounded-md">
                          <strong>Admin note:</strong> {entry.adminNotes}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(entry.status)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </TabsContent>
        
        <TabsContent value="orderbook" className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Order Book Entries</h3>
            <Dialog open={isOrderOpen} onOpenChange={(open) => { setIsOrderOpen(open); if(!open) resetForms(); }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Add Order</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Order Book Entry</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddOrder} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Client Name</label>
                    <Input value={clientName} onChange={e => setClientName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount (₹)</label>
                    <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes</label>
                    <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
                  </div>
                  <div className="flex justify-end pt-4">
                    <Button type="submit" disabled={createOrderBook.isPending}>
                      {createOrderBook.isPending && <Spinner className="w-4 h-4 mr-2" />} Save
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          
          <Card>
            <div className="divide-y">
              {project.orderBookEntries.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No order book entries yet.</div>
              ) : (
                project.orderBookEntries.map((entry) => (
                  <div key={entry.id} className="p-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center hover:bg-muted/30 transition-colors">
                    <div>
                      <div className="font-semibold text-lg">{entry.clientName}</div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Amount: <strong className="text-foreground">{formatINR(entry.amount)}</strong>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(entry.status)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
