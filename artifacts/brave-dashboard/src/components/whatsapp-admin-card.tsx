// WhatsApp broadcasts — Config → WhatsApp (additive, isolated).
//
// Three tabs: Send, Templates, History. Super-admin only; the server enforces
// that independently, this component only hides what a non-super-admin cannot
// use anyway.
//
// THE DESIGN RULE THAT MATTERS HERE: nothing sends without an explicit confirm
// step that shows the resolved recipient count. WhatsApp has no unsend, so a
// mis-scoped filter is unrecoverable — the count is computed server-side by
// the same resolver the send uses, and the send refuses if it has changed.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle,
  Send,
  AlertTriangle,
  Plus,
  Trash2,
  CheckCircle2,
  Users,
  History,
  FlaskConical,
} from "lucide-react";
import { useListCampuses, useListUsers } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  apiErrorMessage,
  createTemplate,
  deleteTemplate,
  getMergeFields,
  getSendHistory,
  getTemplates,
  getWhatsAppStatus,
  previewAudience,
  renderPreview,
  sendBroadcast,
  sendTest,
  whatsappQueryKeys,
  type AudienceRole,
  type AudienceScope,
  type AudienceSelection,
  type AudiencePreview,
  type VariableBinding,
  type WhatsAppTemplate,
} from "@/lib/whatsapp-api";

type Tab = "send" | "templates" | "history";

const ROLE_LABEL: Record<AudienceRole, string> = {
  student: "Students",
  coordinator: "Coordinators",
  admin: "Admins",
};

/** Which scopes each role supports. Admins are not campus-scoped. */
const SCOPES_FOR: Record<AudienceRole, AudienceScope[]> = {
  student: ["all", "campus", "team", "specific"],
  coordinator: ["all", "campus", "specific"],
  admin: ["all", "specific"],
};

const SCOPE_LABEL: Record<AudienceScope, string> = {
  all: "Everyone",
  campus: "By campus",
  team: "By team",
  specific: "Specific people",
};

export function WhatsAppAdminCard({
  callerIsSuperAdmin,
}: {
  callerIsSuperAdmin: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("send");

  const { data: status } = useQuery({
    queryKey: whatsappQueryKeys.status,
    queryFn: getWhatsAppStatus,
    enabled: callerIsSuperAdmin,
  });
  const { data: templates } = useQuery({
    queryKey: whatsappQueryKeys.templates,
    queryFn: getTemplates,
    enabled: callerIsSuperAdmin,
  });

  if (!callerIsSuperAdmin) {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold">WhatsApp</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Only super admins can send WhatsApp messages.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <MessageCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold">WhatsApp</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Send an approved template to students, coordinators or admins.
              </p>
            </div>
          </div>
          {status && (
            <Badge variant={status.configured ? "default" : "destructive"}>
              {status.configured
                ? `Connected · ${status.senderNumber ?? "sender set"}`
                : "Not configured"}
            </Badge>
          )}
        </div>

        {status && !status.configured && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">
              WhatsApp is not connected.
            </p>
            <p className="text-muted-foreground mt-1">
              Set <code className="text-xs">KARIX_API_KEY</code> and{" "}
              <code className="text-xs">KARIX_SENDER_NUMBER</code> on the server,
              then reload. You can still register templates and preview
              audiences meanwhile.
            </p>
          </div>
        )}

        <div className="flex gap-1 mt-5 border-b">
          {(
            [
              ["send", "Send", Send],
              ["templates", "Templates", Plus],
              ["history", "History", History],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </Card>

      {tab === "send" && (
        <SendTab templates={templates ?? []} configured={!!status?.configured} />
      )}
      {tab === "templates" && (
        <TemplatesTab
          templates={templates ?? []}
          onChanged={() =>
            queryClient.invalidateQueries({
              queryKey: whatsappQueryKeys.templates,
            })
          }
        />
      )}
      {tab === "history" && <HistoryTab />}
    </div>
  );
}

// ── Send ────────────────────────────────────────────────────────────────────

function SendTab({
  templates,
  configured,
}: {
  templates: WhatsAppTemplate[];
  configured: boolean;
}) {
  const { toast } = useToast();
  const active = templates.filter((t) => t.isActive);

  const [templateId, setTemplateId] = useState<string>("");
  const [bindings, setBindings] = useState<VariableBinding[]>([]);
  const [role, setRole] = useState<AudienceRole>("student");
  const [scope, setScope] = useState<AudienceScope>("all");
  const [campusIds, setCampusIds] = useState<number[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [teamIdsRaw, setTeamIdsRaw] = useState("");
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [testPhone, setTestPhone] = useState("");

  const template = active.find((t) => t.templateId === templateId);

  // Offered merge fields depend on the role — a coordinator has no team, so
  // {{teamName}} must not be offerable for a coordinator broadcast.
  const { data: mergeFields } = useQuery({
    queryKey: whatsappQueryKeys.mergeFields(role),
    queryFn: () => getMergeFields(role),
  });

  const { data: campuses } = useListCampuses();
  // Scoped to the chosen role, so the "specific people" picker is not asking an
  // admin to scroll 7,500 students to find three. The generated hook requires a
  // queryKey alongside any query option, so rather than hand-maintaining one
  // just to add `enabled`, the request rides on the role changing — the picker
  // it feeds only renders under scope === "specific" anyway.
  const { data: usersResp } = useListUsers({ role, pageSize: 1000 });
  const users = usersResp?.items ?? [];

  const selection: AudienceSelection = useMemo(
    () => ({
      role,
      scope,
      ...(scope === "campus" ? { campusIds } : {}),
      ...(scope === "specific" ? { userIds } : {}),
      ...(scope === "team"
        ? {
            teamIds: teamIdsRaw
              .split(/[,\s]+/)
              .map((s) => Number(s.trim()))
              .filter((n) => Number.isInteger(n) && n > 0),
          }
        : {}),
    }),
    [role, scope, campusIds, userIds, teamIdsRaw],
  );

  // Any change to the audience invalidates a preview the admin already saw —
  // otherwise they could confirm a count that no longer describes the send.
  function resetPreview() {
    setPreview(null);
  }

  const previewMut = useMutation({
    mutationFn: () =>
      previewAudience(
        selection,
        bindings.slice(0, template?.variableCount ?? 0),
      ),
    onSuccess: setPreview,
    onError: (e) =>
      toast({
        title: "Could not preview",
        description: apiErrorMessage(e, "Check the audience selection."),
        variant: "destructive",
      }),
  });

  const sendMut = useMutation({
    mutationFn: (dryRun: boolean) =>
      sendBroadcast({
        templateId,
        bindings: bindings.slice(0, template?.variableCount ?? 0),
        audience: selection,
        confirmedCount: preview?.reachable ?? 0,
        dryRun,
      }),
    onSuccess: (r) => {
      setConfirmOpen(false);
      if (r.dryRun) {
        toast({
          title: "Dry run complete",
          description: `${r.wouldSend} would be messaged. Nothing was sent.`,
        });
        return;
      }
      toast({
        title: `Sent to ${r.sent ?? 0}`,
        description:
          (r.failed ?? 0) > 0
            ? `${r.failed} failed. ${r.errors?.[0] ?? ""}`
            : `${r.skipped} skipped for missing numbers.`,
        variant: (r.failed ?? 0) > 0 ? "destructive" : undefined,
      });
    },
    onError: (e) => {
      setConfirmOpen(false);
      toast({
        title: "Send failed",
        description: apiErrorMessage(e, "Nothing was sent."),
        variant: "destructive",
      });
    },
  });

  const testMut = useMutation({
    mutationFn: () =>
      sendTest({
        templateId,
        phone: testPhone,
        // A test has no recipient record to merge from, so merge fields fall
        // back to their example text — enough to prove the wiring works.
        parameters: bindings
          .slice(0, template?.variableCount ?? 0)
          .map((b) =>
            b.kind === "literal"
              ? b.value
              : (mergeFields?.find((f) => f.key === b.field)?.example ?? "-"),
          ),
      }),
    onSuccess: (r) =>
      toast({
        title: r.ok ? "Test sent" : "Test failed",
        description: r.ok ? `Check ${testPhone}.` : r.error,
        variant: r.ok ? undefined : "destructive",
      }),
    onError: (e) =>
      toast({
        title: "Test failed",
        description: apiErrorMessage(e, "Could not send the test."),
        variant: "destructive",
      }),
  });

  // Only LITERAL values need typing; merge fields resolve per recipient and
  // always produce something (each has a fallback), so they are never "missing".
  const missingParams =
    !!template &&
    Array.from({ length: template.variableCount }).some((_, i) => {
      const b = bindings[i];
      if (!b) return true;
      return b.kind === "literal" && !b.value.trim();
    });

  if (active.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          No templates registered yet. Add one in the Templates tab — it must
          already be approved in your Karix console.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-6 space-y-6">
        {/* 1 · Template */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold">1 · Choose a template</h4>
          <Select
            value={templateId}
            onValueChange={(v) => {
              setTemplateId(v);
              setBindings([]);
              resetPreview();
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select an approved template" />
            </SelectTrigger>
            <SelectContent>
              {active.map((t) => (
                <SelectItem key={t.id} value={t.templateId}>
                  {t.displayName} · {t.category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {template && template.variableCount > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Each variable is either the same for everyone, or filled in from
                each person&rsquo;s own record.
              </p>
              {Array.from({ length: template.variableCount }).map((_, i) => {
                const b = bindings[i] ?? { kind: "literal", value: "" };
                const setBinding = (next: VariableBinding) => {
                  const copy = [...bindings];
                  while (copy.length < template.variableCount) {
                    copy.push({ kind: "literal", value: "" });
                  }
                  copy[i] = next;
                  setBindings(copy);
                  resetPreview();
                };
                return (
                  <div
                    key={i}
                    className="rounded-md border p-3 grid gap-2 sm:grid-cols-[80px_170px_1fr] sm:items-center"
                  >
                    <code className="text-xs font-semibold">{`{{${i + 1}}}`}</code>
                    <Select
                      value={b.kind === "merge" ? b.field : "__literal"}
                      onValueChange={(v) =>
                        setBinding(
                          v === "__literal"
                            ? { kind: "literal", value: "" }
                            : { kind: "merge", field: v },
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__literal">
                          Same for everyone
                        </SelectItem>
                        {(mergeFields ?? []).map((f) => (
                          <SelectItem key={f.key} value={f.key}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {b.kind === "literal" ? (
                      <Input
                        value={b.value}
                        onChange={(e) =>
                          setBinding({ kind: "literal", value: e.target.value })
                        }
                        placeholder={
                          template.variableLabels?.[i] ||
                          `Text for {{${i + 1}}}`
                        }
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        e.g.{" "}
                        <span className="font-medium text-foreground">
                          {mergeFields?.find((f) => f.key === b.field)
                            ?.example ?? "—"}
                        </span>{" "}
                        · differs per recipient
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {template?.sampleBody && (
            <div className="rounded-md bg-muted/50 border p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
                Preview
              </p>
              <p className="text-sm whitespace-pre-wrap">
                {renderPreview(
                  template.sampleBody,
                  // Merge fields show their example here; the real per-person
                  // values appear after "Check recipients", resolved server-side.
                  bindings
                    .slice(0, template.variableCount)
                    .map((b) =>
                      b.kind === "literal"
                        ? b.value
                        : (mergeFields?.find((f) => f.key === b.field)
                            ?.example ?? ""),
                    ),
                )}
              </p>
            </div>
          )}
        </section>

        {/* 2 · Audience */}
        <section className="space-y-3 border-t pt-5">
          <h4 className="text-sm font-semibold">2 · Choose who receives it</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Send to</Label>
              <Select
                value={role}
                onValueChange={(v) => {
                  const r = v as AudienceRole;
                  setRole(r);
                  // Reset scope when the new role doesn't support the old one.
                  if (!SCOPES_FOR[r].includes(scope)) setScope("all");
                  setCampusIds([]);
                  setUserIds([]);
                  // A merge field valid for students (team name) may not exist
                  // for coordinators, so drop merge bindings on a role change
                  // rather than sending one the server would reject.
                  setBindings((prev) =>
                    prev.map((b) =>
                      b.kind === "merge" ? { kind: "literal", value: "" } : b,
                    ),
                  );
                  resetPreview();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABEL) as AudienceRole[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Narrow it down</Label>
              <Select
                value={scope}
                onValueChange={(v) => {
                  setScope(v as AudienceScope);
                  setCampusIds([]);
                  setUserIds([]);
                  resetPreview();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPES_FOR[role].map((s) => (
                    <SelectItem key={s} value={s}>
                      {SCOPE_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {scope === "campus" && (
            <div className="space-y-2">
              <Label className="text-xs">Campuses</Label>
              <div className="flex flex-wrap gap-2">
                {(campuses ?? []).map((c: { id: number; name: string }) => {
                  const on = campusIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setCampusIds(
                          on
                            ? campusIds.filter((x) => x !== c.id)
                            : [...campusIds, c.id],
                        );
                        resetPreview();
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        on
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:bg-muted",
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {scope === "team" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Team IDs</Label>
              <Input
                value={teamIdsRaw}
                onChange={(e) => {
                  setTeamIdsRaw(e.target.value);
                  resetPreview();
                }}
                placeholder="e.g. 12, 45, 88"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated. Every member of those teams receives it.
              </p>
            </div>
          )}

          {scope === "specific" && (
            <div className="space-y-2">
              <Label className="text-xs">
                Pick {ROLE_LABEL[role].toLowerCase()} ({userIds.length} selected)
              </Label>
              <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
                {users.map(
                  (u: {
                    id: string;
                    firstName?: string;
                    lastName?: string;
                    email: string;
                  }) => {
                    const on = userIds.includes(u.id);
                    const name =
                      `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ||
                      u.email;
                    return (
                      <label
                        key={u.id}
                        className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            setUserIds(
                              on
                                ? userIds.filter((x) => x !== u.id)
                                : [...userIds, u.id],
                            );
                            resetPreview();
                          }}
                        />
                        <span className="flex-1">{name}</span>
                        <span className="text-xs text-muted-foreground">
                          {u.email}
                        </span>
                      </label>
                    );
                  },
                )}
                {users.length === 0 && (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    No {ROLE_LABEL[role].toLowerCase()} found.
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 3 · Preview + send */}
        <section className="space-y-3 border-t pt-5">
          <h4 className="text-sm font-semibold">3 · Check, then send</h4>

          <Button
            type="button"
            variant="outline"
            onClick={() => previewMut.mutate()}
            disabled={previewMut.isPending}
          >
            <Users className="h-4 w-4 mr-2" />
            {previewMut.isPending ? "Checking…" : "Check recipients"}
          </Button>

          {preview && (
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <span className="text-2xl font-bold tabular-nums">
                  {preview.reachable}
                </span>
                <span className="text-sm text-muted-foreground">
                  will receive this message
                </span>
                {preview.skipped > 0 && (
                  <span className="text-sm text-amber-600 dark:text-amber-500">
                    {preview.skipped} skipped — no WhatsApp number on file
                  </span>
                )}
              </div>

              {preview.overLimit && (
                <p className="text-sm text-destructive">
                  Over the {preview.maxPerBroadcast} per-broadcast limit. Narrow
                  the audience.
                </p>
              )}

              {preview.sample.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">For example: </span>
                  {preview.sample
                    .slice(0, 6)
                    .map((s) => s.name)
                    .join(", ")}
                  {preview.total > 6 && ` and ${preview.total - 6} more`}
                </div>
              )}

              {preview.unreachableSample.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-amber-600 dark:text-amber-500">
                    Who is missing a number?
                  </summary>
                  <p className="mt-1.5 text-muted-foreground">
                    {preview.unreachableSample.map((s) => s.name).join(", ")}
                  </p>
                </details>
              )}

              {/* The actual message these people will receive, with their own
                  values filled in by the server. This is the check that catches
                  a wrong merge field before 2,000 people see it. */}
              {preview.personalisation?.length > 0 && template?.sampleBody && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    What each person will actually receive
                  </p>
                  {preview.personalisation.map((p) => (
                    <div
                      key={p.name}
                      className="rounded-md bg-muted/50 border p-2.5"
                    >
                      <p className="text-[11px] font-medium text-muted-foreground mb-1">
                        To {p.name}
                      </p>
                      <p className="text-xs whitespace-pre-wrap">
                        {renderPreview(template.sampleBody, p.values)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={
                    !configured ||
                    preview.reachable === 0 ||
                    preview.overLimit ||
                    missingParams
                  }
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send to {preview.reachable}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => sendMut.mutate(true)}
                  disabled={sendMut.isPending}
                >
                  <FlaskConical className="h-4 w-4 mr-2" />
                  Dry run
                </Button>
              </div>
              {missingParams && (
                <p className="text-xs text-destructive">
                  Fill in every template value first.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Test send */}
        <section className="space-y-2 border-t pt-5">
          <h4 className="text-sm font-semibold">Send a test to one number</h4>
          <div className="flex flex-wrap gap-2">
            <Input
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="9849012345"
              className="max-w-56"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => testMut.mutate()}
              disabled={!configured || !templateId || !testPhone || testMut.isPending}
            >
              {testMut.isPending ? "Sending…" : "Send test"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Always test against your own phone before a broadcast.
          </p>
        </section>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send to {preview?.reachable} people?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This sends <strong>{template?.displayName}</strong> to{" "}
                  <strong>{preview?.reachable}</strong>{" "}
                  {ROLE_LABEL[role].toLowerCase()} on WhatsApp.
                </p>
                <p className="text-destructive font-medium">
                  WhatsApp messages cannot be recalled.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                sendMut.mutate(false);
              }}
              disabled={sendMut.isPending}
            >
              {sendMut.isPending ? "Sending…" : "Yes, send now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Templates ───────────────────────────────────────────────────────────────

function TemplatesTab({
  templates,
  onChanged,
}: {
  templates: WhatsAppTemplate[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    templateId: "",
    displayName: "",
    category: "utility" as WhatsAppTemplate["category"],
    language: "en",
    variableCount: 0,
    sampleBody: "",
  });

  const createMut = useMutation({
    mutationFn: () =>
      createTemplate({
        ...form,
        variableLabels: null,
        isActive: true,
      } as never),
    onSuccess: () => {
      toast({ title: "Template registered" });
      setOpen(false);
      setForm({
        templateId: "",
        displayName: "",
        category: "utility",
        language: "en",
        variableCount: 0,
        sampleBody: "",
      });
      onChanged();
    },
    onError: (e) =>
      toast({
        title: "Could not register",
        description: apiErrorMessage(e, "Check the template name."),
        variant: "destructive",
      }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      toast({ title: "Template removed" });
      onChanged();
    },
  });

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold">Registered templates</h4>
          <p className="text-xs text-muted-foreground mt-1 max-w-prose">
            Karix has no API for listing templates, so each approved template is
            recorded here once. The name must match your Karix console exactly —
            a mismatch is rejected at send time.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setOpen(!open)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add
        </Button>
      </div>

      {open && (
        <div className="rounded-md border p-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Template name (from Karix)</Label>
            <Input
              value={form.templateId}
              onChange={(e) => setForm({ ...form, templateId: e.target.value })}
              placeholder="brave_journal_reminder"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Display name</Label>
            <Input
              value={form.displayName}
              onChange={(e) =>
                setForm({ ...form, displayName: e.target.value })
              }
              placeholder="Weekly journal reminder"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select
              value={form.category}
              onValueChange={(v) =>
                setForm({ ...form, category: v as WhatsAppTemplate["category"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="utility">Utility</SelectItem>
                <SelectItem value="marketing">Marketing</SelectItem>
                <SelectItem value="authentication">Authentication</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Number of variables</Label>
            <Input
              type="number"
              min={0}
              max={20}
              value={form.variableCount}
              onChange={(e) =>
                setForm({ ...form, variableCount: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">Body text (for the preview)</Label>
            <Textarea
              rows={3}
              value={form.sampleBody}
              onChange={(e) => setForm({ ...form, sampleBody: e.target.value })}
              placeholder="Hi {{1}}, your weekly journal for week {{2}} is due tomorrow."
            />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <Button
              type="button"
              onClick={() => createMut.mutate()}
              disabled={
                !form.templateId.trim() ||
                !form.displayName.trim() ||
                createMut.isPending
              }
            >
              Save template
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="divide-y rounded-md border">
        {templates.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            Nothing registered yet.
          </p>
        )}
        {templates.map((t) => (
          <div key={t.id} className="flex items-center gap-3 p-3">
            <CheckCircle2
              className={cn(
                "h-4 w-4 shrink-0",
                t.isActive ? "text-green-600" : "text-muted-foreground/40",
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{t.displayName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {t.templateId} · {t.category} · {t.variableCount} variable
                {t.variableCount === 1 ? "" : "s"}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => deleteMut.mutate(t.id)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── History ─────────────────────────────────────────────────────────────────

function HistoryTab() {
  const { data: batches } = useQuery({
    queryKey: whatsappQueryKeys.sends,
    queryFn: getSendHistory,
  });

  return (
    <Card className="p-6">
      <h4 className="text-sm font-semibold mb-1">Recent broadcasts</h4>
      <p className="text-xs text-muted-foreground mb-4">
        Every send is recorded per recipient. This is the record of who was
        messaged, with what, and by whom.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-4 font-medium">When</th>
              <th className="py-2 pr-4 font-medium">Template</th>
              <th className="py-2 pr-4 font-medium text-right">Sent</th>
              <th className="py-2 font-medium text-right">Failed</th>
            </tr>
          </thead>
          <tbody>
            {(batches ?? []).map((b) => (
              <tr key={b.batchId} className="border-b last:border-0">
                <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                  {new Date(b.createdAt).toLocaleString("en-IN")}
                </td>
                <td className="py-2 pr-4">{b.templateId}</td>
                <td className="py-2 pr-4 text-right tabular-nums">{b.sent}</td>
                <td
                  className={cn(
                    "py-2 text-right tabular-nums",
                    b.failed > 0 && "text-destructive",
                  )}
                >
                  {b.failed}
                </td>
              </tr>
            ))}
            {(batches ?? []).length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="py-4 text-muted-foreground text-center"
                >
                  Nothing sent yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
