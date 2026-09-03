// Season 2 — Stage 3: define the project.
//
// Reachable only from a CONVERTED lead (Gate B). If the lead already has a
// project this screen forwards to the delivery screen instead of offering a
// second one — one project per lead is a server rule, and the UI should not
// let a student walk into it.
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useLocation } from "wouter";
import {
  ArrowLeft,
  Plus,
  Trash2,
  AlertTriangle,
  Upload,
  Link2,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { customFetch } from "@workspace/api-client-react";
import { FieldHelp, type FieldHelpId } from "@/components/field-help";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/format";
import { useSeason } from "@/lib/season-context";
import { usePipelineGatesEnforced } from "@/lib/pipeline-gates-api";
import {
  createPipelineProject,
  getLead,
  leadKeys,
  listPipelineProjects,
  apiErrorData,
  type PhaseInput,
} from "@/lib/leads-api";

function Select({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Field({
  label,
  required,
  hint,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  /** Shows a "what goes here" button on the right of the label row. */
  help?: FieldHelpId;
  children: React.ReactNode;
}) {
  // A div rather than a label: the help button is interactive, and a label
  // forwards clicks on its contents to the field it wraps.
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium">
          {label}
          {required ? <span className="ml-0.5 text-destructive">*</span> : null}
        </span>
        {help ? <FieldHelp id={help} /> : null}
      </div>
      {children}
      {hint ? (
        <span className="block text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

const emptyPhase = (): PhaseInput => ({
  name: "",
  amount: 0,
  revenueType: "one_time",
});

export default function LeadProject() {
  const params = useParams<{ id: string }>();
  const leadId = Number(params.id);
  const { viewingId: seasonId, canWrite } = useSeason();
  // Advisory (default) vs enforced pipeline gates — admin Config toggle.
  const gatesEnforced = usePipelineGatesEnforced();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const leadQ = useQuery({
    queryKey: leadKeys.detail(seasonId, leadId),
    queryFn: () => getLead(leadId),
    enabled: Number.isInteger(leadId) && leadId > 0,
  });
  const projectsQ = useQuery({
    queryKey: leadKeys.projects(seasonId),
    queryFn: () => listPipelineProjects(),
  });

  const existing = useMemo(
    () => projectsQ.data?.find((p) => p.leadId === leadId),
    [projectsQ.data, leadId],
  );

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
  const [revenueType, setRevenueType] = useState<"one_time" | "recurring">(
    "one_time",
  );
  const [recurringFrequency, setRecurringFrequency] = useState("");
  // The agreement can arrive two ways and both land in `agreementDoc`: a URL
  // the student pasted, or the object-storage path of a file they uploaded.
  const [agreementDoc, setAgreementDoc] = useState("");
  const [agreementMode, setAgreementMode] = useState<"link" | "upload">("link");
  const [agreementFileName, setAgreementFileName] = useState("");
  const [agreementUploading, setAgreementUploading] = useState(false);
  // Null until the student answers the sharing question. Only a LINK can be
  // unviewable, so an upload leaves this null.
  const [agreementAccessConfirmed, setAgreementAccessConfirmed] = useState<
    boolean | null
  >(null);
  const [askAgreementAccess, setAskAgreementAccess] = useState(false);
  // The link the question was last asked about, so re-blurring an unchanged
  // field does not re-ask.
  const [askedAbout, setAskedAbout] = useState("");
  const agreementFileRef = useRef<HTMLInputElement>(null);
  // Two phases minimum, so the form opens in the shape the server requires
  // rather than teaching the rule through a rejection.
  const [phases, setPhases] = useState<PhaseInput[]>([
    emptyPhase(),
    emptyPhase(),
  ]);
  const [linkErrors, setLinkErrors] = useState<Record<string, string>>({});

  const setPhase = (i: number, patch: Partial<PhaseInput>): void =>
    setPhases((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const total = phases.reduce((n, p) => n + (Number(p.amount) || 0), 0);

  const mutation = useMutation({
    mutationFn: () =>
      createPipelineProject({
        leadId,
        title: title.trim(),
        serviceCategory: serviceCategory.trim(),
        problemStatement: problemStatement.trim(),
        solutionDescription: solutionDescription.trim(),
        ...(techStack.trim()
          ? {
              techStack: techStack
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            }
          : {}),
        ...(liveProductUrl.trim() ? { liveProductUrl: liveProductUrl.trim() } : {}),
        ...(demoVideoUrl.trim() ? { demoVideoUrl: demoVideoUrl.trim() } : {}),
        ...(sourceCodeUrl.trim() ? { sourceCodeUrl: sourceCodeUrl.trim() } : {}),
        ...(prototypeUrl.trim() ? { prototypeUrl: prototypeUrl.trim() } : {}),
        ...(demoCredentials.trim()
          ? { demoCredentials: demoCredentials.trim() }
          : {}),
        revenueType,
        ...(revenueType === "recurring" && recurringFrequency
          ? {
              recurringFrequency: recurringFrequency as
                | "monthly"
                | "quarterly"
                | "annual",
            }
          : {}),
        ...(agreementDoc.trim() ? { agreementDoc: agreementDoc.trim() } : {}),
        // Only meaningful for a link, and only once the student has answered.
        ...(agreementMode === "link" && agreementAccessConfirmed !== null
          ? { agreementAccessConfirmed }
          : {}),
        phases: phases.map((p) => ({
          ...p,
          amount: Number(p.amount) || 0,
        })),
      }),
    onSuccess: (res) => {
      setLinkErrors({});
      void qc.invalidateQueries({ queryKey: leadKeys.projects(seasonId) });
      void qc.invalidateQueries({ queryKey: leadKeys.status(seasonId) });
      toast({ title: "Project created" });
      navigate(`/leads/${leadId}/delivery/${res.projectId}`);
    },
    onError: (err: Error) => {
      // A broken or restricted link comes back as a structured refusal on the
      // error body. Surface it against the field rather than as one opaque toast.
      const data = apiErrorData<{
        code?: string;
        links?: Record<string, { status: string; message?: string }>;
      }>(err);
      if (data?.code === "LINK_UNREACHABLE" && data.links) {
        const errs: Record<string, string> = {};
        for (const [k, v] of Object.entries(data.links)) {
          if (v.status === "broken" || v.status === "restricted") {
            errs[k] = v.message ?? "This link cannot be opened.";
          }
        }
        setLinkErrors(errs);
        toast({
          title: "Some links cannot be opened",
          description: "Fix the highlighted links and save again.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Could not create the project",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (leadQ.isLoading || projectsQ.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (leadQ.isError || !leadQ.data) {
    return (
      <div className="p-6">
        <Card className="p-6 text-sm">
          Could not load this lead.{" "}
          <Link href="/leads" className="underline">
            Back to leads
          </Link>
        </Card>
      </div>
    );
  }

  const { lead } = leadQ.data;

  // Already has a project — send them where the work actually is.
  if (existing) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Link href={`/leads/${leadId}`}>
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {lead.businessName}
          </Button>
        </Link>
        <Card className="p-6">
          <p className="font-semibold">{existing.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This lead already has a project. Contract value{" "}
            {formatINR(existing.totalContractValue ?? 0)}, received{" "}
            {formatINR(existing.received)}.
          </p>
          <Link href={`/leads/${leadId}/delivery/${existing.id}`}>
            <Button className="mt-4">Open delivery &amp; payments</Button>
          </Link>
        </Card>
      </div>
    );
  }

  // Gate B, stated plainly rather than as a disabled button with no reason.
  // Only while the gates are enforced: in advisory mode the form renders and
  // creating the project marks the lead Converted server-side.
  if (lead.stage !== "converted" && gatesEnforced) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Link href={`/leads/${leadId}`}>
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            {lead.businessName}
          </Button>
        </Link>
        <Card className="flex items-start gap-3 p-6">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
            aria-hidden="true"
          />
          <div>
            <p className="font-semibold">This lead is not converted yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              A project can only be created once the client has agreed. Keep
              working the lead, then convert it from the lead page.
            </p>
            <Link href={`/leads/${leadId}`}>
              <Button variant="outline" className="mt-4">
                Back to the lead
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  /**
   * Upload the agreement to object storage: ask the API for a signed URL, PUT
   * the file at it, then keep the returned object path. Same two-step flow the
   * rest of the app uses; the server enforces the type and size limits.
   */
  async function uploadAgreement(file: File): Promise<void> {
    setAgreementUploading(true);
    try {
      const { uploadURL, objectPath } = await customFetch<{
        uploadURL: string;
        objectPath: string;
      }>("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });
      const put = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status})`);
      setAgreementDoc(objectPath);
      setAgreementFileName(file.name);
      // An uploaded file has no sharing problem to confirm.
      setAgreementAccessConfirmed(null);
      setAskedAbout("");
      toast({ title: "Agreement uploaded", description: file.name });
    } catch (err) {
      const data = apiErrorData<{ error?: string }>(err as Error);
      toast({
        title: "Could not upload the agreement",
        description:
          data?.error ??
          (err instanceof Error ? err.message : "Please try again."),
        variant: "destructive",
      });
    } finally {
      setAgreementUploading(false);
      if (agreementFileRef.current) agreementFileRef.current.value = "";
    }
  }

  const writable = canWrite("project");
  const canSubmit =
    !!title.trim() &&
    !!serviceCategory.trim() &&
    !!problemStatement.trim() &&
    !!solutionDescription.trim() &&
    (revenueType !== "recurring" || !!recurringFrequency) &&
    phases.length >= 2 &&
    phases.every((p) => p.name.trim() && Number(p.amount) > 0);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Link href={`/leads/${leadId}`}>
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {lead.businessName}
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Define the project</h1>
        <p className="text-sm text-muted-foreground">
          What you agreed to build for {lead.ownerName} at {lead.businessName}.
        </p>
      </div>

      <Card className="space-y-4 p-5">
        <h2 className="font-semibold">The work</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project title" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field
            label="What kind of work is it?"
            required
            hint="e.g. Website, Billing software, Social media"
          >
            <Input
              value={serviceCategory}
              onChange={(e) => setServiceCategory(e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="What problem are you solving?"
          required
          help="problem"
          hint="In the client's terms, not technical ones."
        >
          <Textarea
            rows={3}
            value={problemStatement}
            onChange={(e) => setProblemStatement(e.target.value)}
          />
        </Field>
        <Field label="What are you building?" required help="solution">
          <Textarea
            rows={3}
            value={solutionDescription}
            onChange={(e) => setSolutionDescription(e.target.value)}
          />
        </Field>
        <Field label="Tech stack" hint="Comma separated.">
          <Input
            value={techStack}
            onChange={(e) => setTechStack(e.target.value)}
          />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Proof it exists</h2>
          <p className="text-xs text-muted-foreground">
            Every link is opened when you save. Make sure a stranger can view
            them — a Drive file left on &ldquo;Restricted&rdquo; is the commonest
            reason a good project loses marks.
          </p>
        </div>
        {(
          [
            [
              "liveProductUrl",
              "Live product URL",
              liveProductUrl,
              setLiveProductUrl,
              "liveProductUrl",
            ],
            ["demoVideoUrl", "Demo video", demoVideoUrl, setDemoVideoUrl, "demoVideo"],
            ["sourceCodeUrl", "Source code", sourceCodeUrl, setSourceCodeUrl, "sourceCode"],
            [
              "prototypeUrl",
              "Prototype / design",
              prototypeUrl,
              setPrototypeUrl,
              "prototype",
            ],
          ] as const
        ).map(([key, label, value, setter, helpId]) => (
          <Field key={key} label={label} help={helpId}>
            <Input
              value={value}
              onChange={(e) => setter(e.target.value)}
              placeholder="https://"
              className={linkErrors[key] ? "border-destructive" : undefined}
            />
            {linkErrors[key] ? (
              <span className="block text-xs text-destructive">
                {linkErrors[key]}
              </span>
            ) : null}
          </Field>
        ))}
        <Field
          label="Demo login details"
          help="demoCredentials"
          hint="Only if a reviewer needs to sign in to see it."
        >
          <Input
            value={demoCredentials}
            onChange={(e) => setDemoCredentials(e.target.value)}
          />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Phases and payments</h2>
            <p className="text-xs text-muted-foreground">
              At least two phases, each with the amount due for it. A phase with
              no money and money with no phase were the two commonest gaps last
              season.
            </p>
          </div>
          <p className="shrink-0 text-right text-sm">
            <span className="block text-xs text-muted-foreground">Total</span>
            <span className="font-semibold">{formatINR(total)}</span>
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Is this one-off or recurring?" required>
            <Select
              value={revenueType}
              onChange={(v) => setRevenueType(v as "one_time" | "recurring")}
              options={[
                { value: "one_time", label: "One-off" },
                { value: "recurring", label: "Recurring" },
              ]}
            />
          </Field>
          {revenueType === "recurring" ? (
            <Field label="How often?" required>
              <Select
                value={recurringFrequency}
                onChange={setRecurringFrequency}
                options={[
                  { value: "monthly", label: "Monthly" },
                  { value: "quarterly", label: "Quarterly" },
                  { value: "annual", label: "Annually" },
                ]}
                placeholder="Choose one"
              />
            </Field>
          ) : null}
        </div>

        <div className="space-y-4">
          {phases.map((p, i) => (
            <div key={i} className="rounded-md border p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium">Phase {i + 1}</p>
                  {/* Only on the first, so the guidance is offered once rather
                      than repeated down a list of identical blocks. */}
                  {i === 0 ? <FieldHelp id="phase" /> : null}
                </div>
                {phases.length > 2 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPhases((ps) => ps.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="sr-only">Remove phase {i + 1}</span>
                  </Button>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="What happens in this phase?" required>
                  <Input
                    value={p.name}
                    onChange={(e) => setPhase(i, { name: e.target.value })}
                  />
                </Field>
                <Field label="Amount for this phase (₹)" required>
                  <Input
                    inputMode="numeric"
                    value={p.amount || ""}
                    onChange={(e) =>
                      setPhase(i, { amount: Number(e.target.value) || 0 })
                    }
                  />
                </Field>
                <Field label="Starts">
                  <Input
                    type="date"
                    value={p.startDate ?? ""}
                    onChange={(e) => setPhase(i, { startDate: e.target.value })}
                  />
                </Field>
                <Field label="Ends">
                  <Input
                    type="date"
                    value={p.endDate ?? ""}
                    onChange={(e) => setPhase(i, { endDate: e.target.value })}
                  />
                </Field>
                <Field label="Payment due by">
                  <Input
                    type="date"
                    value={p.dueDate ?? ""}
                    onChange={(e) => setPhase(i, { dueDate: e.target.value })}
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Deliverables">
                  <Textarea
                    rows={2}
                    value={p.deliverables ?? ""}
                    onChange={(e) =>
                      setPhase(i, { deliverables: e.target.value })
                    }
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setPhases((ps) => [...ps, emptyPhase()])}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add a phase
        </Button>

        {/* Agreement: a link OR an uploaded file. Rendered by hand rather
            than through <Field> because that wraps its children in a <label>,
            and a label would forward clicks on these buttons to the input. */}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-3 text-sm font-medium">
              Agreement or work order
              <FieldHelp id="agreement" />
            </span>
            {/* The confirmation, on the right of the label row. */}
            {agreementMode === "link" && agreementDoc.trim() ? (
              agreementAccessConfirmed === true ? (
                <span
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"
                  data-testid="agreement-access-confirmed"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Anyone with the link can view
                </span>
              ) : agreementAccessConfirmed === false ? (
                <button
                  type="button"
                  onClick={() => setAskAgreementAccess(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline"
                  data-testid="agreement-access-unconfirmed"
                >
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  Access not confirmed — fix and re-check
                </button>
              ) : null
            ) : agreementMode === "upload" && agreementDoc ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                File uploaded
              </span>
            ) : null}
          </div>

          {/* Link / Upload switch */}
          <div className="flex w-fit items-center rounded-lg border bg-muted/40 p-0.5">
            {(
              [
                ["link", "Paste a link", Link2],
                ["upload", "Upload a file", Upload],
              ] as const
            ).map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  if (agreementMode === mode) return;
                  setAgreementMode(mode);
                  // The two sources are mutually exclusive — switching clears
                  // the other one rather than leaving a stale value to submit.
                  setAgreementDoc("");
                  setAgreementFileName("");
                  setAgreementAccessConfirmed(null);
                  setAskedAbout("");
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  agreementMode === mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                data-testid={`agreement-mode-${mode}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          {agreementMode === "link" ? (
            <Input
              value={agreementDoc}
              onChange={(e) => {
                setAgreementDoc(e.target.value);
                // Editing invalidates a previous answer.
                if (e.target.value.trim() !== askedAbout) {
                  setAgreementAccessConfirmed(null);
                }
              }}
              onBlur={(e) => {
                // Read the input, not state: if the paste and the blur land in
                // the same tick this closure would still hold the old value.
                const v = e.target.value.trim();
                if (v && v !== askedAbout) setAskAgreementAccess(true);
              }}
              placeholder="Link to the document"
              data-testid="input-agreement-link"
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={agreementFileRef}
                type="file"
                accept=".pdf,.doc,.docx,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAgreement(f);
                }}
                data-testid="input-agreement-file"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={agreementUploading}
                onClick={() => agreementFileRef.current?.click()}
                data-testid="button-agreement-upload"
              >
                {agreementUploading ? (
                  <>
                    <Spinner className="mr-1.5 h-4 w-4" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {agreementDoc ? "Replace file" : "Choose a file"}
                  </>
                )}
              </Button>
              {agreementFileName ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  {agreementFileName}
                </span>
              ) : null}
            </div>
          )}

          <span className="block text-xs text-muted-foreground">
            {agreementMode === "link"
              ? "A photo of a signed sheet is fine. Paste a link anyone can open."
              : "PDF, Word or an image of the signed sheet. Up to 25 MB."}
          </span>
        </div>
      </Card>

      {/* Asked the moment a link is pasted, because a Drive file left on
          "Restricted" is the commonest reason a good project loses marks. */}
      <Dialog open={askAgreementAccess} onOpenChange={setAskAgreementAccess}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Can anyone open this link?</DialogTitle>
            <DialogDescription>
              Reviewers open it from their own account. If it is a Drive file,
              set sharing to “Anyone with the link — Viewer”.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAgreementAccessConfirmed(false);
                setAskedAbout(agreementDoc.trim());
                setAskAgreementAccess(false);
              }}
              data-testid="button-agreement-access-no"
            >
              Not yet
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setAgreementAccessConfirmed(true);
                setAskedAbout(agreementDoc.trim());
                setAskAgreementAccess(false);
              }}
              data-testid="button-agreement-access-yes"
            >
              Yes, it is viewable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center justify-end gap-3">
        <Link href={`/leads/${leadId}`}>
          <Button variant="ghost">Cancel</Button>
        </Link>
        <Button
          disabled={!canSubmit || !writable || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Create the project"}
        </Button>
      </div>
    </div>
  );
}
