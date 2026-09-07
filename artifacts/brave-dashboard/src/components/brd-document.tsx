// The composed BRD, rendered as a document.
//
// Shared deliberately: the student previews this before submitting and the
// coordinator reads the SAME markup when reviewing it. Two renderers would
// eventually disagree about what the document says, and the whole point of a
// composed BRD is that everybody sees one record.
//
// Read-only. Nothing here writes; it draws what composeBrd() returned.
import { CheckCircle2, FileText, ShieldAlert } from "lucide-react";
import { formatDate, formatINR } from "@/lib/format";
import { resolveStoredObjectUrl } from "@/lib/storage-url";
import type { ComposedBrd } from "@/lib/leads-api";

function isImageAsset(url: string, types?: Record<string, string>): boolean {
  const declared = types?.[url];
  if (declared) return declared.startsWith("image/");
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
  types,
}: {
  urls: string[];
  labels?: string[];
  types?: Record<string, string>;
}) {
  if (urls.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-4">
      {urls.map((url, index) => {
        const href = resolveStoredObjectUrl(url);
        const label = labels?.[index] ?? `Attachment ${index + 1}`;
        return isImageAsset(url, types) ? (
          // Captioned, and large enough to actually read a payment screenshot
          // in — a reviewer should not have to open a new tab to check the
          // figure the claim rests on.
          <figure key={`${url}-${index}`} className="m-0 w-[260px]">
            <a href={href} target="_blank" rel="noreferrer" title={label}>
              <img
                src={href}
                alt={label}
                loading="lazy"
                className="w-full rounded border border-slate-300 bg-white object-contain"
              />
            </a>
            <figcaption className="mt-1 text-[11px] leading-snug text-slate-600">
              {label}
            </figcaption>
          </figure>
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

/** The three document pages. Callers supply their own frame. */
export function BrdDocument({ brd }: { brd: ComposedBrd }) {
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
    <div className="brd-print-root min-h-0 flex-1 overflow-y-auto bg-slate-100 p-3 sm:p-6">
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
              {brd.relationship.geoMapUrl ? (
                <p>
                  <strong>Location captured:</strong> GPS recorded at the
                  client's premises —{" "}
                  <a
                    href={brd.relationship.geoMapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    open the map
                  </a>
                  <span className="text-slate-500">
                    {" "}
                    ({brd.relationship.geoLat}, {brd.relationship.geoLng})
                  </span>
                </p>
              ) : (
                <BrdRow label="Location captured" value="No" />
              )}
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
              <BrdHeading>Meet proofs</BrdHeading>
              <BrdAttachments
                urls={brd.clientEvidence}
                types={brd.attachmentTypes}
              />
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
                      <BrdAttachments
                        urls={interaction.attachments}
                        types={brd.attachmentTypes}
                      />
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
                        types={brd.attachmentTypes}
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

          <p className="mt-10 pt-8 text-right text-xs text-slate-400">
            Page 3 of 3
          </p>
        </article>
      </div>
    </div>
  );
}
