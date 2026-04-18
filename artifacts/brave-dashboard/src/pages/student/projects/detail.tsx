import {
  useGetProject,
  useCreateOrderBookEntry,
  useCreateRevenueEntry,
  useSubmitOrderBookEntry,
  useSubmitRevenueEntry,
  useRequestUploadUrl,
  getGetProjectQueryKey,
} from "@workspace/api-client-react";
import { formatINR, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useParams } from "wouter";
import {
  ArrowLeft,
  Plus,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Send,
  Upload,
  Paperclip,
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type UploadField = "supportingDoc" | "paymentProof" | "invoice";

export default function ProjectDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { data: project, isLoading } = useGetProject(id);

  const createOrderBook = useCreateOrderBookEntry();
  const createRevenue = useCreateRevenueEntry();
  const submitOrderBook = useSubmitOrderBookEntry();
  const submitRevenue = useSubmitRevenueEntry();
  const requestUpload = useRequestUploadUrl();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [isOrderOpen, setIsOrderOpen] = useState(false);
  const [isRevenueOpen, setIsRevenueOpen] = useState(false);

  // Form states
  const [clientName, setClientName] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [paymentDate, setPaymentDate] = useState("");
  const [notes, setNotes] = useState("");
  const [supportingDocUrl, setSupportingDocUrl] = useState<string | null>(null);
  const [paymentProofUrl, setPaymentProofUrl] = useState<string | null>(null);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<UploadField | null>(null);

  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  if (!project) return <div>Project not found</div>;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return (
          <Badge className="bg-green-500 hover:bg-green-600 border-none text-white">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
          </Badge>
        );
      case "submitted":
        return (
          <Badge
            variant="secondary"
            className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"
          >
            <Clock className="w-3 h-3 mr-1" /> Pending Review
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" /> Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <FileText className="w-3 h-3 mr-1" /> Draft
          </Badge>
        );
    }
  };

  const handleUpload = async (
    field: UploadField,
    file: File | undefined,
  ): Promise<void> => {
    if (!file) return;
    setUploadingField(field);
    try {
      const presigned = await requestUpload.mutateAsync({
        data: { name: file.name, size: file.size, contentType: file.type },
      });
      const putRes = await fetch(presigned.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload failed");
      const url = presigned.objectPath;
      if (field === "supportingDoc") setSupportingDocUrl(url);
      else if (field === "paymentProof") setPaymentProofUrl(url);
      else setInvoiceUrl(url);
      toast({ title: "File uploaded" });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setUploadingField(null);
    }
  };

  const handleAddOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    createOrderBook.mutate(
      {
        data: {
          projectId: id,
          clientName,
          amount: Number(amount),
          notes,
          supportingDocUrl: supportingDocUrl ?? undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Order added" });
          refresh();
          setIsOrderOpen(false);
          resetForms();
        },
      },
    );
  };

  const handleAddRevenue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !paymentDate) return;
    createRevenue.mutate(
      {
        data: {
          projectId: id,
          clientName,
          amount: Number(amount),
          paymentDate,
          notes,
          paymentProofUrl: paymentProofUrl ?? undefined,
          invoiceUrl: invoiceUrl ?? undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Revenue added" });
          refresh();
          setIsRevenueOpen(false);
          resetForms();
        },
      },
    );
  };

  const handleSubmitOrder = (entryId: number) => {
    submitOrderBook.mutate(
      { id: entryId },
      {
        onSuccess: () => {
          toast({ title: "Sent for verification" });
          refresh();
        },
        onError: (err) =>
          toast({
            title: "Could not submit",
            description: err instanceof Error ? err.message : "Try again",
            variant: "destructive",
          }),
      },
    );
  };

  const handleSubmitRevenue = (entryId: number) => {
    submitRevenue.mutate(
      { id: entryId },
      {
        onSuccess: () => {
          toast({ title: "Sent for verification" });
          refresh();
        },
        onError: (err) =>
          toast({
            title: "Could not submit",
            description: err instanceof Error ? err.message : "Try again",
            variant: "destructive",
          }),
      },
    );
  };

  const resetForms = () => {
    setClientName("");
    setAmount("");
    setPaymentDate("");
    setNotes("");
    setSupportingDocUrl(null);
    setPaymentProofUrl(null);
    setInvoiceUrl(null);
  };

  const docLink = (url: string | null | undefined, label: string) => {
    if (!url) return null;
    const href = url.startsWith("/") ? `/api${url}` : url;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80"
      >
        <Paperclip className="w-3 h-3" /> {label}
      </a>
    );
  };

  const FilePicker = ({
    field,
    currentUrl,
    label,
    accept = "application/pdf,image/*",
  }: {
    field: UploadField;
    currentUrl: string | null;
    label: string;
    accept?: string;
  }) => (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-3">
        <label
          className={`inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md cursor-pointer hover:bg-muted ${
            uploadingField === field ? "opacity-60 pointer-events-none" : ""
          }`}
        >
          {uploadingField === field ? (
            <Spinner className="w-4 h-4" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {currentUrl ? "Replace file" : "Choose file"}
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => handleUpload(field, e.target.files?.[0])}
          />
        </label>
        {currentUrl && (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-green-600" /> Uploaded
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/projects">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{project.title}</h1>
          <p className="text-muted-foreground">{project.description}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-primary text-primary-foreground border-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium opacity-90">
              Verified Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatINR(project.verifiedRevenue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Order Book
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatINR(project.verifiedOrderBook)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{project.clientCount}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="revenue" className="mt-8">
        <TabsList className="w-full justify-start border-b rounded-none h-auto bg-transparent p-0">
          <TabsTrigger
            value="revenue"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
          >
            Revenue Entries
          </TabsTrigger>
          <TabsTrigger
            value="orderbook"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-6 py-3"
          >
            Order Book
          </TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Revenue Entries</h3>
            <Dialog
              open={isRevenueOpen}
              onOpenChange={(open) => {
                setIsRevenueOpen(open);
                if (!open) resetForms();
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" /> Add Revenue
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Revenue Entry</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddRevenue} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Client Name</label>
                    <Input
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Amount (₹)</label>
                      <Input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(Number(e.target.value))}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Payment Date</label>
                      <Input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes</label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                  <FilePicker
                    field="paymentProof"
                    currentUrl={paymentProofUrl}
                    label="Payment proof (PDF / image)"
                  />
                  <FilePicker
                    field="invoice"
                    currentUrl={invoiceUrl}
                    label="Invoice (optional)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Files are private and visible only to your team and the
                    coordinator/admin reviewing this entry.
                  </p>
                  <div className="flex justify-end pt-4">
                    <Button
                      type="submit"
                      disabled={
                        createRevenue.isPending || uploadingField !== null
                      }
                    >
                      {createRevenue.isPending && (
                        <Spinner className="w-4 h-4 mr-2" />
                      )}{" "}
                      Save as Draft
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <div className="divide-y">
              {project.revenueEntries.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No revenue entries yet.
                </div>
              ) : (
                project.revenueEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center hover:bg-muted/30 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="font-semibold text-lg">
                        {entry.clientName}
                      </div>
                      <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                        <span>
                          Amount:{" "}
                          <strong className="text-foreground">
                            {formatINR(entry.amount)}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>Paid: {formatDate(entry.paymentDate)}</span>
                      </div>
                      <div className="flex flex-wrap gap-3 pt-1">
                        {docLink(entry.paymentProofUrl, "Payment proof")}
                        {docLink(entry.invoiceUrl, "Invoice")}
                        {docLink(entry.testimonialUrl, "Testimonial")}
                      </div>
                      {entry.adminNotes && entry.status === "rejected" && (
                        <div className="text-sm text-destructive mt-2 bg-destructive/10 p-2 rounded-md">
                          <strong>Admin note:</strong> {entry.adminNotes}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(entry.status)}
                      {entry.status === "draft" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={submitRevenue.isPending}
                          onClick={() => handleSubmitRevenue(entry.id)}
                        >
                          <Send className="w-3 h-3 mr-1" /> Submit for
                          verification
                        </Button>
                      )}
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
            <Dialog
              open={isOrderOpen}
              onOpenChange={(open) => {
                setIsOrderOpen(open);
                if (!open) resetForms();
              }}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-2" /> Add Order
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Order Book Entry</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddOrder} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Client Name</label>
                    <Input
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Amount (₹)</label>
                    <Input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes</label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                  <FilePicker
                    field="supportingDoc"
                    currentUrl={supportingDocUrl}
                    label="Supporting document (PO, signed contract, etc.)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Files are private and visible only to your team and the
                    coordinator/admin reviewing this entry.
                  </p>
                  <div className="flex justify-end pt-4">
                    <Button
                      type="submit"
                      disabled={
                        createOrderBook.isPending || uploadingField !== null
                      }
                    >
                      {createOrderBook.isPending && (
                        <Spinner className="w-4 h-4 mr-2" />
                      )}{" "}
                      Save as Draft
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <div className="divide-y">
              {project.orderBookEntries.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No order book entries yet.
                </div>
              ) : (
                project.orderBookEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center hover:bg-muted/30 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="font-semibold text-lg">
                        {entry.clientName}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Amount:{" "}
                        <strong className="text-foreground">
                          {formatINR(entry.amount)}
                        </strong>
                      </div>
                      <div className="flex flex-wrap gap-3 pt-1">
                        {docLink(entry.supportingDocUrl, "Supporting document")}
                      </div>
                      {entry.adminNotes && entry.status === "rejected" && (
                        <div className="text-sm text-destructive mt-2 bg-destructive/10 p-2 rounded-md">
                          <strong>Admin note:</strong> {entry.adminNotes}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(entry.status)}
                      {entry.status === "draft" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={submitOrderBook.isPending}
                          onClick={() => handleSubmitOrder(entry.id)}
                        >
                          <Send className="w-3 h-3 mr-1" /> Submit for
                          verification
                        </Button>
                      )}
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
