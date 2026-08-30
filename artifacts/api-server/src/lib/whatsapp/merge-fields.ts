/**
 * WhatsApp merge fields (additive, isolated).
 *
 * A template like
 *
 *   "Hello {{1}}, this is an update on your BRAVE enrolment at {{2}}.
 *    ... log the visit before {{3}}."
 *
 * needs {{1}} and {{2}} to differ for EVERY recipient — the student's own name,
 * their own campus — while {{3}} is one date the admin types once. Without this
 * distinction a broadcast would greet all 7,500 students by the same name.
 *
 * So each template variable is bound to either:
 *   - a MERGE FIELD, resolved per recipient from data we already hold, or
 *   - a LITERAL, typed once by the admin and identical for everyone.
 *
 * DESIGN NOTES
 * - Every field has a `fallback`. WhatsApp REJECTS a template parameter that is
 *   empty or whitespace, so a missing campus name must degrade to something
 *   sensible ("your campus") rather than failing the send for that person.
 * - Fields declare which roles they apply to. Coordinators have no team, so
 *   offering {{teamName}} for a coordinator broadcast would be a promise the
 *   resolver cannot keep.
 * - Values are resolved from the SAME ResolvedRecipient the audience resolver
 *   already produced, plus one programme-config read. No extra per-recipient
 *   query — a 2,000-person broadcast stays two queries, not two thousand.
 */
import type { ResolvedRecipient } from "./audience";

/** Everything a merge field can be resolved from. */
export type MergeContext = {
  recipient: ResolvedRecipient;
  /** Programme-level values, read once per broadcast. */
  programme: {
    seasonName: string;
    endDate: string | null;
    demoDayDate: string | null;
    journalEditDeadline: string | null;
  };
};

export type MergeFieldKey =
  | "firstName"
  | "fullName"
  | "campusName"
  | "teamName"
  | "email"
  | "seasonName"
  | "programmeEndDate"
  | "demoDayDate"
  | "journalDeadline";

export type MergeFieldDef = {
  key: MergeFieldKey;
  /** Shown in the admin picker. */
  label: string;
  /** What it looks like, so an admin can tell two similar fields apart. */
  example: string;
  /** Used when the underlying value is missing — never an empty string. */
  fallback: string;
  /** Roles this field can be offered for. */
  roles: Array<"student" | "coordinator" | "admin">;
  resolve: (ctx: MergeContext) => string | null;
};

/** Indian-format date for a YYYY-MM-DD string, e.g. "15 Jul 2026". */
function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const ALL_ROLES = ["student", "coordinator", "admin"] as const;

export const MERGE_FIELDS: MergeFieldDef[] = [
  {
    key: "firstName",
    label: "First name",
    example: "Tirupathi",
    fallback: "there",
    roles: [...ALL_ROLES],
    // Names in this system arrive from several sources with inconsistent
    // casing, so take the first word of whatever we hold.
    resolve: (c) => c.recipient.name?.trim().split(/\s+/)[0] ?? null,
  },
  {
    key: "fullName",
    label: "Full name",
    example: "Tirupathi Rao Kella",
    fallback: "there",
    roles: [...ALL_ROLES],
    resolve: (c) => c.recipient.name?.trim() ?? null,
  },
  {
    key: "campusName",
    label: "Campus name",
    example: "NIAT Hyderabad",
    fallback: "your campus",
    roles: ["student", "coordinator"],
    resolve: (c) => c.recipient.campusName,
  },
  {
    key: "teamName",
    label: "Team name",
    example: "Team Velocity",
    fallback: "your team",
    roles: ["student"],
    resolve: (c) => c.recipient.teamName,
  },
  {
    key: "email",
    label: "Email address",
    example: "student@nxtwave.in",
    fallback: "your registered email",
    roles: [...ALL_ROLES],
    resolve: (c) => c.recipient.email,
  },
  {
    key: "seasonName",
    label: "Season name",
    example: "BRAVE Season 2",
    fallback: "the BRAVE programme",
    roles: [...ALL_ROLES],
    resolve: (c) => c.programme.seasonName,
  },
  {
    key: "programmeEndDate",
    label: "Programme end date",
    example: "15 Jul 2026",
    fallback: "the programme deadline",
    roles: [...ALL_ROLES],
    resolve: (c) => formatDate(c.programme.endDate),
  },
  {
    key: "demoDayDate",
    label: "Demo Day date",
    example: "12 Jun 2026",
    fallback: "the announced date",
    roles: [...ALL_ROLES],
    resolve: (c) => formatDate(c.programme.demoDayDate),
  },
  {
    key: "journalDeadline",
    label: "Journal deadline",
    example: "20 Aug 2026",
    fallback: "the weekly deadline",
    roles: ["student"],
    resolve: (c) => formatDate(c.programme.journalEditDeadline),
  },
];

const BY_KEY = new Map(MERGE_FIELDS.map((f) => [f.key, f]));

/** Fields offerable for a role, for the admin picker. */
export function mergeFieldsForRole(
  role: "student" | "coordinator" | "admin",
): MergeFieldDef[] {
  return MERGE_FIELDS.filter((f) => f.roles.includes(role));
}

/**
 * One template variable's binding. `literal` is the same text for everyone;
 * `merge` resolves per recipient.
 */
export type VariableBinding =
  | { kind: "literal"; value: string }
  | { kind: "merge"; field: MergeFieldKey };

/**
 * WhatsApp rejects a parameter that is empty, whitespace-only, or contains a
 * newline or tab — the message fails for that recipient with no useful reason.
 * Every resolved value passes through here.
 */
function sanitise(value: string, fallback: string): string {
  const cleaned = (value ?? "").replace(/[\r\n\t]+/g, " ").trim();
  return cleaned || fallback;
}

/**
 * Resolve one recipient's positional parameter list.
 *
 * Returns values in binding order, which is {{1}}, {{2}}, {{3}} — the caller
 * maps that to Karix's 0-indexed string map.
 */
export function resolveBindings(
  bindings: VariableBinding[],
  ctx: MergeContext,
): string[] {
  return bindings.map((b) => {
    if (b.kind === "literal") {
      // A literal is admin-typed, so it still needs sanitising, but an empty
      // one is a validation error upstream rather than something to paper over.
      return sanitise(b.value, "-");
    }
    const field = BY_KEY.get(b.field);
    if (!field) return "-";
    return sanitise(field.resolve(ctx) ?? "", field.fallback);
  });
}

/**
 * True when any binding is a merge field — i.e. the message differs per person
 * and cannot be sent as one bulk request. Drives batching in the send path.
 */
export function hasMergeFields(bindings: VariableBinding[]): boolean {
  return bindings.some((b) => b.kind === "merge");
}

/** Human summary for the audit log and the confirm dialog. */
export function describeBindings(bindings: VariableBinding[]): string[] {
  return bindings.map((b, i) => {
    if (b.kind === "literal") return `{{${i + 1}}} = "${b.value}"`;
    const f = BY_KEY.get(b.field);
    return `{{${i + 1}}} = ${f?.label ?? b.field} (per recipient)`;
  });
}

/** Validate bindings against a template's variable count and the chosen role. */
export function validateBindings(
  bindings: VariableBinding[],
  variableCount: number,
  role: "student" | "coordinator" | "admin",
): string | null {
  if (bindings.length !== variableCount) {
    return `This template needs ${variableCount} value(s); ${bindings.length} supplied.`;
  }
  for (let i = 0; i < bindings.length; i++) {
    const b = bindings[i]!;
    if (b.kind === "literal") {
      if (!b.value?.trim()) return `Fill in value {{${i + 1}}}.`;
      continue;
    }
    const f = BY_KEY.get(b.field);
    if (!f) return `Unknown field for {{${i + 1}}}.`;
    if (!f.roles.includes(role)) {
      return `{{${i + 1}}} uses ${f.label}, which does not apply to ${role}s.`;
    }
  }
  return null;
}
