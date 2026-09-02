// Season 2 — Stages 4 and 5: deliver, log payments, submit.
//
// The BRD is not written here. It is composed by the server from the lead
// trail, the project and the payments, so this screen shows the student the
// same document a reviewer will read, plus the Gate C checklist that is
// literally the check the submit button runs.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import {
  ArrowLeft,
  Plus,
  CheckCircle2,
  XCircle,
  Send,
  FileText,
  ShieldAlert,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatDate, formatINR } from "@/lib/format";
import { useSeason } from "@/lib/season-context";
import { usePipelineGatesEnforced } from "@/lib/pipeline-gates-api";
import {
  apiErrorData,
  getBrd,
  getPipelineProject,
  leadKeys,
  recordPayment,
  submitProject,
  type ChecklistItem,
  type ProjectPhase,
  type RecordPaymentBody,
} from "@/lib/leads-api";

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
  open,
  onOpenChange,
}: {
  projectId: number;
  leadId: number;
  phases: ProjectPhase[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
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
  const [invoiceDoc, setInvoiceDoc] = useState("");

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
        invoiceDoc: invoiceDoc.trim(),
        ...(transactionRef.trim()
          ? { transactionRef: transactionRef.trim() }
          : {}),
      };
      return recordPayment(projectId, body);
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
      setInvoiceDoc("");
      toast({ title: "Payment recorded" });
    },
    onError: (err: Error) => {
      const data = apiErrorData<{ code?: string; error?: string }>(err);
      toast({
        title:
          data?.code === "DUPLICATE_TRANSACTION_REF"
            ? "That reference number is already recorded"
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
    !!invoiceDoc.trim() &&
    (!refRequired || !!transactionRef.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Which phase is this for?" required>
            <select
              value={phaseId}
              onChange={(e) => setPhaseId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Choose a phase</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
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

          <Field
            label="Payment proof"
            required
            hint="Screenshot of the transfer, or a photo of the receipt."
          >
            <Input
              value={paymentProof}
              onChange={(e) => setPaymentProof(e.target.value)}
              placeholder="Link to the file"
            />
          </Field>
          <Field label="Invoice you gave the client" required>
            <Input
              value={invoiceDoc}
              onChange={(e) => setInvoiceDoc(e.target.value)}
              placeholder="Link to the file"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Checklist({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.key} className="flex items-start gap-2 text-sm">
          {i.passed ? (
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
              aria-hidden="true"
            />
          ) : (
            <XCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <div>
            <p className={i.passed ? "" : "font-medium"}>{i.label}</p>
            {i.detail && !i.passed ? (
              <p className="text-xs text-muted-foreground">{i.detail}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function LeadDelivery() {
  const params = useParams<{ id: string; projectId: string }>();
  const leadId = Number(params.id);
  const projectId = Number(params.projectId);
  const { viewingId: seasonId, canWrite } = useSeason();
  // Advisory (default) vs enforced pipeline gates — admin Config toggle.
  const gatesEnforced = usePipelineGatesEnforced();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [paying, setPaying] = useState(false);

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
          data?.code === "GATE_C_NOT_MET"
            ? `${data.remaining} thing${data.remaining === 1 ? "" : "s"} still missing`
            : "Could not submit",
        description: data?.error ?? err.message,
        variant: "destructive",
      });
    },
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

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Link href={`/leads/${leadId}`}>
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to the lead
        </Button>
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{project.title}</h1>
          <p className="text-sm text-muted-foreground">
            {formatINR(totalReceived)} received of{" "}
            {formatINR(project.totalContractValue ?? 0)} agreed
          </p>
        </div>
        {writable ? (
          <Button onClick={() => setPaying(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Record a payment
          </Button>
        ) : null}
      </div>

      {/* ── Phases ─────────────────────────────────────────────────────── */}
      <Card className="p-5">
        <h2 className="font-semibold">Phases</h2>
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
                <div className="flex items-center gap-3 text-sm">
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
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Gate C + the composed BRD ──────────────────────────────────── */}
      {brd ? (
        <>
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">
                  {brd.gateC.passed
                    ? "Ready to submit"
                    : `${brd.gateC.remaining} thing${
                        brd.gateC.remaining === 1 ? "" : "s"
                      } ${gatesEnforced ? "still missing" : "recommended"}`}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {gatesEnforced
                    ? "This list is exactly what the submit button checks."
                    : "You can submit now. Reviewers see which of these were met."}
                </p>
              </div>
              <Button
                disabled={
                  (gatesEnforced && !brd.gateC.passed) ||
                  !writable ||
                  submit.isPending
                }
                onClick={() => submit.mutate()}
              >
                <Send className="mr-1.5 h-4 w-4" />
                {submit.isPending ? "Submitting…" : "Submit for review"}
              </Button>
            </div>
            <div className="mt-4">
              <Checklist items={brd.gateC.items} />
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" aria-hidden="true" />
              <h2 className="font-semibold">Your BRD</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Built from what you logged. There is nothing to write — if
              something reads thin here, go and strengthen the trail.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Trail strength</p>
                <p className="font-semibold capitalize">
                  {brd.systemAssessment.trailBand} ·{" "}
                  {brd.systemAssessment.trailStrength}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Claimed</p>
                <p className="font-semibold">
                  {formatINR(brd.systemAssessment.receivedAmount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Interactions</p>
                <p className="font-semibold">{brd.interactionTrail.length}</p>
              </div>
            </div>

            {brd.relationship.isRelatedParty ? (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <ShieldAlert
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <p>
                  This client is a known contact, so a reviewer will look at the
                  evidence more closely. That is expected, not a problem.
                </p>
              </div>
            ) : null}

            <div className="mt-5 space-y-4 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Client
                </p>
                <p>
                  {brd.client.businessName} — {brd.client.ownerName},{" "}
                  {brd.client.city}
                </p>
              </div>
              {brd.problemStatement ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Problem
                  </p>
                  <p className="whitespace-pre-wrap">{brd.problemStatement}</p>
                </div>
              ) : null}
              {brd.solutionDescription ? (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Solution
                  </p>
                  <p className="whitespace-pre-wrap">
                    {brd.solutionDescription}
                  </p>
                </div>
              ) : null}
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Interaction trail
                </p>
                <ol className="mt-1 space-y-1">
                  {brd.interactionTrail.map((i, n) => (
                    <li key={n} className="text-muted-foreground">
                      <span className="text-foreground">
                        {formatDate(i.date)}
                      </span>{" "}
                      — {i.summary}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </Card>
        </>
      ) : null}

      <PaymentDialog
        projectId={projectId}
        leadId={leadId}
        phases={phases}
        open={paying}
        onOpenChange={setPaying}
      />
    </div>
  );
}
