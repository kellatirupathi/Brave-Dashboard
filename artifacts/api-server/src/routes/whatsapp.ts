/**
 * WhatsApp broadcasts via Karix (additive, isolated — bypasses Orval codegen).
 *
 * Three concerns, deliberately in one file because they share one audience
 * model and one provider:
 *
 *   1. The template registry — Karix has no template-list API, so approved
 *      templates are recorded here once by an admin.
 *   2. Audience preview — resolve a selection to a recipient count WITHOUT
 *      sending, so nothing goes out unconfirmed.
 *   3. Send — the only endpoint that actually messages anyone.
 *
 * ISOLATION CONTRACT
 * - Nothing else imports from this file. Deleting it means removing the single
 *   `router.use(whatsappRouter)` line in routes/index.ts.
 * - EVERY endpoint is super-admin only. Messaging 7,500 real phone numbers is
 *   not a normal-admin capability, and WhatsApp has no unsend.
 * - Every send is audit-logged and written to whatsapp_sends per recipient,
 *   before and after the provider call.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  whatsappSendsTable,
  whatsappTemplatesTable,
} from "@workspace/db";
import {
  isWhatsAppConfigured,
  sendWhatsAppTemplate,
  sendWhatsAppTemplateToOne,
  mapWithConcurrency,
  MAX_RECIPIENTS_PER_REQUEST,
  PERSONALISED_CONCURRENCY,
  normaliseWhatsAppNumber,
} from "../lib/whatsapp/karix";
import {
  resolveAudience,
  validateSelection,
  type AudienceSelection,
  type ResolvedRecipient,
} from "../lib/whatsapp/audience";
import {
  MERGE_FIELDS,
  describeBindings,
  hasMergeFields,
  mergeFieldsForRole,
  resolveBindings,
  validateBindings,
  type MergeContext,
  type VariableBinding,
} from "../lib/whatsapp/merge-fields";
import { getConfig, resolveSeason } from "../lib/season";
import { seasonsTable } from "@workspace/db";
import { logAudit } from "../lib/audit";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Hard ceiling on one broadcast. Not a Karix limit — a blast radius limit.
 * A mis-scoped filter is unrecoverable, so an accidental all-students send
 * fails loudly rather than reaching everyone.
 */
const MAX_BROADCAST_RECIPIENTS = 2000;

/** Super-admin gate. Every endpoint in this file sits behind it. */
async function requireSuperAdmin(
  req: Request,
  res: Response,
): Promise<string | null> {
  if (!req.isAuthenticated() || req.user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  const [row] = await db
    .select({ isSuperAdmin: usersTable.isSuperAdmin })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id))
    .limit(1);
  if (!row?.isSuperAdmin) {
    res.status(403).json({
      error: "Only super admins can send WhatsApp messages.",
    });
    return null;
  }
  return req.user.id;
}

// ── Status ──────────────────────────────────────────────────────────────────

/** Whether the server has Karix credentials, so the UI can explain its absence. */
router.get(
  "/whatsapp/status",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireSuperAdmin(req, res))) return;
    res.json({
      configured: isWhatsAppConfigured(),
      senderNumber: process.env.KARIX_SENDER_NUMBER ?? null,
      maxPerRequest: MAX_RECIPIENTS_PER_REQUEST,
      maxPerBroadcast: MAX_BROADCAST_RECIPIENTS,
    });
  },
);

/**
 * The merge fields an admin can bind a template variable to, filtered to the
 * role being messaged. Served from the server so the picker can never offer a
 * field the resolver does not implement.
 */
router.get(
  "/whatsapp/merge-fields",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireSuperAdmin(req, res))) return;
    const role = String(req.query["role"] ?? "student");
    const valid = ["student", "coordinator", "admin"] as const;
    const chosen = (valid as readonly string[]).includes(role)
      ? (role as (typeof valid)[number])
      : "student";
    res.json(
      mergeFieldsForRole(chosen).map((f) => ({
        key: f.key,
        label: f.label,
        example: f.example,
        fallback: f.fallback,
      })),
    );
  },
);

/**
 * Programme-level values every merge field may need, read ONCE per broadcast
 * rather than per recipient.
 */
async function loadMergeProgramme(
  req: Request,
): Promise<MergeContext["programme"]> {
  const seasonId = await resolveSeason(req);
  let seasonName = "the BRAVE programme";
  try {
    const [s] = await db
      .select({ name: seasonsTable.name })
      .from(seasonsTable)
      .where(eq(seasonsTable.id, seasonId))
      .limit(1);
    if (s?.name) seasonName = s.name;
  } catch {
    // Falls through to the default — a missing season name must not stop a send.
  }
  try {
    const cfg = await getConfig(seasonId);
    return {
      seasonName,
      endDate: cfg.endDate ?? null,
      demoDayDate: cfg.demoDayDate ?? null,
      journalEditDeadline: cfg.journalEditDeadline ?? null,
    };
  } catch {
    return {
      seasonName,
      endDate: null,
      demoDayDate: null,
      journalEditDeadline: null,
    };
  }
}

// ── Template registry ───────────────────────────────────────────────────────

router.get(
  "/whatsapp/templates",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireSuperAdmin(req, res))) return;
    const rows = await db
      .select()
      .from(whatsappTemplatesTable)
      .orderBy(desc(whatsappTemplatesTable.createdAt));
    res.json(rows);
  },
);

const TemplateBody = z.object({
  templateId: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200),
  category: z.enum(["marketing", "utility", "authentication"]),
  language: z.string().trim().min(1).max(20).default("en"),
  variableCount: z.number().int().min(0).max(20),
  variableLabels: z.array(z.string().trim().max(80)).max(20).optional(),
  sampleBody: z.string().trim().max(4000).optional(),
  isActive: z.boolean().optional(),
});

router.post(
  "/whatsapp/templates",
  async (req: Request, res: Response): Promise<void> => {
    const actorId = await requireSuperAdmin(req, res);
    if (!actorId) return;
    const parsed = TemplateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const d = parsed.data;
    try {
      const [row] = await db
        .insert(whatsappTemplatesTable)
        .values({ ...d, createdBy: actorId })
        .returning();
      await logAudit(
        actorId,
        "create_whatsapp_template",
        "whatsapp_templates",
        row?.id,
        d.templateId,
      );
      res.status(201).json(row);
    } catch (err) {
      // The unique index on template_id is what makes this reachable.
      logger.error({ err }, "[whatsapp] template create failed");
      res
        .status(409)
        .json({ error: "A template with that name is already registered." });
    }
  },
);

router.patch(
  "/whatsapp/templates/:id",
  async (req: Request, res: Response): Promise<void> => {
    const actorId = await requireSuperAdmin(req, res);
    if (!actorId) return;
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid template id" });
      return;
    }
    const parsed = TemplateBody.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [row] = await db
      .update(whatsappTemplatesTable)
      .set(parsed.data)
      .where(eq(whatsappTemplatesTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    await logAudit(
      actorId,
      "update_whatsapp_template",
      "whatsapp_templates",
      id,
      JSON.stringify(parsed.data),
    );
    res.json(row);
  },
);

router.delete(
  "/whatsapp/templates/:id",
  async (req: Request, res: Response): Promise<void> => {
    const actorId = await requireSuperAdmin(req, res);
    if (!actorId) return;
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid template id" });
      return;
    }
    await db
      .delete(whatsappTemplatesTable)
      .where(eq(whatsappTemplatesTable.id, id));
    await logAudit(actorId, "delete_whatsapp_template", "whatsapp_templates", id);
    res.status(204).end();
  },
);

// ── Audience preview ────────────────────────────────────────────────────────

/**
 * One template variable. A literal is the same text for everyone; a merge field
 * resolves to that recipient's own value.
 */
const BindingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: z.string().max(1000) }),
  z.object({
    kind: z.literal("merge"),
    field: z.enum(
      MERGE_FIELDS.map((f) => f.key) as [string, ...string[]],
    ),
  }),
]);

const SelectionBody = z.object({
  role: z.enum(["student", "coordinator", "admin"]),
  scope: z.enum(["all", "campus", "team", "specific"]),
  campusIds: z.array(z.number().int().positive()).max(100).optional(),
  teamIds: z.array(z.number().int().positive()).max(2000).optional(),
  userIds: z.array(z.string().min(1)).max(5000).optional(),
});

/** Merge-field values for the first few recipients, for the preview pane. */
async function samplePersonalisation(
  req: Request,
  recipients: ResolvedRecipient[],
  bindings: VariableBinding[],
): Promise<Array<{ name: string; values: string[] }>> {
  if (bindings.length === 0 || recipients.length === 0) return [];
  const programme = await loadMergeProgramme(req);
  return recipients.slice(0, 3).map((r) => ({
    name: r.name,
    values: resolveBindings(bindings, { recipient: r, programme }),
  }));
}

/**
 * Resolve a selection WITHOUT sending. This is what the confirm step renders,
 * and it calls the same resolver the send does — so the number an admin
 * approves is the number that gets messaged.
 */
const PreviewBody = SelectionBody.extend({
  /** Optional — when supplied, the preview also renders real merge values. */
  bindings: z.array(BindingSchema).max(20).optional(),
});

router.post(
  "/whatsapp/audience/preview",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireSuperAdmin(req, res))) return;
    const parsed = PreviewBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { bindings: previewBindings, ...selectionFields } = parsed.data;
    const selection = selectionFields as AudienceSelection;
    const invalid = validateSelection(selection);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }

    try {
      const resolved = await resolveAudience(selection);
      res.json({
        total: resolved.total,
        reachable: resolved.reachable,
        skipped: resolved.skipped,
        overLimit: resolved.reachable > MAX_BROADCAST_RECIPIENTS,
        maxPerBroadcast: MAX_BROADCAST_RECIPIENTS,
        // A sample, not the whole list — enough to confirm the filter is right
        // without shipping thousands of phone numbers to the browser.
        sample: resolved.recipients.slice(0, 25).map((r) => ({
          name: r.name,
          campusName: r.campusName,
          teamName: r.teamName,
          reachable: !!r.normalisedPhone,
        })),
        // Named, so an admin can go fix their roster rows.
        unreachableSample: resolved.recipients
          .filter((r) => !r.normalisedPhone)
          .slice(0, 25)
          .map((r) => ({ name: r.name, campusName: r.campusName })),
        // Real resolved values for the first few reachable people, so the
        // confirm step shows the actual personalised message rather than the
        // template with placeholders still in it.
        personalisation: await samplePersonalisation(
          req,
          resolved.recipients.filter((r) => !!r.normalisedPhone),
          (previewBindings ?? []) as VariableBinding[],
        ),
      });
    } catch (err) {
      logger.error({ err }, "[whatsapp] audience preview failed");
      res.status(500).json({ error: "Could not resolve that audience." });
    }
  },
);

// ── Send ────────────────────────────────────────────────────────────────────

const SendBody = z.object({
  templateId: z.string().trim().min(1).max(200),
  bindings: z.array(BindingSchema).max(20).default([]),
  audience: SelectionBody,
  /**
   * Must equal the reachable count the admin was shown. If the audience has
   * changed since the preview, the send is refused rather than going to a
   * different set of people than the one that was confirmed.
   */
  confirmedCount: z.number().int().min(0),
  /** Resolve and log, but never call Karix. */
  dryRun: z.boolean().optional(),
});

router.post(
  "/whatsapp/send",
  async (req: Request, res: Response): Promise<void> => {
    const actorId = await requireSuperAdmin(req, res);
    if (!actorId) return;

    const parsed = SendBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { templateId, bindings, audience, confirmedCount, dryRun } =
      parsed.data as {
        templateId: string;
        bindings: VariableBinding[];
        audience: AudienceSelection;
        confirmedCount: number;
        dryRun?: boolean;
      };

    if (!dryRun && !isWhatsAppConfigured()) {
      res.status(503).json({
        error:
          "WhatsApp is not configured on this server (KARIX_API_KEY / KARIX_SENDER_NUMBER).",
      });
      return;
    }

    const invalid = validateSelection(audience as AudienceSelection);
    if (invalid) {
      res.status(400).json({ error: invalid });
      return;
    }

    // The template must be one an admin registered, not an arbitrary string —
    // otherwise a typo reaches Karix as status 210 after the audit row is
    // already written.
    const [template] = await db
      .select()
      .from(whatsappTemplatesTable)
      .where(
        and(
          eq(whatsappTemplatesTable.templateId, templateId),
          eq(whatsappTemplatesTable.isActive, true),
        ),
      )
      .limit(1);
    if (!template) {
      res.status(404).json({
        error: "That template is not registered, or is inactive.",
      });
      return;
    }
    const bindingError = validateBindings(
      bindings,
      template.variableCount,
      audience.role,
    );
    if (bindingError) {
      res.status(400).json({ error: bindingError });
      return;
    }

    let resolved;
    try {
      resolved = await resolveAudience(audience as AudienceSelection);
    } catch (err) {
      logger.error({ err }, "[whatsapp] audience resolve failed");
      res.status(500).json({ error: "Could not resolve that audience." });
      return;
    }

    const targets = resolved.recipients.filter((r) => !!r.normalisedPhone);

    if (targets.length === 0) {
      res.status(400).json({
        error: "Nobody in that audience has a usable WhatsApp number.",
      });
      return;
    }
    if (targets.length > MAX_BROADCAST_RECIPIENTS) {
      res.status(413).json({
        error: `That audience is ${targets.length} people, over the ${MAX_BROADCAST_RECIPIENTS} per-broadcast limit.`,
      });
      return;
    }
    // Guards against the audience shifting between preview and send.
    if (targets.length !== confirmedCount) {
      res.status(409).json({
        error: `The audience changed since you previewed it (was ${confirmedCount}, now ${targets.length}). Preview again before sending.`,
        code: "AUDIENCE_CHANGED",
        reachable: targets.length,
      });
      return;
    }

    const batchId = `wa_${Date.now()}_${Math.round(
      Number(process.hrtime.bigint() % 100000n),
    )}`;
    const seasonId = await resolveSeason(req);

    await logAudit(
      actorId,
      dryRun ? "whatsapp_send_dry_run" : "whatsapp_send",
      "whatsapp_sends",
      undefined,
      JSON.stringify({
        batchId,
        templateId,
        recipients: targets.length,
        audience,
        // The bindings, in words, so the audit row says what was actually sent
        // rather than just how many people got it.
        bindings: describeBindings(bindings),
      }),
    );

    // Resolve each recipient's own values up front, so the log records exactly
    // what that person was sent — not the template, the rendered values.
    const programme = await loadMergeProgramme(req);
    const perRecipientParams = new Map<string, string[]>();
    for (const t of targets) {
      perRecipientParams.set(
        t.normalisedPhone!,
        resolveBindings(bindings, { recipient: t, programme }),
      );
    }

    // Rows are written BEFORE the provider call, so a crash mid-send still
    // leaves a record of who was in scope.
    const baseRows = targets.map((t) => ({
      batchId,
      templateId,
      recipientPhone: t.normalisedPhone!,
      recipientUserId: t.userId,
      recipientName: t.name,
      recipientRole: t.role,
      campusId: t.campusId,
      parameterValues: perRecipientParams.get(t.normalisedPhone!) ?? [],
      status: dryRun ? "skipped" : "pending",
      statusDesc: dryRun ? "Dry run — not sent" : null,
      seasonId,
      sentBy: actorId,
    }));
    try {
      for (let i = 0; i < baseRows.length; i += 500) {
        await db.insert(whatsappSendsTable).values(baseRows.slice(i, i + 500));
      }
    } catch (err) {
      logger.error({ err, batchId }, "[whatsapp] failed to write send log");
      res.status(500).json({ error: "Could not record the send." });
      return;
    }

    if (dryRun) {
      res.json({
        batchId,
        dryRun: true,
        wouldSend: targets.length,
        skipped: resolved.skipped,
        // A worked example of the first recipient's values, so a dry run
        // actually demonstrates the personalisation rather than just a count.
        samplePersonalisation: targets.slice(0, 3).map((t) => ({
          name: t.name,
          values: perRecipientParams.get(t.normalisedPhone!) ?? [],
        })),
      });
      return;
    }

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    const noteError = (e?: string) => {
      if (e && !errors.includes(e)) errors.push(e);
    };

    /** Mark a set of phones with one outcome. */
    const record = async (
      phones: string[],
      result: {
        ok: boolean;
        statusCode?: string;
        statusDesc?: string;
        messageId?: string;
        error?: string;
      },
    ) => {
      await db
        .update(whatsappSendsTable)
        .set({
          status: result.ok ? "sent" : "failed",
          statusCode: result.statusCode ?? null,
          statusDesc: result.error ?? result.statusDesc ?? null,
          messageId: result.messageId ?? null,
        })
        .where(
          and(
            eq(whatsappSendsTable.batchId, batchId),
            sql`${whatsappSendsTable.recipientPhone} = ANY(${phones})`,
          ),
        );
    };

    if (hasMergeFields(bindings)) {
      // PERSONALISED PATH — one request per recipient.
      //
      // Karix applies a single parameter set to the whole `recipients` array,
      // so a bulk send here would greet every student by the first student's
      // name. Concurrency is capped rather than unbounded: these are real
      // messages, and tripping a provider rate limit mid-broadcast would leave
      // half the audience messaged and half not.
      const results = await mapWithConcurrency(
        targets,
        PERSONALISED_CONCURRENCY,
        async (t) => {
          const phone = t.normalisedPhone!;
          const result = await sendWhatsAppTemplateToOne({
            templateId,
            language: template.language,
            parameters: perRecipientParams.get(phone) ?? [],
            recipient: { phone, userId: t.userId, name: t.name },
          });
          await record([phone], result);
          return result;
        },
      );
      for (const r of results) {
        if (r.ok) sent += 1;
        else {
          failed += 1;
          noteError(r.error);
        }
      }
    } else {
      // BULK PATH — every recipient gets identical text, so one request per
      // chunk. Chunked because Karix rejects an oversized recipient list with
      // status 249 rather than truncating it.
      const sharedParams = resolveBindings(bindings, {
        recipient: targets[0]!,
        programme,
      });
      for (let i = 0; i < targets.length; i += MAX_RECIPIENTS_PER_REQUEST) {
        const chunk = targets.slice(i, i + MAX_RECIPIENTS_PER_REQUEST);
        const result = await sendWhatsAppTemplate({
          templateId,
          language: template.language,
          parameters: sharedParams,
          recipients: chunk.map((c) => ({
            phone: c.normalisedPhone!,
            userId: c.userId,
            name: c.name,
          })),
        });
        await record(
          chunk.map((c) => c.normalisedPhone!),
          result,
        );
        if (result.ok) sent += chunk.length;
        else {
          failed += chunk.length;
          noteError(result.error);
        }
      }
    }

    logger.info(
      { batchId, templateId, sent, failed, actorId },
      "[whatsapp] broadcast complete",
    );

    res.json({
      batchId,
      sent,
      failed,
      skipped: resolved.skipped,
      // Distinct provider messages, so a whole failed batch explains itself
      // instead of just reporting a count.
      errors,
    });
  },
);

// ── History ─────────────────────────────────────────────────────────────────

/** Recent broadcasts, grouped by batch. The forensic view. */
router.get(
  "/whatsapp/sends",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireSuperAdmin(req, res))) return;
    const rows = await db
      .select({
        batchId: whatsappSendsTable.batchId,
        templateId: whatsappSendsTable.templateId,
        sentBy: whatsappSendsTable.sentBy,
        createdAt: sql<string>`min(${whatsappSendsTable.createdAt})`,
        total: sql<number>`count(*)::int`,
        sent: sql<number>`count(*) filter (where ${whatsappSendsTable.status} = 'sent')::int`,
        failed: sql<number>`count(*) filter (where ${whatsappSendsTable.status} = 'failed')::int`,
      })
      .from(whatsappSendsTable)
      .groupBy(
        whatsappSendsTable.batchId,
        whatsappSendsTable.templateId,
        whatsappSendsTable.sentBy,
      )
      .orderBy(sql`min(${whatsappSendsTable.createdAt}) desc`)
      .limit(50);
    res.json(rows);
  },
);

/** One-off test send, so an admin can verify wiring against their own phone. */
const TestBody = z.object({
  templateId: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(6).max(30),
  parameters: z.array(z.string().max(1000)).max(20).optional(),
});

router.post(
  "/whatsapp/test",
  async (req: Request, res: Response): Promise<void> => {
    const actorId = await requireSuperAdmin(req, res);
    if (!actorId) return;
    const parsed = TestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const normalised = normaliseWhatsAppNumber(parsed.data.phone);
    if (!normalised) {
      res.status(400).json({
        error: "That does not look like an Indian mobile number.",
      });
      return;
    }
    const result = await sendWhatsAppTemplate({
      templateId: parsed.data.templateId,
      parameters: parsed.data.parameters ?? [],
      recipients: [{ phone: normalised }],
    });
    await logAudit(
      actorId,
      "whatsapp_test_send",
      "whatsapp_sends",
      undefined,
      `${parsed.data.templateId} -> ${normalised}`,
    );
    res.status(result.ok ? 200 : 502).json(result);
  },
);

export default router;
