/**
 * Season 2 BRD composition + submission progress (additive, isolated).
 *
 * THERE IS NO BRD FORM IN SEASON 2. The document is assembled from what was
 * already recorded at stages 1-4 and shown to the student to confirm. That is
 * the single change that removes the largest fabrication surface in Season 1:
 * a BRD can no longer contain anything that was not logged as it happened.
 *
 * Submission progress lives here too, so the checklist the student sees and
 * the check that actually blocks submission are the same code.
 */
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  leadsTable,
  leadInteractionsTable,
  paymentScheduleTable,
  paymentsTable,
  projectPhasesTable,
  projectsTable,
  teamsTable,
} from "@workspace/db";
import {
  evaluateGateA,
  trailBand,
  type GateAStatus,
} from "./lead-pipeline";

// ── Submission progress ─────────────────────────────────────────────────────

export type ChecklistItem = {
  key: string;
  label: string;
  passed: boolean;
  /** Shown when the item fails. Names the artefact, not the failing. */
  detail?: string;
};

export type GateCStatus = {
  passed: boolean;
  items: ChecklistItem[];
  /** Count of failing items, so the UI can say "1 item remaining". */
  remaining: number;
};

// ── The composed document ───────────────────────────────────────────────────

export type ComposedBrd = {
  project: {
    id: number;
    title: string;
    serviceCategory: string | null;
    teamName: string;
    seasonId: number;
    totalContractValue: number | null;
    revenueType: string | null;
    recurringFrequency: string | null;
  };
  client: {
    businessName: string;
    ownerName: string;
    phone: string;
    category: string;
    city: string;
    areaLocality: string | null;
  };
  /** How the relationship started — the related-party disclosure. */
  relationship: {
    source: string;
    isRelatedParty: boolean;
    referrerName: string | null;
    relationshipNote: string | null;
    firstMeetingDate: string;
    meetingMode: string;
    geoCaptured: boolean;
  };
  problemStatement: string | null;
  solutionDescription: string | null;
  techStack: unknown;
  links: {
    liveProductUrl: string | null;
    demoVideoUrl: string | null;
    sourceCodeUrl: string | null;
    prototypeUrl: string | null;
    demoCredentials: string | null;
  };
  interactionTrail: Array<{
    date: string;
    type: string;
    summary: string;
    outcome: string;
    hasAttachment: boolean;
    /** Hours between the event and the row being written. */
    loggedAfterHours: number | null;
  }>;
  phases: Array<{
    id: number;
    name: string;
    deliverables: string | null;
    startDate: string | null;
    endDate: string | null;
    scheduledAmount: number | null;
    dueDate: string | null;
    receivedAmount: number;
    status: "received" | "due" | "pending";
  }>;
  payments: Array<{
    phaseName: string;
    amount: number;
    date: string;
    mode: string;
    transactionRef: string | null;
    hasProof: boolean;
    hasInvoice: boolean;
    clientConfirmed: boolean;
  }>;
  /**
   * Added by the system, not editable by the student. Kept as its own block so
   * the document can render it visually set apart.
   */
  systemAssessment: {
    trailStrength: number;
    trailBand: string;
    gateA: GateAStatus;
    isRelatedParty: boolean;
    claimedAmount: number;
    receivedAmount: number;
    composedAt: string;
  };
  gateC: GateCStatus;
};

/**
 * Assemble the BRD for a Season 2 project.
 *
 * Returns null when the project is not a Season 2 pipeline project (no
 * `leadId`), because a Season 1 project has no trail to compose from — its BRD
 * was an uploaded file and stays that way.
 */
export async function composeBrd(
  projectId: number,
): Promise<ComposedBrd | null> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);
  if (!project || project.leadId == null) return null;

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, project.leadId))
    .limit(1);
  if (!lead) return null;

  const [team] = await db
    .select({ name: teamsTable.name })
    .from(teamsTable)
    .where(eq(teamsTable.id, project.teamId))
    .limit(1);

  const interactions = await db
    .select()
    .from(leadInteractionsTable)
    .where(eq(leadInteractionsTable.leadId, project.leadId))
    .orderBy(asc(leadInteractionsTable.interactionDate));

  const phases = await db
    .select()
    .from(projectPhasesTable)
    .where(eq(projectPhasesTable.projectId, projectId))
    .orderBy(asc(projectPhasesTable.sortOrder));

  const schedule = await db
    .select()
    .from(paymentScheduleTable)
    .where(eq(paymentScheduleTable.projectId, projectId));

  const payments = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.projectId, projectId))
    .orderBy(asc(paymentsTable.paymentDate));

  const gateA = evaluateGateA(interactions);
  const receivedTotal = payments.reduce((n, p) => n + p.amountReceived, 0);
  const scheduledTotal = schedule.reduce((n, s) => n + s.amount, 0);
  const claimed = project.totalContractValue ?? scheduledTotal;

  const scheduleByPhase = new Map(schedule.map((s) => [s.phaseId, s]));
  const receivedByPhase = new Map<number, number>();
  for (const p of payments) {
    receivedByPhase.set(
      p.phaseId,
      (receivedByPhase.get(p.phaseId) ?? 0) + p.amountReceived,
    );
  }
  const phaseNameById = new Map(phases.map((p) => [p.id, p.name]));

  const composedPhases = phases.map((ph) => {
    const sch = scheduleByPhase.get(ph.id);
    const received = receivedByPhase.get(ph.id) ?? 0;
    const scheduled = sch?.amount ?? null;
    return {
      id: ph.id,
      name: ph.name,
      deliverables: ph.deliverables,
      startDate: ph.startDate,
      endDate: ph.endDate,
      scheduledAmount: scheduled,
      dueDate: sch?.dueDate ?? null,
      receivedAmount: received,
      status:
        received > 0 && scheduled != null && received >= scheduled
          ? ("received" as const)
          : sch?.dueDate
            ? ("due" as const)
            : ("pending" as const),
    };
  });

  // Five equally weighted completion items. This is the only checklist that
  // controls submission; interaction volume, elapsed days and trail bands are
  // deliberately not gates.
  const items: ChecklistItem[] = [
    {
      key: "interaction",
      label: "At least one interaction",
      passed: interactions.length > 0,
      detail: "Record at least one client interaction.",
    },
    {
      key: "work",
      label: "Work section",
      passed:
        !!project.title?.trim() &&
        !!project.serviceCategory &&
        !!project.problemStatement &&
        !!project.solutionDescription,
      detail: "Complete the project title, service, problem and solution.",
    },
    {
      key: "proof",
      label: "Proof it exists",
      passed: Boolean(
        project.liveProductUrl ||
          project.demoVideoUrl ||
          project.sourceCodeUrl ||
          project.prototypeUrl,
      ),
      detail: "Add a live product, demo video, source code or prototype link.",
    },
    {
      key: "phases",
      label: "Phases",
      passed: phases.length > 0,
      detail: "Add the delivery phases.",
    },
    {
      key: "payment",
      label: "At least one payment",
      passed: payments.length > 0,
      detail: "Record at least one received payment.",
    },
  ];

  const failing = items.filter((i) => !i.passed);

  return {
    project: {
      id: project.id,
      title: project.title,
      serviceCategory: project.serviceCategory,
      teamName: team?.name ?? "",
      seasonId: project.seasonId,
      totalContractValue: project.totalContractValue,
      revenueType: project.revenueType,
      recurringFrequency: project.recurringFrequency,
    },
    client: {
      businessName: lead.businessName,
      ownerName: lead.ownerName,
      phone: lead.phone,
      category: lead.businessCategory,
      city: lead.city,
      areaLocality: lead.areaLocality,
    },
    relationship: {
      source: lead.source,
      isRelatedParty: lead.isRelatedParty,
      referrerName: lead.referrerName,
      relationshipNote: lead.relationshipNote,
      firstMeetingDate: lead.firstMeetingDate,
      meetingMode: lead.meetingMode,
      geoCaptured: !!lead.geoLat && !!lead.geoLng,
    },
    problemStatement: project.problemStatement,
    solutionDescription: project.solutionDescription,
    techStack: project.techStack,
    links: {
      liveProductUrl: project.liveProductUrl,
      demoVideoUrl: project.demoVideoUrl,
      sourceCodeUrl: project.sourceCodeUrl,
      prototypeUrl: project.prototypeUrl,
      demoCredentials: project.demoCredentials,
    },
    interactionTrail: interactions.map((i) => ({
      date: i.interactionDate,
      type: i.interactionType,
      summary: i.summary,
      outcome: i.outcome,
      hasAttachment:
        Array.isArray(i.attachments) && i.attachments.length > 0,
      // The gap between when it happened and when it was written. A large gap
      // is the backdating signal a reviewer looks for.
      loggedAfterHours: i.loggedAt
        ? Math.max(
            0,
            Math.round(
              (i.loggedAt.getTime() -
                Date.parse(`${i.interactionDate}T00:00:00Z`)) /
                3_600_000,
            ),
          )
        : null,
    })),
    phases: composedPhases,
    payments: payments.map((p) => ({
      phaseName: phaseNameById.get(p.phaseId) ?? `Phase ${p.phaseId}`,
      amount: p.amountReceived,
      date: p.paymentDate,
      mode: p.paymentMode,
      transactionRef: p.transactionRef,
      hasProof: !!p.paymentProof,
      hasInvoice: !!p.invoiceDoc,
      clientConfirmed: p.clientConfirmed,
    })),
    systemAssessment: {
      trailStrength: lead.trailStrength,
      trailBand: trailBand(lead.trailStrength),
      gateA,
      isRelatedParty: lead.isRelatedParty,
      claimedAmount: claimed,
      receivedAmount: receivedTotal,
      composedAt: new Date().toISOString(),
    },
    gateC: {
      passed: failing.length === 0,
      items,
      remaining: failing.length,
    },
  };
}

/**
 * Render the composed BRD as plain text, for the Gemini analysis pipeline.
 *
 * Reuses the EXISTING relevancy/uniqueness analysis rather than replacing it —
 * that code already works; it just receives composed content instead of an
 * uploaded PDF.
 */
export function renderBrdText(brd: ComposedBrd): string {
  const L: string[] = [];
  L.push(`BUSINESS REQUIREMENT DOCUMENT`);
  L.push(`Project: ${brd.project.title}`);
  L.push(`Team: ${brd.project.teamName}`);
  L.push(`Client: ${brd.client.businessName} (${brd.client.ownerName})`);
  L.push(`Category: ${brd.client.category} · ${brd.client.city}`);
  L.push("");
  L.push(`HOW WE MET`);
  L.push(`Source: ${brd.relationship.source}`);
  if (brd.relationship.isRelatedParty) {
    L.push(
      `Related party: yes — ${brd.relationship.referrerName ?? brd.relationship.relationshipNote ?? "undisclosed"}`,
    );
  } else {
    L.push(`Related party: no`);
  }
  L.push(
    `First meeting: ${brd.relationship.firstMeetingDate} (${brd.relationship.meetingMode})`,
  );
  L.push("");
  L.push(`PROBLEM`);
  L.push(brd.problemStatement ?? "(not provided)");
  L.push("");
  L.push(`SOLUTION`);
  L.push(brd.solutionDescription ?? "(not provided)");
  L.push("");
  L.push(`INTERACTION TRAIL (${brd.interactionTrail.length} entries)`);
  for (const i of brd.interactionTrail) {
    L.push(
      `  ${i.date} · ${i.type} · ${i.outcome}${i.hasAttachment ? " · evidence attached" : ""}`,
    );
    L.push(`      ${i.summary}`);
  }
  L.push("");
  L.push(`PHASE-WISE PLAN`);
  for (const p of brd.phases) {
    L.push(
      `  ${p.name}: ${p.deliverables ?? "—"} | scheduled ${p.scheduledAmount ?? "—"} | received ${p.receivedAmount} | ${p.status}`,
    );
  }
  L.push("");
  L.push(`PAYMENTS RECEIVED`);
  for (const p of brd.payments) {
    L.push(
      `  ${p.date} · ${p.phaseName} · ${p.amount} · ${p.mode}${p.transactionRef ? ` · ref ${p.transactionRef}` : ""}`,
    );
  }
  L.push("");
  L.push(`SYSTEM ASSESSMENT`);
  L.push(`  Claimed: ${brd.systemAssessment.claimedAmount}`);
  L.push(`  Received: ${brd.systemAssessment.receivedAmount}`);
  return L.join("\n");
}
