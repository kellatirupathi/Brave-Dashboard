// Season 2 — Stages 4 and 5: deliver, log payments, submit.
//
// The BRD is not written here. It is composed by the server from the lead
// trail, the project and the payments, so this screen shows the student the
// same document a reviewer will read, plus the five progress items that the
// submit button checks.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  Plus,
  CheckCircle2,
  XCircle,
  Send,
  FileText,
  ShieldAlert,
  Pencil,
  Trash2,
  Link2,
  Upload,
} from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";
import { FieldHelp } from "@/components/field-help";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDate, formatINR } from "@/lib/format";
import { resolveStoredObjectUrl } from "@/lib/storage-url";
import { useSeason } from "@/lib/season-context";
import { LeadsLockBanner } from "@/components/leads-lock-banner";
import { useLeadsControl } from "@/lib/leads-control-api";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import {
  addProjectPhase,
  apiErrorData,
  deletePayment,
  deletePipelineProject,
  deleteProjectPhase,
  getBrd,
  getPipelineProject,
  leadRef,
  leadKeys,
  recordPayment,
  submitProject,
  updatePayment,
  updatePipelineProject,
  updateProjectPhase,
  type ComposedBrd,
  type LeadRef,
  type PaymentRow,
  type PhaseInput,
  type PipelineProjectRow,
  type ProjectPhase,
  type RecordPaymentBody,
  type ScheduleRow,
} from "@/lib/leads-api";

/** A payment proof is a receipt screenshot; 5 MB is generous for that. */
const PROOF_MAX_BYTES = 5 * 1024 * 1024;

const MODES = [
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
] as const;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="block text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

function PaymentDialog({
  projectId,
  leadId,
  phases,
  payments,
  open,
  onOpenChange,
  payment,
}: {
  projectId: number;
  leadId: LeadRef;
  phases: ProjectPhase[];
  /** Every payment on this project, so a phase is offered only once. */
  payments: PaymentRow[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payment?: PaymentRow | null;
}) {
  const { viewingId: seasonId } = useSeason();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [phaseId, setPhaseId] = useState("");
  const [amountReceived, setAmountReceived] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentMode, setPaymentMode] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [paymentProof, setPaymentProof] = useState("");
  const [proofMode, setProofMode] = useState<"link" | "upload">("link");
  const [proofFileName, setProofFileName] = useState("");
  const proofFileRef = useRef<HTMLInputElement>(null);
  const uploader = useUpload({
    maxBytes: PROOF_MAX_BYTES,
    onError: (error) =>
      toast({
        title: "Could not upload payment proof",
        description: error.message,
        variant: "destructive",
      }),
  });

  useEffect(() => {
    if (!open) return;
    setPhaseId(payment ? String(payment.phaseId) : "");
    setAmountReceived(payment ? String(payment.amountReceived) : "");
    setPaymentDate(payment?.paymentDate ?? todayIso());
    setPaymentMode(payment?.paymentMode ?? "");
    setTransactionRef(payment?.transactionRef ?? "");
    setPaymentProof(payment?.paymentProof ?? "");
    setProofMode(payment?.paymentProof?.startsWith("/objects/") ? "upload" : "link");
    // An existing payment only stores the path, so name it from that.
    setProofFileName(
      payment?.paymentProof?.startsWith("/objects/") ? "Uploaded file" : "",
    );
  }, [open, payment]);

  // A phase that already has a payment is not offered again — recording a
  // second one against it is how the same money gets counted twice. The phase
  // being edited stays in the list, or the select would have nothing to show.
  const takenPhaseIds = new Set(
    payments
      .filter((p) => p.id !== payment?.id)
      .map((p) => p.phaseId),
  );
  const selectablePhases = phases.filter((p) => !takenPhaseIds.has(p.id));

  // Cash is the only mode exempt from a reference number — that exemption is
  // what makes the duplicate-UTR check meaningful for everything else.
  const refRequired = !!paymentMode && paymentMode !== "cash";

  const mutation = useMutation({
    mutationFn: () => {
      const body: RecordPaymentBody = {
        phaseId: Number(phaseId),
        amountReceived: Number(amountReceived),
        paymentDate,
        paymentMode: paymentMode as RecordPaymentBody["paymentMode"],
        paymentProof: paymentProof.trim(),
        ...(transactionRef.trim()
          ? { transactionRef: transactionRef.trim() }
          : {}),
      };
      return payment
        ? updatePayment(projectId, payment.id, body)
        : recordPayment(projectId, body);
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: leadKeys.project(seasonId, projectId),
      });
      void qc.invalidateQueries({ queryKey: leadKeys.brd(seasonId, projectId) });
      void qc.invalidateQueries({ queryKey: leadKeys.status(seasonId) });
      onOpenChange(false);
      setAmountReceived("");
      setTransactionRef("");
      setPaymentProof("");
      toast({ title: payment ? "Payment updated" : "Payment recorded" });
    },
    onError: (err: Error) => {
      const data = apiErrorData<{ code?: string; error?: string }>(err);
      toast({
        title:
          data?.code === "DUPLICATE_TRANSACTION_REF"
            ? "That reference number is already recorded"
            : payment
              ? "Could not update the payment"
              : "Could not record the payment",
        description: data?.error ?? err.message,
        variant: "destructive",
      });
    },
  });

  const canSubmit =
    !!phaseId &&
    Number(amountReceived) > 0 &&
    !!paymentDate &&
    !!paymentMode &&
    !!paymentProof.trim() &&
    !uploader.isUploading &&
    (!refRequired || !!transactionRef.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{payment ? "Edit payment" : "Record a payment"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Which phase is this for?" required>
            <select
              value={phaseId}
              onChange={(e) => setPhaseId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Choose a phase</option>
              {selectablePhases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {selectablePhases.length === 0 ? (
              <span className="block text-xs text-amber-700">
                Every phase already has a payment. Edit the existing one, or add
                a phase for the next instalment.
              </span>
            ) : null}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount received (₹)" required>
              <Input
                inputMode="numeric"
                value={amountReceived}
                onChange={(e) => setAmountReceived(e.target.value)}
              />
            </Field>
            <Field label="Date received" required>
              <Input
                type="date"
                max={todayIso()}
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </Field>
            <Field label="How did they pay?" required>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Choose one</option>
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="UTR / reference number"
              required={refRequired}
              hint={
                paymentMode === "cash"
                  ? "Not needed for cash."
                  : "From the bank or UPI receipt."
              }
            >
              <Input
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                disabled={paymentMode === "cash"}
              />
            </Field>
          </div>

          {/* Payment proof. Rendered by hand rather than through <Field>,
              which wraps its children in a <label> — a label would forward
              clicks on the help and mode buttons to the input. */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <span className="flex items-center gap-3 text-sm font-medium">
                <span>
                  Payment proof
                  <span className="ml-0.5 text-destructive">*</span>
                </span>
                <FieldHelp id="paymentProof" />
              </span>
              {/* Source switch, on the label row rather than below it. */}
              <div className="flex shrink-0 items-center rounded-lg border bg-muted/40 p-0.5">
                {(
                  [
                    ["link", "Paste link", Link2],
                    ["upload", "Upload file", Upload],
                  ] as const
                ).map(([mode, label, Icon]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      if (proofMode === mode) return;
                      setProofMode(mode);
                      // The two sources are exclusive: switching clears the
                      // other one so a stale value is never saved.
                      setPaymentProof("");
                      setProofFileName("");
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                      proofMode === mode
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    data-testid={`proof-mode-${mode}`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {proofMode === "link" ? (
              <Input
                value={paymentProof}
                onChange={(e) => setPaymentProof(e.target.value)}
                placeholder="https://"
                data-testid="input-proof-link"
              />
            ) : (
              <>
                <input
                  ref={proofFileRef}
                  type="file"
                  className="hidden"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setProofFileName(file.name);
                    const result = await uploader.uploadFile(file);
                    if (result) {
                      setPaymentProof(result.objectPath);
                      toast({ title: "Payment proof uploaded" });
                    } else {
                      setProofFileName("");
                    }
                    if (proofFileRef.current) proofFileRef.current.value = "";
                  }}
                  data-testid="input-proof-file"
                />
                {/* One tinted row. While uploading it becomes the progress
                    bar itself, so the box never changes height. */}
                <div
                  className={cn(
                    "relative min-h-[52px] overflow-hidden rounded-md border-2 border-dashed transition-colors",
                    paymentProof.startsWith("/objects/")
                      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30"
                      : "border-primary/30 bg-primary/5",
                  )}
                  data-testid="proof-upload-box"
                >
                  {uploader.isUploading ? (
                    <>
                      <div
                        className="absolute inset-y-0 left-0 bg-primary/25 transition-[width] duration-200 ease-out"
                        style={{ width: `${uploader.progress}%` }}
                        data-testid="proof-progress-fill"
                      />
                      <div className="relative flex min-h-[48px] items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <Spinner className="h-4 w-4 shrink-0" />
                          <span className="truncate font-medium">
                            Uploading {proofFileName}
                          </span>
                        </span>
                        <span
                          className="shrink-0 font-mono text-sm font-semibold tabular-nums"
                          data-testid="proof-progress-percent"
                        >
                          {uploader.progress}%
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex min-h-[48px] items-center justify-between gap-3 px-3 py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => proofFileRef.current?.click()}
                        data-testid="button-proof-choose"
                      >
                        <Upload className="mr-1.5 h-4 w-4" />
                        {paymentProof.startsWith("/objects/")
                          ? "Replace file"
                          : "Choose a file"}
                      </Button>
                      {/* The file name sits in the same row, on the right. */}
                      {paymentProof.startsWith("/objects/") ? (
                        <span
                          className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                          data-testid="proof-file-name"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">
                            {proofFileName || "Uploaded file"}
                          </span>
                        </span>
                      ) : (
                        <span className="truncate text-xs text-muted-foreground">
                          No file chosen
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            <span className="block text-xs text-muted-foreground">
              Paste a link or upload an image, PDF, or other file up to 5 MB.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? "Saving…"
              : payment
                ? "Update"
                : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const emptyPhase = (): PhaseInput => ({
  name: "",
  deliverables: "",
  startDate: "",
  endDate: "",
  amount: 0,
  dueDate: "",
  revenueType: "one_time",
});

function PhaseDialog({
  projectId,
  open,
  onOpenChange,
  phase,
  schedule,
}: {
  projectId: number;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  phase?: ProjectPhase | null;
  schedule?: ScheduleRow | null;
}) {
  const { viewingId: seasonId } = useSeason();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<PhaseInput>(emptyPhase);

  useEffect(() => {
    if (!open) return;
    setForm(
      phase
        ? {
            name: phase.name,
            deliverables: phase.deliverables ?? "",
            startDate: phase.startDate ?? "",
            endDate: phase.endDate ?? "",
            amount: schedule?.amount ?? 0,
            dueDate: schedule?.dueDate ?? "",
            revenueType:
              schedule?.revenueType === "recurring"
                ? "recurring"
                : "one_time",
          }
        : emptyPhase(),
    );
  }, [open, phase, schedule]);

  const set = <K extends keyof PhaseInput>(key: K, value: PhaseInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const mutation = useMutation({
    mutationFn: () =>
      phase
        ? updateProjectPhase(projectId, phase.id, form)
        : addProjectPhase(projectId, form),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: leadKeys.project(seasonId, projectId),
      });
      void qc.invalidateQueries({ queryKey: leadKeys.brd(seasonId, projectId) });
      void qc.invalidateQueries({ queryKey: leadKeys.projects(seasonId) });
      void qc.invalidateQueries({ queryKey: leadKeys.status(seasonId) });
      onOpenChange(false);
      toast({ title: phase ? "Phase updated" : "Phase added" });
    },
    onError: (err: Error) =>
      toast({
        title: phase ? "Could not update the phase" : "Could not add the phase",
        description: err.message,
        variant: "destructive",
      }),
  });

  const canSave = !!form.name.trim() && Number(form.amount) > 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{phase ? "Edit phase" : "Add phase"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Phase name" required>
            <Input
              value={form.name}
              onChange={(event) => set("name", event.target.value)}
            />
          </Field>
          <Field label="Deliverables">
            <Textarea
              rows={2}
              value={form.deliverables ?? ""}
              onChange={(event) => set("deliverables", event.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts">
              <Input
                type="date"
                value={form.startDate ?? ""}
                onChange={(event) => set("startDate", event.target.value)}
              />
            </Field>
            <Field label="Ends">
              <Input
                type="date"
                value={form.endDate ?? ""}
                onChange={(event) => set("endDate", event.target.value)}
              />
            </Field>
            <Field label="Amount (₹)" required>
              <Input
                inputMode="numeric"
                value={form.amount || ""}
                onChange={(event) =>
                  set("amount", Number(event.target.value) || 0)
                }
              />
            </Field>
            <Field label="Payment due by">
              <Input
                type="date"
                value={form.dueDate ?? ""}
                onChange={(event) => set("dueDate", event.target.value)}
              />
            </Field>
          </div>
          <Field label="Revenue type" required>
            <select
              value={form.revenueType}
              onChange={(event) =>
                set(
                  "revenueType",
                  event.target.value as PhaseInput["revenueType"],
                )
              }
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="one_time">One-off</option>
              <option value="recurring">Recurring</option>
            </select>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSave || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : phase ? "Update" : "Add phase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: PipelineProjectRow;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const { viewingId: seasonId } = useSeason();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [serviceCategory, setServiceCategory] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [solutionDescription, setSolutionDescription] = useState("");
  const [techStack, setTechStack] = useState("");
  const [liveProductUrl, setLiveProductUrl] = useState("");
  const [demoVideoUrl, setDemoVideoUrl] = useState("");
  const [sourceCodeUrl, setSourceCodeUrl] = useState("");
  const [prototypeUrl, setPrototypeUrl] = useState("");
  const [demoCredentials, setDemoCredentials] = useState("");
  const [agreementDoc, setAgreementDoc] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(project.title);
    setServiceCategory(project.serviceCategory ?? "");
    setProblemStatement(project.problemStatement ?? "");
    setSolutionDescription(project.solutionDescription ?? "");
    setTechStack(project.techStack?.join(", ") ?? "");
    setLiveProductUrl(project.liveProductUrl ?? "");
    setDemoVideoUrl(project.demoVideoUrl ?? "");
    setSourceCodeUrl(project.sourceCodeUrl ?? "");
    setPrototypeUrl(project.prototypeUrl ?? "");
    setDemoCredentials(project.demoCredentials ?? "");
    setAgreementDoc(project.agreementDoc ?? "");
  }, [open, project]);

  const mutation = useMutation({
    mutationFn: () =>
      updatePipelineProject(project.id, {
        title: title.trim(),
        serviceCategory: serviceCategory.trim(),
        problemStatement: problemStatement.trim(),
        solutionDescription: solutionDescription.trim(),
        techStack: techStack
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        liveProductUrl: liveProductUrl.trim() || undefined,
        demoVideoUrl: demoVideoUrl.trim() || undefined,
        sourceCodeUrl: sourceCodeUrl.trim() || undefined,
        prototypeUrl: prototypeUrl.trim() || undefined,
        demoCredentials: demoCredentials.trim() || undefined,
        agreementDoc: agreementDoc.trim() || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: leadKeys.project(seasonId, project.id),
      });
      void qc.invalidateQueries({ queryKey: leadKeys.brd(seasonId, project.id) });
      void qc.invalidateQueries({ queryKey: leadKeys.projects(seasonId) });
      onOpenChange(false);
      toast({ title: "Project updated" });
    },
    onError: (err: Error) =>
      toast({
        title: "Could not update the project",
        description: err.message,
        variant: "destructive",
      }),
  });

  const canSave =
    !!title.trim() &&
    !!serviceCategory.trim() &&
    !!problemStatement.trim() &&
    !!solutionDescription.trim();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project title" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Service category" required>
              <Input
                value={serviceCategory}
                onChange={(e) => setServiceCategory(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Problem statement" required>
            <Textarea
              rows={3}
              value={problemStatement}
              onChange={(e) => setProblemStatement(e.target.value)}
            />
          </Field>
          <Field label="Solution description" required>
            <Textarea
              rows={3}
              value={solutionDescription}
              onChange={(e) => setSolutionDescription(e.target.value)}
            />
          </Field>
          <Field label="Tech stack" hint="Comma separated">
            <Textarea
              rows={2}
              value={techStack}
              onChange={(e) => setTechStack(e.target.value)}
            />
          </Field>
          {[
            ["Live product URL", liveProductUrl, setLiveProductUrl],
            ["Demo video URL", demoVideoUrl, setDemoVideoUrl],
            ["Source code URL", sourceCodeUrl, setSourceCodeUrl],
            ["Prototype URL", prototypeUrl, setPrototypeUrl],
          ].map(([label, value, setter]) => (
            <Field key={label as string} label={label as string}>
              <Input
                value={value as string}
                onChange={(e) =>
                  (setter as React.Dispatch<React.SetStateAction<string>>)(
                    e.target.value,
                  )
                }
                placeholder="https://"
              />
            </Field>
          ))}
          <Field label="Demo login details">
            <Textarea
              rows={2}
              value={demoCredentials}
              onChange={(e) => setDemoCredentials(e.target.value)}
            />
          </Field>
          <Field label="Agreement or work order">
            <Input
              value={agreementDoc}
              onChange={(e) => setAgreementDoc(e.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSave || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/**
 * The composed BRD, exactly as a reviewer sees it, behind a dialog.
 *
 * This used to be a permanently-expanded card at the bottom of the delivery
 * page. It is reference material, not a task, so it now opens on demand from
 * the BRD review section and leaves the page itself about what is missing.
 */
function isImageAsset(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(url);
}

/** A section heading inside the printed document. */
function BrdHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-sm font-bold uppercase tracking-wide">{children}</h4>
  );
}

/** One `Label: value` line. Renders nothing when there is no value. */
function BrdRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <p>
      <strong>{label}:</strong> {value}
    </p>
  );
}

/**
 * Attached evidence. Images are shown, because a payment screenshot a reviewer
 * has to click away to see may as well not be attached; anything else (a PDF
 * invoice, say) becomes a link.
 */
function BrdAttachments({
  urls,
  labels,
}: {
  urls: string[];
  labels?: string[];
}) {
  if (urls.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-3">
      {urls.map((url, index) => {
        const href = resolveStoredObjectUrl(url);
        const label = labels?.[index] ?? `Attachment ${index + 1}`;
        return isImageAsset(url) ? (
          <a
            key={`${url}-${index}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="block"
            title={label}
          >
            <img
              src={href}
              alt={label}
              loading="lazy"
              className="h-28 w-28 border border-slate-300 object-cover"
            />
          </a>
        ) : (
          <a
            key={`${url}-${index}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 border border-slate-300 px-2 py-1 text-xs underline"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </a>
        );
      })}
    </div>
  );
}

function BrdPreviewDialog({
  brd,
  open,
  onOpenChange,
}: {
  brd: ComposedBrd;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const techStack = Array.isArray(brd.techStack)
    ? (brd.techStack as unknown[]).filter(
        (t): t is string => typeof t === "string" && t.trim() !== "",
      )
    : [];
  const proofLinks = Object.entries(brd.links).filter(
    ([key, value]) => key !== "demoCredentials" && !!value,
  ) as Array<[string, string]>;
  const scheduledTotal = brd.phases.reduce(
    (n, p) => n + (p.scheduledAmount ?? 0),
    0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[92vh] max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        {/* Sticky, so the title and the way out stay put however far down the
            document the reader has scrolled. */}
        <DialogHeader className="sticky top-0 z-10 shrink-0 space-y-0 border-b bg-background px-5 py-4 text-left">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">Your BRD</span>
              </DialogTitle>
              <DialogDescription className="truncate">
                Composed from your lead, project and payment records.
              </DialogDescription>
            </div>
            {/* DialogContent renders its own close button, absolutely
                positioned at the top right — inside this sticky header it
                lands exactly where it belongs, so no second one is added.
                The spacer reserves its width. */}
            <div className="h-8 w-8 shrink-0" aria-hidden="true" />
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-100 p-3 sm:p-6">
          <div className="space-y-5">
            {/* ── Page 1: who, what and the commercial terms ─────────────── */}
            <article className="w-full bg-white p-7 text-slate-900 shadow-sm sm:p-12">
              <div className="border-b-2 border-slate-900 pb-6">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                  Business Requirement Document
                </p>
                <h3 className="mt-4 text-3xl font-bold">{brd.project.title}</h3>
                <p className="mt-2 text-base text-slate-600">
                  Prepared by {brd.project.teamName}
                </p>
              </div>

              <div className="mt-10 grid gap-8 md:grid-cols-2">
                <section>
                  <BrdHeading>Client</BrdHeading>
                  <div className="mt-3 space-y-2 text-sm">
                    <BrdRow label="Business" value={brd.client.businessName} />
                    <BrdRow label="Contact" value={brd.client.ownerName} />
                    <BrdRow label="Phone" value={brd.client.phone} />
                    <BrdRow
                      label="Location"
                      value={
                        [brd.client.areaLocality, brd.client.city]
                          .filter(Boolean)
                          .join(", ") || null
                      }
                    />
                    <BrdRow label="Category" value={brd.client.category} />
                  </div>
                </section>
                <section>
                  <BrdHeading>Project summary</BrdHeading>
                  <div className="mt-3 space-y-2 text-sm">
                    <BrdRow
                      label="Service"
                      value={brd.project.serviceCategory}
                    />
                    <BrdRow
                      label="Revenue model"
                      value={
                        brd.project.revenueType === "recurring"
                          ? `Recurring${
                              brd.project.recurringFrequency
                                ? ` · ${brd.project.recurringFrequency}`
                                : ""
                            }`
                          : brd.project.revenueType === "one_time"
                            ? "One-off"
                            : brd.project.revenueType
                      }
                    />
                    <BrdRow
                      label="Contract value"
                      value={formatINR(brd.project.totalContractValue ?? 0)}
                    />
                    <BrdRow
                      label="Amount received"
                      value={formatINR(brd.systemAssessment.receivedAmount)}
                    />
                  </div>
                </section>
              </div>

              {/* How the relationship began. Kept on page 1 because a
                  related-party disclosure changes how everything after it
                  should be read. */}
              <section className="mt-10">
                <BrdHeading>How this client was found</BrdHeading>
                <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                  <BrdRow label="Source" value={brd.relationship.source} />
                  <BrdRow
                    label="First meeting"
                    value={formatDate(brd.relationship.firstMeetingDate)}
                  />
                  <BrdRow
                    label="Meeting mode"
                    value={brd.relationship.meetingMode}
                  />
                  <BrdRow
                    label="Location captured"
                    value={
                      brd.relationship.geoCaptured
                        ? "Yes — GPS recorded at the client's premises"
                        : "No"
                    }
                  />
                  <BrdRow
                    label="Referred by"
                    value={brd.relationship.referrerName}
                  />
                  <BrdRow
                    label="Relationship"
                    value={brd.relationship.relationshipNote}
                  />
                </div>
              </section>

              <section className="mt-10">
                <BrdHeading>Business problem</BrdHeading>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {brd.problemStatement || "Not recorded"}
                </p>
              </section>

              {brd.clientEvidence.length > 0 ? (
                <section className="mt-10">
                  <BrdHeading>Evidence from the first visit</BrdHeading>
                  <BrdAttachments urls={brd.clientEvidence} />
                </section>
              ) : null}

              {brd.relationship.isRelatedParty ? (
                <div className="mt-10 flex items-start gap-2 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    Relationship disclosed:{" "}
                    {brd.relationship.relationshipNote ||
                      brd.relationship.referrerName ||
                      "Known contact"}
                  </p>
                </div>
              ) : null}

              <p className="mt-10 pt-8 text-right text-xs text-slate-400">
                Page 1 of 3
              </p>
            </article>

            {/* ── Page 2: what was built, and the proof it exists ────────── */}
            <article className="w-full bg-white p-7 text-slate-900 shadow-sm sm:p-12">
              <h3 className="border-b pb-4 text-xl font-bold">
                Proposed solution and delivery plan
              </h3>

              <section className="mt-7">
                <BrdHeading>Solution</BrdHeading>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {brd.solutionDescription || "Not recorded"}
                </p>
              </section>

              {techStack.length > 0 ? (
                <section className="mt-8">
                  <BrdHeading>Tech stack</BrdHeading>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {techStack.map((tech) => (
                      <span
                        key={tech}
                        className="border border-slate-300 px-2 py-0.5 text-xs"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="mt-8">
                <BrdHeading>Proof it exists</BrdHeading>
                <div className="mt-3 space-y-2 text-sm">
                  {proofLinks.length === 0 ? (
                    <p className="text-slate-500">Not recorded</p>
                  ) : (
                    proofLinks.map(([key, value]) => (
                      <p key={key} className="break-all">
                        <strong>
                          {key
                            .replace(/Url$/, "")
                            .replace(/([A-Z])/g, " $1")
                            .replace(/^./, (c) => c.toUpperCase())}
                          :
                        </strong>{" "}
                        <a
                          href={value}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                        >
                          {value}
                        </a>
                      </p>
                    ))
                  )}
                  {brd.links["demoCredentials"] ? (
                    <p className="break-all">
                      <strong>Demo login:</strong>{" "}
                      {brd.links["demoCredentials"]}
                    </p>
                  ) : null}
                  {brd.agreementDoc ? (
                    <p className="break-all">
                      <strong>Agreement or work order:</strong>{" "}
                      <a
                        href={resolveStoredObjectUrl(brd.agreementDoc)}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        Open document
                      </a>
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="mt-8">
                <BrdHeading>Delivery phases</BrdHeading>
                {brd.phases.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    No phases recorded
                  </p>
                ) : (
                  <div className="mt-3 border">
                    {brd.phases.map((phase) => (
                      <div key={phase.id} className="border-b p-3 last:border-b-0">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{phase.name}</p>
                            {phase.startDate || phase.endDate ? (
                              <p className="text-xs text-slate-600">
                                {[
                                  phase.startDate
                                    ? formatDate(phase.startDate)
                                    : null,
                                  phase.endDate
                                    ? formatDate(phase.endDate)
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" – ")}
                              </p>
                            ) : null}
                          </div>
                          <div className="text-right text-sm">
                            <p className="font-semibold">
                              {formatINR(phase.receivedAmount)}
                              {phase.scheduledAmount != null
                                ? ` / ${formatINR(phase.scheduledAmount)}`
                                : ""}
                            </p>
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                              {phase.status === "received"
                                ? "Received"
                                : phase.status === "due"
                                  ? `Due${phase.dueDate ? ` ${formatDate(phase.dueDate)}` : ""}`
                                  : "Pending"}
                            </p>
                          </div>
                        </div>
                        {phase.deliverables ? (
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {phase.deliverables}
                          </p>
                        ) : null}
                      </div>
                    ))}
                    {scheduledTotal > 0 ? (
                      <div className="flex justify-between border-t-2 border-slate-900 p-3 text-sm font-semibold">
                        <span>Total scheduled</span>
                        <span>{formatINR(scheduledTotal)}</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </section>

              <p className="mt-10 pt-8 text-right text-xs text-slate-400">
                Page 2 of 3
              </p>
            </article>

            {/* ── Page 3: the evidence trail and the money ───────────────── */}
            <article className="w-full bg-white p-7 text-slate-900 shadow-sm sm:p-12">
              <h3 className="border-b pb-4 text-xl font-bold">
                Evidence and payments
              </h3>

              <section className="mt-7">
                <BrdHeading>Client interaction trail</BrdHeading>
                {brd.interactionTrail.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    No interactions recorded
                  </p>
                ) : (
                  <ol className="mt-3 space-y-4">
                    {brd.interactionTrail.map((interaction, index) => (
                      <li
                        key={`${interaction.date}-${index}`}
                        className="border-l-2 border-slate-300 pl-4 text-sm"
                      >
                        <p className="font-semibold">
                          {formatDate(interaction.date)} · {interaction.type} ·{" "}
                          {interaction.outcome}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap leading-6 text-slate-700">
                          {interaction.summary}
                        </p>
                        {interaction.objectionNote ? (
                          <p className="mt-1 text-slate-700">
                            <strong>Objection:</strong>{" "}
                            {interaction.objectionNote}
                          </p>
                        ) : null}
                        {interaction.loggedAfterHours != null &&
                        interaction.loggedAfterHours >= 48 ? (
                          <p className="mt-1 text-xs text-amber-700">
                            Logged{" "}
                            {Math.round(interaction.loggedAfterHours / 24)} days
                            after it happened
                          </p>
                        ) : null}
                        {interaction.attachments.length > 0 ? (
                          <BrdAttachments urls={interaction.attachments} />
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="mt-8">
                <BrdHeading>Payments received</BrdHeading>
                {brd.payments.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    No payments recorded
                  </p>
                ) : (
                  <div className="mt-3 border">
                    {brd.payments.map((payment, index) => (
                      <div
                        key={`${payment.date}-${index}`}
                        className="border-b p-3 text-sm last:border-b-0"
                      >
                        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                          <div>
                            <p className="font-semibold">{payment.phaseName}</p>
                            <p className="text-slate-600">
                              {formatDate(payment.date)} · {payment.mode}
                              {payment.transactionRef
                                ? ` · ${payment.transactionRef}`
                                : ""}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">
                              {formatINR(payment.amount)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {payment.clientConfirmed
                                ? "Confirmed by the client"
                                : payment.hasProof
                                  ? "Proof attached"
                                  : "No proof"}
                            </p>
                          </div>
                        </div>
                        {payment.paymentProof || payment.invoiceDoc ? (
                          <BrdAttachments
                            urls={[
                              payment.paymentProof,
                              payment.invoiceDoc,
                            ].filter((u): u is string => !!u)}
                            labels={["Payment proof", "Invoice"]}
                          />
                        ) : null}
                      </div>
                    ))}
                    <div className="flex justify-between border-t-2 border-slate-900 p-3 text-sm font-semibold">
                      <span>Total received</span>
                      <span>
                        {formatINR(brd.systemAssessment.receivedAmount)}
                      </span>
                    </div>
                  </div>
                )}
              </section>

              {/* Written by the system, never by the student. Set apart so a
                  reviewer can see at a glance what was asserted and what was
                  measured. */}
              <section className="mt-8 border border-slate-300 bg-slate-50 p-4">
                <BrdHeading>System assessment</BrdHeading>
                <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                  <BrdRow
                    label="Trail strength"
                    value={`${brd.systemAssessment.trailStrength}/100 · ${brd.systemAssessment.trailBand}`}
                  />
                  <BrdRow
                    label="Documentation check"
                    value={
                      brd.systemAssessment.gateA.passed
                        ? "Met"
                        : "Not met — advisory only"
                    }
                  />
                  <BrdRow
                    label="Amount claimed"
                    value={formatINR(brd.systemAssessment.claimedAmount)}
                  />
                  <BrdRow
                    label="Amount received"
                    value={formatINR(brd.systemAssessment.receivedAmount)}
                  />
                  <BrdRow
                    label="Related party"
                    value={brd.systemAssessment.isRelatedParty ? "Yes" : "No"}
                  />
                  <BrdRow
                    label="Composed"
                    value={formatDate(brd.systemAssessment.composedAt)}
                  />
                </div>
              </section>

              <p className="mt-10 pt-8 text-right text-xs text-slate-400">
                Page 3 of 3
              </p>
            </article>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function LeadDelivery() {
  const params = useParams<{ id: string; projectId: string }>();
  // Either the public UUID (what links now carry) or a legacy numeric id —
  // the API resolves both, so this is passed through untouched.
  const leadId = String(params.id ?? "");
  const projectId = Number(params.projectId);
  const { viewingId: seasonId, canWrite } = useSeason();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const controls = useLeadsControl();
  const [paying, setPaying] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PaymentRow | null>(null);
  const [phaseDialogOpen, setPhaseDialogOpen] = useState(false);
  const [editingPhase, setEditingPhase] = useState<ProjectPhase | null>(null);
  const [editingProject, setEditingProject] = useState(false);
  const [brdPreviewOpen, setBrdPreviewOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: "project"; id: number; name: string }
    | { type: "phase"; id: number; name: string }
    | { type: "payment"; id: number; name: string }
    | null
  >(null);

  const projectQ = useQuery({
    queryKey: leadKeys.project(seasonId, projectId),
    queryFn: () => getPipelineProject(projectId),
    enabled: Number.isInteger(projectId) && projectId > 0,
  });
  const brdQ = useQuery({
    queryKey: leadKeys.brd(seasonId, projectId),
    queryFn: () => getBrd(projectId),
    enabled: Number.isInteger(projectId) && projectId > 0,
  });
  const canonicalLeadId =
    projectQ.data?.project.leadPublicId ??
    (projectQ.data?.project.leadId != null
      ? leadRef({
          id: projectQ.data.project.leadId,
          publicId: projectQ.data.project.leadPublicId,
        })
      : leadId);

  useEffect(() => {
    if (canonicalLeadId && canonicalLeadId !== leadId) {
      navigate(`/leads/${canonicalLeadId}/delivery/${projectId}`, {
        replace: true,
      });
    }
  }, [canonicalLeadId, leadId, navigate, projectId]);

  const submit = useMutation({
    mutationFn: () => submitProject(projectId),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: leadKeys.brd(seasonId, projectId) });
      void qc.invalidateQueries({ queryKey: leadKeys.status(seasonId) });
      toast({
        title: "Submitted for review",
        description: `${formatINR(res.amount)} claimed. Your coordinator will verify it.`,
      });
    },
    onError: (err: Error) => {
      const data = apiErrorData<{
        code?: string;
        error?: string;
        remaining?: number;
      }>(err);
      toast({
        title:
          data?.code === "LEAD_PROGRESS_INCOMPLETE"
            ? `${data.remaining} thing${data.remaining === 1 ? "" : "s"} still missing`
            : "Could not submit",
        description: data?.error ?? err.message,
        variant: "destructive",
      });
    },
  });

  const deletePhaseMutation = useMutation({
    mutationFn: (phaseId: number) => deleteProjectPhase(projectId, phaseId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: leadKeys.project(seasonId, projectId),
      });
      void qc.invalidateQueries({ queryKey: leadKeys.brd(seasonId, projectId) });
      void qc.invalidateQueries({ queryKey: leadKeys.projects(seasonId) });
      toast({ title: "Phase deleted" });
      setDeleteTarget(null);
    },
    onError: (err: Error) =>
      toast({
        title: "Could not delete the phase",
        description: err.message,
        variant: "destructive",
      }),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (paymentId: number) => deletePayment(projectId, paymentId),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: leadKeys.project(seasonId, projectId),
      });
      void qc.invalidateQueries({ queryKey: leadKeys.brd(seasonId, projectId) });
      void qc.invalidateQueries({ queryKey: leadKeys.status(seasonId) });
      toast({ title: "Payment deleted" });
      setDeleteTarget(null);
    },
    onError: (err: Error) =>
      toast({
        title: "Could not delete the payment",
        description: err.message,
        variant: "destructive",
      }),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: () => deletePipelineProject(projectId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: leadKeys.projects(seasonId) });
      void qc.invalidateQueries({ queryKey: leadKeys.status(seasonId) });
      toast({ title: "Project deleted" });
      navigate(`/leads/${canonicalLeadId}`);
    },
    onError: (err: Error) =>
      toast({
        title: "Could not delete the project",
        description: err.message,
        variant: "destructive",
      }),
  });

  if (projectQ.isLoading || brdQ.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (projectQ.isError || !projectQ.data) {
    return (
      <div className="p-6">
        <Card className="p-6 text-sm">
          Could not load this project.{" "}
          <Link href="/leads" className="underline">
            Back to leads
          </Link>
        </Card>
      </div>
    );
  }

  const { project, phases, schedule, payments } = projectQ.data;
  const brd = brdQ.data;
  const scheduledByPhase = new Map(schedule.map((r) => [r.phaseId, r]));
  const receivedByPhase = new Map<number, number>();
  for (const p of payments) {
    receivedByPhase.set(
      p.phaseId,
      (receivedByPhase.get(p.phaseId) ?? 0) + p.amountReceived,
    );
  }
  const totalReceived = payments.reduce((n, p) => n + p.amountReceived, 0);
  const writable = canWrite("revenue");
  // Only the outstanding items are shown now — a passed item needs no words.
  const missingItems = brd?.gateC.items.filter((item) => !item.passed) ?? [];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Link href={`/leads/${canonicalLeadId}`}>
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to the lead
        </Button>
      </Link>

      <LeadsLockBanner />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{project.title}</h1>
          <p className="text-sm text-muted-foreground">
            {formatINR(totalReceived)} received of{" "}
            {formatINR(project.totalContractValue ?? 0)} agreed
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {writable && controls.can("projects", "edit") ? (
            <Button variant="outline" onClick={() => setEditingProject(true)}>
              <Pencil className="mr-1.5 h-4 w-4" />
              Edit project
            </Button>
          ) : null}
          {writable && controls.can("projects", "delete") ? (
            <Button
              variant="destructive"
              onClick={() =>
                setDeleteTarget({
                  type: "project",
                  id: projectId,
                  name: project.title,
                })
              }
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete project
            </Button>
          ) : null}
          {writable && controls.can("payments", "add") ? (
            <Button onClick={() => setPaying(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Record a payment
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── Phases ─────────────────────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Phases</h2>
          {writable && controls.can("phases", "add") ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingPhase(null);
                setPhaseDialogOpen(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add phase
            </Button>
          ) : null}
        </div>
        <div className="mt-4 space-y-3">
          {phases.map((ph) => {
            const due = scheduledByPhase.get(ph.id)?.amount ?? 0;
            const got = receivedByPhase.get(ph.id) ?? 0;
            const settled = due > 0 && got >= due;
            return (
              <div
                key={ph.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{ph.name}</p>
                  {ph.deliverables ? (
                    <p className="text-xs text-muted-foreground">
                      {ph.deliverables}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {formatINR(got)} / {formatINR(due)}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      settled
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : got > 0
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : undefined,
                    )}
                  >
                    {settled ? "Paid" : got > 0 ? "Part paid" : "Unpaid"}
                  </Badge>
                  {writable && controls.can("phases", "edit") ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingPhase(ph);
                        setPhaseDialogOpen(true);
                      }}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                  ) : null}
                  {writable && controls.can("phases", "delete") ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${ph.name}`}
                      onClick={() =>
                        setDeleteTarget({
                          type: "phase",
                          id: ph.id,
                          name: ph.name,
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Payments ───────────────────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="font-semibold">Payments ({payments.length})</h2>
        {payments.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nothing recorded yet. You can only submit once at least one payment
            has actually arrived.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {payments.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{formatINR(p.amountReceived)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(p.paymentDate)} ·{" "}
                    {MODES.find((m) => m.value === p.paymentMode)?.label ??
                      p.paymentMode}
                    {p.transactionRef ? ` · ${p.transactionRef}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                {p.clientConfirmed === true ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 text-emerald-800"
                  >
                    Client confirmed
                  </Badge>
                ) : p.clientConfirmed === false ? (
                  <Badge
                    variant="outline"
                    className="border-rose-200 bg-rose-50 text-rose-800"
                  >
                    Client disputed
                  </Badge>
                ) : (
                  <Badge variant="outline">Awaiting client call</Badge>
                )}
                  {writable &&
                  controls.can("payments", "edit") &&
                  !p.clientConfirmed ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingPayment(p)}
                    >
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                  ) : null}
                  {writable &&
                  controls.can("payments", "delete") &&
                  !p.clientConfirmed ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Delete payment"
                      onClick={() =>
                        setDeleteTarget({
                          type: "payment",
                          id: p.id,
                          name: `${formatINR(p.amountReceived)} payment`,
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── BRD review ─────────────────────────────────────────────────
          One section, not two. A student at this point needs exactly two
          things: what is still missing, and the way to act on it. The score
          and the progress bar were noise on top of the same five items, and
          the full BRD is reference material, so it moved behind a dialog. */}
      {brd ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" aria-hidden="true" />
                <h2 className="font-semibold">BRD Review Section</h2>
              </div>
              {missingItems.length === 0 ? (
                <div className="mt-3 flex items-start gap-2 text-sm">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                  <p>
                    Everything needed is recorded. Preview the BRD, then submit
                    it for review.
                  </p>
                </div>
              ) : (
                <>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add these before you can submit for review.
                  </p>
                  <ul className="mt-4 space-y-2">
                    {missingItems.map((item) => (
                      <li
                        key={item.key}
                        className="flex items-start gap-2 text-sm"
                      >
                        <XCircle
                          className="mt-0.5 h-4 w-4 shrink-0 text-rose-600"
                          aria-hidden="true"
                        />
                        <div>
                          <p className="font-medium">{item.label}</p>
                          {item.detail ? (
                            <p className="text-xs text-muted-foreground">
                              {item.detail}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setBrdPreviewOpen(true)}>
                <FileText className="mr-1.5 h-4 w-4" />
                BRD Preview
              </Button>
              <Button
                disabled={
                  !brd.gateC.passed ||
                  !writable ||
                  !controls.canSubmit ||
                  submit.isPending
                }
                onClick={() => submit.mutate()}
              >
                <Send className="mr-1.5 h-4 w-4" />
                {submit.isPending ? "Submitting…" : "Submit for Review"}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {brd ? (
        <BrdPreviewDialog
          brd={brd}
          open={brdPreviewOpen}
          onOpenChange={setBrdPreviewOpen}
        />
      ) : null}

      <PaymentDialog
        projectId={projectId}
        leadId={leadId}
        phases={phases}
        payments={payments}
        open={paying}
        onOpenChange={setPaying}
      />
      <PaymentDialog
        projectId={projectId}
        leadId={leadId}
        phases={phases}
        payments={payments}
        payment={editingPayment}
        open={editingPayment != null}
        onOpenChange={(open) => {
          if (!open) setEditingPayment(null);
        }}
      />
      <PhaseDialog
        projectId={projectId}
        phase={editingPhase}
        schedule={
          editingPhase
            ? (scheduledByPhase.get(editingPhase.id) ?? null)
            : null
        }
        open={phaseDialogOpen}
        onOpenChange={setPhaseDialogOpen}
      />
      <ProjectDialog
        project={project}
        open={editingProject}
        onOpenChange={setEditingProject}
      />
      <ConfirmDeleteDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={
          deleteTarget?.type === "project"
            ? `Delete project "${deleteTarget.name}"?`
            : deleteTarget?.type === "phase"
              ? `Delete phase "${deleteTarget.name}"?`
              : `Delete ${deleteTarget?.name ?? "payment"}?`
        }
        description={
          deleteTarget?.type === "project"
            ? "Projects with recorded payments or review submissions cannot be deleted."
            : deleteTarget?.type === "phase"
              ? "A phase with recorded payments cannot be deleted."
              : "This payment record will be permanently removed. Client-confirmed payments cannot be deleted."
        }
        pending={
          deleteProjectMutation.isPending ||
          deletePhaseMutation.isPending ||
          deletePaymentMutation.isPending
        }
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.type === "project") {
            deleteProjectMutation.mutate();
          } else if (deleteTarget.type === "phase") {
            deletePhaseMutation.mutate(deleteTarget.id);
          } else {
            deletePaymentMutation.mutate(deleteTarget.id);
          }
        }}
      />
    </div>
  );
}
