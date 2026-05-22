import {
  useGetProject,
  useCreateOrderBookEntry,
  useUpdateOrderBookEntry,
  useDeleteOrderBookEntry,
  useCreateRevenueEntry,
  useSubmitRevenueEntry,
  useRequestUploadUrl,
  useUpdateProject,
  useDeleteProject,
  useGetMyTeam,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  getGetMyTeamQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation } from "wouter";
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
  Pencil,
  Trash2,
} from "lucide-react";
import { DocumentLinkButton } from "@/components/document-viewer";
import { Link } from "wouter";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type UploadField = "supportingDoc" | "brd";

const sanitizeAmount = (raw: string): string =>
  raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

const BRD_ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const isAllowedBrdFile = (file: File): boolean => {
  const name = file.name.toLowerCase();
  const okExt = name.endsWith(".pdf") || name.endsWith(".docx");
  const okMime =
    file.type === "application/pdf" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "";
  return okExt && okMime;
};

function extractUploadErrorMessage(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "data" in err &&
    err.data &&
    typeof err.data === "object" &&
    "error" in err.data &&
    typeof (err.data as { error: unknown }).error === "string"
  ) {
    return (err.data as { error: string }).error;
  }
  if (err instanceof Error && err.message) return err.message;
  return "Please try again";
}

export default function ProjectDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const { data: project, isLoading } = useGetProject(id);
  const { data: myTeam } = useGetMyTeam({
    query: { queryKey: getGetMyTeamQueryKey(), retry: false },
  });
  const { user } = useAuth();
  const isLeader =
    !!myTeam && !!user && String(myTeam.leaderId) === String(user.id);

  const createOrderBook = useCreateOrderBookEntry();
  const updateOrderBook = useUpdateOrderBookEntry();
  const deleteOrderBook = useDeleteOrderBookEntry();
  const createRevenue = useCreateRevenueEntry();
  const submitRevenue = useSubmitRevenueEntry();
  const requestUpload = useRequestUploadUrl();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [isOrderOpen, setIsOrderOpen] = useState(false);
  const [isRevenueOpen, setIsRevenueOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<number | null>(null);
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);
  const [isDeleteProjectOpen, setIsDeleteProjectOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Form states
  const [clientName, setClientName] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState("");
  const [notes, setNotes] = useState("");
  const [supportingDocUrl, setSupportingDocUrl] = useState<string | null>(null);
  const [brdUrl, setBrdUrl] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<UploadField | null>(
    null,
  );

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
            className="bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100 border-none"
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
    if (field === "brd" && !isAllowedBrdFile(file)) {
      toast({
        title: "Invalid file type",
        description:
          "BRD must be a PDF or DOCX file. Images and other formats are not allowed.",
        variant: "destructive",
      });
      return;
    }
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
      else setBrdUrl(url);
      toast({ title: "File uploaded" });
    } catch (err) {
      const description = extractUploadErrorMessage(err);
      toast({
        title: "Upload failed",
        description,
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

  const startEditOrder = (entry: (typeof project.orderBookEntries)[number]) => {
    setEditingOrderId(entry.id);
    setClientName(entry.clientName);
    setAmount(String(entry.amount));
    setNotes(entry.notes ?? "");
    setSupportingDocUrl(entry.supportingDocUrl ?? null);
  };

  const handleEditOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOrderId == null || !amount) return;
    updateOrderBook.mutate(
      {
        id: editingOrderId,
        data: {
          clientName,
          amount: Number(amount),
          notes,
          supportingDocUrl: supportingDocUrl ?? null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Order updated" });
          refresh();
          setEditingOrderId(null);
          resetForms();
        },
        onError: (err) =>
          toast({
            title: "Could not update",
            description: err instanceof Error ? err.message : "Try again",
            variant: "destructive",
          }),
      },
    );
  };

  const handleDeleteOrder = () => {
    if (deletingOrderId == null) return;
    const idToDelete = deletingOrderId;
    deleteOrderBook.mutate(
      { id: idToDelete },
      {
        onSuccess: () => {
          toast({ title: "Order deleted" });
          refresh();
          setDeletingOrderId(null);
        },
        onError: (err) =>
          toast({
            title: "Could not delete",
            description: err instanceof Error ? err.message : "Try again",
            variant: "destructive",
          }),
      },
    );
  };

  const handleAddRevenue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !paymentDate) return;
    if (!brdUrl) {
      toast({
        title: "BRD document required",
        description: "Please upload a BRD before saving this revenue entry.",
        variant: "destructive",
      });
      return;
    }
    createRevenue.mutate(
      {
        data: {
          projectId: id,
          clientName,
          amount: Number(amount),
          paymentDate,
          brdUrl,
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

  const openEditProject = () => {
    setEditTitle(project.title);
    setEditDescription(project.description);
    setIsEditProjectOpen(true);
  };

  const handleSaveProject = (e: React.FormEvent) => {
    e.preventDefault();
    const title = editTitle.trim();
    const description = editDescription.trim();
    if (title.length < 3 || description.length < 10) {
      toast({
        title: "Please fill in title and description",
        variant: "destructive",
      });
      return;
    }
    updateProject.mutate(
      { id, data: { title, description } },
      {
        onSuccess: () => {
          toast({ title: "Project updated" });
          refresh();
          queryClient.invalidateQueries({
            queryKey: getListProjectsQueryKey(),
          });
          setIsEditProjectOpen(false);
        },
        onError: (err: unknown) => {
          const e = err as { data?: { error?: string }; message?: string };
          toast({
            title: "Could not update project",
            description: e?.data?.error ?? e?.message ?? "Try again",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleDeleteProject = () => {
    deleteProject.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Project deleted" });
          queryClient.invalidateQueries({
            queryKey: getListProjectsQueryKey(),
          });
          setIsDeleteProjectOpen(false);
          setLocation("/projects");
        },
        onError: (err: unknown) => {
          const e = err as {
            status?: number;
            data?: { error?: string };
            message?: string;
          };
          const desc =
            e?.status === 409
              ? e?.data?.error ||
                "Project has submitted or verified entries — clear them first."
              : e?.data?.error || e?.message || "Try again.";
          toast({
            title: "Could not delete project",
            description: desc,
            variant: "destructive",
          });
        },
      },
    );
  };

  const resetForms = () => {
    setClientName("");
    setAmount("");
    setPaymentDate("");
    setNotes("");
    setSupportingDocUrl(null);
    setBrdUrl(null);
  };

  const docLink = (url: string | null | undefined, label: string) => {
    if (!url) return null;
    return <DocumentLinkButton url={url} label={label} variant="inline" />;
  };

  const FilePicker = ({
    field,
    currentUrl,
    label,
    accept = "application/pdf,image/*",
  }: {
    field: UploadField;
    currentUrl: string | null;
    label?: string;
    accept?: string;
  }) => (
    <div className="space-y-1">
      {label && <label className="text-sm font-medium">{label}</label>}
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
      <div className="flex items-start gap-4 mb-2">
        <Link href="/projects">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1
            className="text-3xl font-bold tracking-tight"
            data-testid="text-project-title"
          >
            {project.title}
          </h1>
          <p className="text-muted-foreground">{project.description}</p>
        </div>
        {isLeader && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={openEditProject}
              data-testid="button-edit-project"
            >
              <Pencil className="w-4 h-4 mr-2" /> Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setIsDeleteProjectOpen(true)}
              data-testid="button-delete-project"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
          </div>
        )}
      </div>

      {!isLeader && (
        <div
          className="rounded-md border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
          data-testid="banner-project-readonly"
        >
          Only the team leader can add or edit entries — ask your leader to
          update this page.
        </div>
      )}

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
                if (!isLeader) return;
                setIsRevenueOpen(open);
                if (!open) resetForms();
              }}
            >
              {isLeader && (
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-add-revenue">
                    <Plus className="w-4 h-4 mr-2" /> Add Revenue
                  </Button>
                </DialogTrigger>
              )}
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
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="0"
                        value={amount}
                        onChange={(e) =>
                          setAmount(sanitizeAmount(e.target.value))
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Payment Date
                      </label>
                      <Input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        max={new Date().toISOString().split("T")[0]}
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        Future dates are not allowed.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-sm font-medium">
                        BRD document (PDF){" "}
                        <span className="text-destructive">*</span>
                      </label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            What should the BRD include?
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-80">
                          <div className="space-y-2">
                            <div className="text-sm font-semibold">
                              What is a BRD (Business Requirement Document)?
                            </div>
                            <p className="text-xs text-muted-foreground">
                              A single consolidated document that captures
                              everything about this engagement. All of the
                              following are{" "}
                              <span className="font-medium text-foreground">
                                mandatory
                              </span>{" "}
                              and must be included:
                            </p>
                            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                              <li>Business Owner Details</li>
                              <li>Client WhatsApp Chats / Screenshots</li>
                              <li>Problem Identified</li>
                              <li>Solution Proposed</li>
                              <li>Phase-wise Plan</li>
                              <li>Prototype / Demo with Links</li>
                              <li>Proof of Outcome</li>
                              <li>Proof of Payment</li>
                            </ul>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <FilePicker field="brd" currentUrl={brdUrl} />
                    <p className="text-xs text-muted-foreground">
                      Your BRD is private and visible only to your team and the
                      coordinator/admin reviewing this entry.{" "}
                      <a
                        href="https://res.cloudinary.com/dja7l3iq8/raw/upload/v1779443781/brd-template_updated_ydc7lu.docx"
                        download="BRD-Template.docx"
                        className="font-medium text-primary hover:underline"
                      >
                        Download Template
                      </a>
                    </p>
                  </div>
                  <div className="flex justify-end pt-4">
                    <Button
                      type="submit"
                      disabled={
                        createRevenue.isPending ||
                        uploadingField !== null ||
                        !brdUrl
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
                project.revenueEntries.map((entry) => {
                  const isDraft = entry.status === "draft";
                  return (
                    <div
                      key={entry.id}
                      className={
                        isDraft
                          ? "p-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center transition-colors border-l-4 border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20"
                          : "p-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center hover:bg-muted/30 transition-colors"
                      }
                      data-testid={`revenue-entry-${entry.id}`}
                    >
                      <div className="space-y-1 w-full sm:w-auto">
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
                          {docLink(entry.brdUrl, "BRD")}
                          {docLink(entry.testimonialUrl, "Testimonial")}
                        </div>
                        {entry.adminNotes && entry.status === "rejected" && (
                          <div className="text-sm text-destructive mt-2 bg-destructive/10 p-2 rounded-md">
                            <strong>Admin note:</strong> {entry.adminNotes}
                          </div>
                        )}
                        {isDraft && (
                          <p
                            className="text-xs text-amber-700 dark:text-amber-300 pt-1 font-medium"
                            data-testid={`draft-hint-${entry.id}`}
                          >
                            Not submitted yet — admins can't review this until
                            you submit.
                          </p>
                        )}
                      </div>
                      <div
                        className={
                          isDraft
                            ? "flex flex-col items-stretch sm:items-end gap-2 w-full sm:w-auto"
                            : "flex flex-col items-end gap-2"
                        }
                      >
                        {!isDraft && getStatusBadge(entry.status)}
                        {isLeader && isDraft && (
                          <div className="relative w-full sm:w-auto">
                            <Button
                              size="default"
                              disabled={
                                submitRevenue.isPending || !entry.brdUrl
                              }
                              onClick={() => handleSubmitRevenue(entry.id)}
                              title={
                                !entry.brdUrl
                                  ? "Upload a BRD before submitting"
                                  : undefined
                              }
                              className="w-full sm:w-auto shadow-md shadow-primary/30 font-semibold"
                              data-testid={`button-submit-revenue-${entry.id}`}
                            >
                              <Send className="w-4 h-4 mr-2" /> Submit for
                              verification
                            </Button>
                            {entry.brdUrl && !submitRevenue.isPending && (
                              <span
                                aria-hidden
                                className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-primary/60 animate-pulse"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
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
                if (!isLeader) return;
                setIsOrderOpen(open);
                if (!open) resetForms();
              }}
            >
              {isLeader && (
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-add-order">
                    <Plus className="w-4 h-4 mr-2" /> Add Order
                  </Button>
                </DialogTrigger>
              )}
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
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="0"
                      value={amount}
                      onChange={(e) =>
                        setAmount(sanitizeAmount(e.target.value))
                      }
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
                      Add Order
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
                      {entry.notes && (
                        <div className="text-sm text-muted-foreground mt-1">
                          {entry.notes}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 pt-1">
                        {docLink(entry.supportingDocUrl, "Supporting document")}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge className="bg-green-500 hover:bg-green-600 border-none text-white">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Confirmed
                      </Badge>
                      {isLeader && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEditOrder(entry)}
                            data-testid={`button-edit-order-${entry.id}`}
                          >
                            <Pencil className="w-3 h-3 mr-1" /> Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeletingOrderId(entry.id)}
                            data-testid={`button-delete-order-${entry.id}`}
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={editingOrderId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingOrderId(null);
            resetForms();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Order Book Entry</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditOrder} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Client Name</label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
                data-testid="input-edit-order-client"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (₹)</label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
                required
                data-testid="input-edit-order-amount"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="input-edit-order-notes"
              />
            </div>
            <FilePicker
              field="supportingDoc"
              currentUrl={supportingDocUrl}
              label="Supporting document (PO, signed contract, etc.)"
            />
            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                disabled={updateOrderBook.isPending || uploadingField !== null}
                data-testid="button-save-edit-order"
              >
                {updateOrderBook.isPending && (
                  <Spinner className="w-4 h-4 mr-2" />
                )}{" "}
                Save Changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingOrderId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingOrderId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete order book entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the entry from your order book and update your
              team's totals. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-order">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteOrder();
              }}
              disabled={deleteOrderBook.isPending}
              data-testid="button-confirm-delete-order"
            >
              {deleteOrderBook.isPending && (
                <Spinner className="w-4 h-4 mr-2" />
              )}{" "}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isEditProjectOpen} onOpenChange={setIsEditProjectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveProject} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={80}
                required
                data-testid="input-edit-project-title"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                maxLength={500}
                rows={4}
                required
                data-testid="input-edit-project-description"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditProjectOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateProject.isPending}
                data-testid="button-save-project"
              >
                {updateProject.isPending && (
                  <Spinner className="w-4 h-4 mr-2" />
                )}{" "}
                Save changes
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isDeleteProjectOpen}
        onOpenChange={setIsDeleteProjectOpen}
      >
        <AlertDialogContent data-testid="dialog-confirm-delete-project">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {project.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the project and any draft revenue or
              order book entries. If the project has any submitted or verified
              entries, the request will be blocked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-project">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteProject();
              }}
              disabled={deleteProject.isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
              data-testid="button-confirm-delete-project"
            >
              {deleteProject.isPending && <Spinner className="w-4 h-4 mr-2" />}
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
