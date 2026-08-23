import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  pgEnum,
  unique,
  index,
  uniqueIndex,
  primaryKey,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Enums
export const userRoleEnum = pgEnum("user_role", [
  "student",
  "coordinator",
  "admin",
]);
export const provisionedViaEnum = pgEnum("provisioned_via", [
  "roster",
  "csv_import",
  "manual",
  "auto_forms_sso",
]);
export const teamStatusEnum = pgEnum("team_status", [
  "pending",
  "active",
  "rejected",
  "changes_requested",
]);
export const projectStatusEnum = pgEnum("project_status", [
  "active",
  "inactive",
]);
export const entryStatusEnum = pgEnum("entry_status", [
  "draft",
  "submitted",
  "verified",
  // "revoked" applies to revenue entries only: a previously verified entry a
  // team leader has revoked. It stays visible (rendered struck-through) but is
  // excluded from every revenue total because those filter on 'verified'.
  "revoked",
  "rejected",
]);
export const enteredByEnum = pgEnum("entered_by", ["student", "admin"]);

// ── Season 2 lead-pipeline enums ─────────────────────────────────────────
// Declared here with the other enums because projectsTable (far below)
// references revenueTypeEnum / recurringFrequencyEnum. `const` is not
// hoisted, so declaring them after that table would be a TDZ error at
// module-evaluation time, not a compile error.
// How the student came by this client. The last two mark the relationship as
// related-party — allowed and not discouraged, but flagged for deeper checks.
// Keeping them as first-class options is deliberate: if the product punished
// them, students would misreport the source and the signal would be lost.
export const leadSourceEnum = pgEnum("lead_source", [
  "walk_in",
  "online",
  "referral",
  "known_contact",
]);
export const leadStageEnum = pgEnum("lead_stage", [
  "new",
  "qualified",
  "proposal_sent",
  "converted",
  "lost",
  // Set by the dormancy cron at 30 days of silence, not by the student.
  "dormant",
]);
export const businessCategoryEnum = pgEnum("business_category", [
  "retail",
  "food_beverage",
  "clinic",
  "salon",
  "education",
  "services",
  "manufacturing",
  "other",
]);
export const meetingModeEnum = pgEnum("meeting_mode", [
  "in_person",
  "phone",
  "video",
  "whatsapp",
]);
export const interactionTypeEnum = pgEnum("interaction_type", [
  "call",
  "whatsapp",
  "email",
  "site_visit",
  "demo",
  "proposal_sent",
  "negotiation",
  "payment_discussion",
]);
export const interactionOutcomeEnum = pgEnum("interaction_outcome", [
  "positive",
  "neutral",
  "objection",
  "no_response",
]);
export const paymentModeEnum = pgEnum("payment_mode", [
  "upi",
  "bank_transfer",
  "cash",
  "cheque",
]);
export const revenueTypeEnum = pgEnum("revenue_type", ["one_time", "recurring"]);
export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "monthly",
  "quarterly",
  "annual",
]);

// -- Phase 6: trust score and price recognition ------------------------------
// Trust is earned by verified behaviour and lost by proven misreporting. The
// event kinds are fixed and published so a team can always account for its own
// score - a score nobody can explain is worse than no score at all.
export const trustEventKindEnum = pgEnum("trust_event_kind", [
  // Earned
  "revenue_verified",
  "client_confirmed",
  "journal_streak",
  "trail_strong",
  "geo_verified",
  "phase_delivered_on_time",
  // Lost
  "client_disputed",
  "duplicate_client",
  "amount_overstated",
  "evidence_missing",
  "link_dead",
  "backdated_trail",
  // Escape hatch for a coordinator decision no rule covers. Requires a reason,
  // and is the only kind whose points are entered by hand.
  "manual_adjustment",
]);
export const trustTierEnum = pgEnum("trust_tier", [
  "watch",
  "bronze",
  "silver",
  "gold",
]);

// -- Phase 7: evaluation ------------------------------------------------------
// Five states, not two. "approved"/"rejected" are terminal; the middle three
// each describe a different reason the decision is not yet made, and they carry
// different SLA behaviour (see review_assignments.clock_paused_at).
export const reviewDecisionEnum = pgEnum("review_decision", [
  // Assigned, not yet opened or not yet decided.
  "pending",
  // Waiting on something the EVALUATOR or programme must do (a second opinion,
  // a coordinator call). The clock keeps running - the delay is ours.
  "hold",
  // Waiting on the STUDENT to supply something. The clock pauses, because
  // penalising the evaluator for a student's response time would be wrong.
  "changes_requested",
  "approved",
  "rejected",
]);
export const appealStatusEnum = pgEnum("appeal_status", [
  "open",
  "upheld",
  "declined",
  "withdrawn",
]);
export const milestoneTypeEnum = pgEnum("milestone_type", ["auto", "manual"]);
export const demoDayStatusEnum = pgEnum("demo_day_status", [
  "draft",
  "submitted",
  "shortlisted",
  "rejected",
]);
export const announcementTargetEnum = pgEnum("announcement_target", [
  "all",
  "campus",
  "team",
]);
export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "declined",
  "cancelled",
]);
export const joinRequestStatusEnum = pgEnum("join_request_status", [
  "pending",
  "approved",
  "declined",
  "cancelled",
]);
export const leaveRequestStatusEnum = pgEnum("leave_request_status", [
  "pending",
  "approved",
  "declined",
]);
export const membershipRequestTypeEnum = pgEnum("membership_request_type", [
  "join_by_code",
  "invite_accept",
  "join_request_approve",
  "leave",
  "leader_remove",
]);
export const membershipRequestStatusEnum = pgEnum("membership_request_status", [
  "pending",
  "approved",
  "rejected",
]);

// Campuses
export const campusesTable = pgTable("campuses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  coordinatorId: text("coordinator_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertCampusSchema = createInsertSchema(campusesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCampus = z.infer<typeof insertCampusSchema>;
export type Campus = typeof campusesTable.$inferSelect;

// Chatbot conversation history — every user message + the assistant's reply,
// captured best-effort from POST /chatbot/ask. `user_id` is null for logged-out
// chats. Read by the admin "Chatbot History" page (list per student → detail).
export const chatbotHistoryTable = pgTable(
  "chatbot_history",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id"),
    conversationId: text("conversation_id"),
    role: text("role").notNull(), // "user" | "assistant"
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("chatbot_history_user_idx").on(t.userId),
    index("chatbot_history_created_idx").on(t.createdAt),
  ],
);

export type ChatbotHistoryRow = typeof chatbotHistoryTable.$inferSelect;

// Page-view tracking — records which user opened which page (route) for the
// admin "Pages Log" tab. Best-effort, fire-and-forget inserts on navigation.
// `path` is the normalized route (dynamic ids collapsed to :id) so the
// most-visited aggregation is meaningful; `rawPath` keeps the exact URL.
export const pageViewsTable = pgTable(
  "page_views",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id"), // nullable, no FK (mirrors chatbot_history)
    role: text("role"), // 'student' | 'coordinator' | 'admin' | null
    path: text("path").notNull(), // normalized route, e.g. /admin/teams/:id
    rawPath: text("raw_path").notNull(), // exact path visited
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("page_views_path_idx").on(t.path),
    index("page_views_user_idx").on(t.userId),
    index("page_views_created_idx").on(t.createdAt),
  ],
);

export type PageViewRow = typeof pageViewsTable.$inferSelect;

// Users
export const usersTable = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    replitId: text("replit_id").unique(),
    formsUserId: text("forms_user_id").unique(),
    email: text("email").notNull(),
    niatId: text("niat_id"),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    profileImage: text("profile_image_url"),
    role: userRoleEnum("role").notNull().default("student"),
    // WhatsApp contact number (additive, nullable). Roster covers students
    // only, so coordinators and admins need their own column to be reachable
    // by a WhatsApp send. Null means "skip this recipient", never an error.
    mobileNumber: text("mobile_number"),
    campusId: integer("campus_id"),
    passwordHash: text("password_hash"),
    isActive: boolean("is_active").notNull().default(true),
    // Super Admin capability (additive). A super admin is an `admin` with this
    // flag set — all existing `role === "admin"` checks still pass unchanged.
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    // Phase 7 evaluation capability. A FLAG, deliberately not a fourth
    // user_role value: adding a role would force a review of every
    // `role === "..."` check in the codebase, whereas a flag composes with the
    // three existing roles and leaves them all behaving exactly as before.
    isEvaluator: boolean("is_evaluator").notNull().default(false),
    // Per-page permission map for normal admins. NULL means FULL access
    // (DEFAULT-ALLOW) — every existing admin keeps full access automatically.
    adminPermissions: jsonb("admin_permissions"),
    provisionedVia: provisionedViaEnum("provisioned_via")
      .notNull()
      .default("manual"),
    profileCompletedAt: timestamp("profile_completed_at", {
      withTimezone: true,
    }),
    // Student Terms & Conditions consent gate (additive). Null = not accepted
    // yet; old rows stay null and are treated as "not accepted". termsVersion
    // records which version string the user agreed to (e.g. "2026-v1").
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    termsVersion: text("terms_version"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    // Login tracking (additive). lastLoginAt is set + loginCount incremented
    // each time a new session is created (any login method). Distinct from
    // lastSeenAt, which tracks last activity on any request.
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    loginCount: integer("login_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("users_campus_idx").on(t.campusId),
    index("users_role_idx").on(t.role),
    index("users_email_idx").on(t.email),
    index("users_last_seen_idx").on(t.lastSeenAt),
  ],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

// Forms SSO auth tokens (one-time use, short-lived)
export const authTokensTable = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: text("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAuthTokenSchema = createInsertSchema(authTokensTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAuthToken = z.infer<typeof insertAuthTokenSchema>;
export type AuthToken = typeof authTokensTable.$inferSelect;

// Student roster
export const rosterTable = pgTable(
  "roster",
  {
    id: serial("id").primaryKey(),
    studentId: text("student_id").notNull().unique(),
    fullName: text("full_name").notNull(),
    email: text("email"),
    campusName: text("campus_name").notNull(),
    campusId: integer("campus_id"),
    niatId: text("niat_id"),
    batchSectionName: text("batch_section_name"),
    // WhatsApp contact number (additive, nullable). Populated by admins via the
    // roster import; a null number simply means the student is skipped by any
    // WhatsApp send, never that the send fails. Stored exactly as supplied —
    // normalisation to a 12-digit 91XXXXXXXXXX happens at send time in
    // lib/whatsapp/karix.ts, so a re-import cannot corrupt what was entered.
    mobileNumber: text("mobile_number"),
    isWhitelisted: boolean("is_whitelisted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("roster_campus_idx").on(t.campusId),
    index("roster_full_name_idx").on(t.fullName),
    index("roster_email_idx").on(t.email),
    index("roster_mobile_idx").on(t.mobileNumber),
  ],
);

export const insertRosterSchema = createInsertSchema(rosterTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRoster = z.infer<typeof insertRosterSchema>;
export type Roster = typeof rosterTable.$inferSelect;

// Access Requests
export const chatbotProviderEnum = pgEnum("chatbot_provider", [
  "cloudflare",
  "cerebras",
]);

export const accessRequestStatusEnum = pgEnum("access_request_status", [
  "pending",
  "approved",
  "rejected",
]);

export const accessRequestsTable = pgTable("access_requests", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  batch: text("batch"),
  niatId: text("niat_id"),
  campusName: text("campus_name").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  userId: text("user_id"),
  campusId: integer("campus_id"),
  mobileNumber: text("mobile_number"),
  sectionName: text("section_name"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAccessRequestSchema = createInsertSchema(
  accessRequestsTable,
).omit({ id: true, createdAt: true });
export type InsertAccessRequest = z.infer<typeof insertAccessRequestSchema>;
export type AccessRequest = typeof accessRequestsTable.$inferSelect;

// Teams
export const teamsTable = pgTable(
  "teams",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    campusId: integer("campus_id").notNull(),
    leaderId: text("leader_id").notNull(),
    status: teamStatusEnum("status").notNull().default("active"),
    tagline: text("tagline"),
    photoUrl: text("photo_url"),
    inviteCode: text("invite_code").unique(),
    rejectionReason: text("rejection_reason"),
    coordinatorComment: text("coordinator_comment"),
    isHidden: boolean("is_hidden").notNull().default(false),
    isFeatured: boolean("is_featured").notNull().default(false),
    // Set true by the admin "Team name uniqueness" action for the losing teams
    // in a duplicate-name group (every team except the highest verified-revenue
    // / most-journals / oldest one). Drives the student rename popup. Cleared
    // automatically when the team is renamed.
    nameFlaggedForRename: boolean("name_flagged_for_rename")
      .notNull()
      .default(false),
    // Free-form admin note for the whole team (admin-only; shown on the admin
    // team-detail page). Distinct from coordinatorComment.
    adminNotes: text("admin_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("teams_campus_idx").on(t.campusId),
    index("teams_status_idx").on(t.status),
    index("teams_leader_idx").on(t.leaderId),
  ],
);

export const insertTeamSchema = createInsertSchema(teamsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teamsTable.$inferSelect;

// Team members
export const teamMembersTable = pgTable(
  "team_members",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull(),
    userId: text("user_id").notNull(),
    memberRole: text("member_role"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("team_members_user_unique").on(t.userId),
    index("team_members_team_idx").on(t.teamId),
  ],
);

export const insertTeamMemberSchema = createInsertSchema(teamMembersTable).omit(
  { id: true, joinedAt: true },
);
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembersTable.$inferSelect;

// Team Invitations
export const teamInvitationsTable = pgTable("team_invitations", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  inviteeId: text("invitee_id").notNull(),
  inviterId: text("inviter_id").notNull(),
  status: invitationStatusEnum("status").notNull().default("pending"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const insertTeamInvitationSchema = createInsertSchema(
  teamInvitationsTable,
).omit({ id: true, createdAt: true });
export type InsertTeamInvitation = z.infer<typeof insertTeamInvitationSchema>;
export type TeamInvitation = typeof teamInvitationsTable.$inferSelect;

// Team Join Requests
export const teamJoinRequestsTable = pgTable("team_join_requests", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  requesterId: text("requester_id").notNull(),
  status: joinRequestStatusEnum("status").notNull().default("pending"),
  message: text("message"),
  decidedById: text("decided_by_id"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const insertTeamJoinRequestSchema = createInsertSchema(
  teamJoinRequestsTable,
).omit({ id: true, createdAt: true });
export type InsertTeamJoinRequest = z.infer<typeof insertTeamJoinRequestSchema>;
export type TeamJoinRequest = typeof teamJoinRequestsTable.$inferSelect;

// Team Leave Requests
export const teamLeaveRequestsTable = pgTable("team_leave_requests", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  requesterId: text("requester_id").notNull(),
  reason: text("reason"),
  status: leaveRequestStatusEnum("status").notNull().default("pending"),
  decidedById: text("decided_by_id"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const insertTeamLeaveRequestSchema = createInsertSchema(
  teamLeaveRequestsTable,
).omit({ id: true, createdAt: true });
export type TeamLeaveRequest = typeof teamLeaveRequestsTable.$inferSelect;

// Membership requests — admin approval gate for all team membership changes.
// Each gated mutation (join-by-code, accept invite, approve join-request, leave,
// leader-remove) creates a pending row here instead of applying the change. An
// admin then approves (applies the change + email + notif) or rejects (notif).
export const membershipRequestsTable = pgTable("membership_requests", {
  id: serial("id").primaryKey(),
  type: membershipRequestTypeEnum("type").notNull(),
  status: membershipRequestStatusEnum("status").notNull().default("pending"),
  teamId: integer("team_id").notNull(),
  // The user whose membership is being added/removed.
  targetUserId: text("target_user_id").notNull(),
  // Who initiated the request (joiner, leaver, approving leader, removing leader).
  actorUserId: text("actor_user_id").notNull(),
  campusId: integer("campus_id"),
  // Source rows that must be updated when the request is approved.
  sourceInvitationId: integer("source_invitation_id"),
  sourceJoinRequestId: integer("source_join_request_id"),
  reason: text("reason"),
  // Admin decision note (shown to the requester on reject).
  decisionNote: text("decision_note"),
  decidedById: text("decided_by_id"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const insertMembershipRequestSchema = createInsertSchema(
  membershipRequestsTable,
).omit({ id: true, createdAt: true });
export type MembershipRequest = typeof membershipRequestsTable.$inferSelect;

// Projects
export const projectsTable = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    // Season this row belongs to. DEFAULT 1 keeps every pre-existing
    // (Season 1) row valid and makes any un-migrated insert path degrade to
    // Season 1 instead of failing.
    seasonId: integer("season_id").notNull().default(1),
    status: projectStatusEnum("status").notNull().default("active"),
    createdBy: text("created_by").notNull(),

    // ── Season 2 project definition (all nullable; Season 1 rows keep NULL) ──
    // Gate B: a Season 2 project may only descend from a CONVERTED lead. Null
    // means a Season 1 project, which is why the column is nullable rather
    // than defaulted — the distinction is meaningful, not missing data.
    leadId: integer("lead_id"),
    // Drives the AI price band and the revenue recognition cap.
    serviceCategory: text("service_category"),
    problemStatement: text("problem_statement"),
    solutionDescription: text("solution_description"),
    techStack: jsonb("tech_stack"),
    // Product links. Validated for reachability on save — a Drive video left
    // on "Restricted" is the commonest way a good team loses marks for no
    // reason, so the form refuses to store a broken one.
    liveProductUrl: text("live_product_url"),
    demoVideoUrl: text("demo_video_url"),
    sourceCodeUrl: text("source_code_url"),
    prototypeUrl: text("prototype_url"),
    // Test login for a gated product, so a reviewer is never locked out.
    demoCredentials: text("demo_credentials"),
    revenueType: revenueTypeEnum("revenue_type"),
    recurringFrequency: recurringFrequencyEnum("recurring_frequency"),
    // Auto-summed from payment_schedule; stored so the review queue can sort
    // and filter on it without re-aggregating.
    totalContractValue: integer("total_contract_value"),
    agreementDoc: text("agreement_doc"),
    // Free-form admin note for this specific project (admin-only; shown on the
    // admin team-detail page's project card).
    adminNotes: text("admin_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("projects_team_idx").on(t.teamId),
    index("projects_season_team_idx").on(t.seasonId, t.teamId),
    index("projects_team_status_idx").on(t.teamId, t.status),
    index("projects_active_team_idx")
      .on(t.teamId)
      .where(sql`${t.status} = 'active'`),
    index("projects_lead_idx").on(t.leadId),
  ],
);

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;

// Order Book Entries
export const orderBookEntriesTable = pgTable(
  "order_book_entries",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull(),
    teamId: integer("team_id").notNull(),
    clientName: text("client_name").notNull(),
    amount: integer("amount").notNull(),
    verifiedAmount: integer("verified_amount"),
    // Season this row belongs to. DEFAULT 1 keeps every pre-existing
    // (Season 1) row valid and makes any un-migrated insert path degrade to
    // Season 1 instead of failing.
    seasonId: integer("season_id").notNull().default(1),
    status: entryStatusEnum("status").notNull().default("verified"),
    supportingDocUrl: text("supporting_doc_url"),
    notes: text("notes"),
    adminNotes: text("admin_notes"),
    enteredBy: enteredByEnum("entered_by").notNull().default("student"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("order_book_team_idx").on(t.teamId),
    index("order_book_season_team_idx").on(t.seasonId, t.teamId),
    index("order_book_project_idx").on(t.projectId),
    index("order_book_team_status_idx").on(t.teamId, t.status),
    index("order_book_verified_team_idx")
      .on(t.teamId)
      .where(sql`${t.status} = 'verified'`),
  ],
);

export const insertOrderBookEntrySchema = createInsertSchema(
  orderBookEntriesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrderBookEntry = z.infer<typeof insertOrderBookEntrySchema>;
export type OrderBookEntry = typeof orderBookEntriesTable.$inferSelect;

// Revenue Entries
export const revenueEntriesTable = pgTable(
  "revenue_entries",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull(),
    teamId: integer("team_id").notNull(),
    clientName: text("client_name").notNull(),
    amount: integer("amount").notNull(),
    verifiedAmount: integer("verified_amount"),
    paymentDate: text("payment_date").notNull(),
    // Season this row belongs to. DEFAULT 1 keeps every pre-existing
    // (Season 1) row valid and makes any un-migrated insert path degrade to
    // Season 1 instead of failing.
    seasonId: integer("season_id").notNull().default(1),
    status: entryStatusEnum("status").notNull().default("draft"),
    brdUrl: text("brd_url"),
    testimonialUrl: text("testimonial_url"),
    adminNotes: text("admin_notes"),
    // Existing production columns — present in the live DB. Declared here
    // so drizzle-kit push doesn't propose to drop them.
    paymentProofUrl: text("payment_proof_url"),
    invoiceUrl: text("invoice_url"),
    notes: text("notes"),
    enteredBy: enteredByEnum("entered_by").notNull().default("student"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    // AI BRD auditor (Gemini) — advisory scores attached to a submitted BRD.
    // brdScore: 0..100 relevancy. uniquenessScore: 0..100 vs prior team BRDs.
    // aiAnalysisDetail: full Gemini JSON response (findings, comparison, etc.).
    // aiAnalysedAt: null until analysed; set on successful completion.
    brdScore: integer("brd_score"),
    uniquenessScore: integer("uniqueness_score"),
    aiAnalysisDetail: jsonb("ai_analysis_detail"),
    aiAnalysedAt: timestamp("ai_analysed_at", { withTimezone: true }),
    // Google Drive mirror of the BRD file (admin-triggered, manual migration —
    // see routes/admin-brd-drive.ts). brdDriveFileId != null means "already
    // migrated" so re-runs skip it. brdDriveMigrationError holds the last
    // failure so a re-run retries only failed/never-migrated rows.
    brdDriveUrl: text("brd_drive_url"),
    brdDriveFileId: text("brd_drive_file_id"),
    brdDriveMigratedAt: timestamp("brd_drive_migrated_at", {
      withTimezone: true,
    }),
    brdDriveMigrationError: text("brd_drive_migration_error"),
    // Season 2 composed BRD. A Season 2 team never uploads a document: the BRD
    // is assembled from the lead trail, so there is no file to point brdUrl at.
    // brdComposed holds the structured snapshot taken AT SUBMISSION (it must
    // not drift afterwards); brdText is the rendered prose the AI auditor and
    // the reviewer read. Both NULL on every Season 1 row, which is how the
    // reviewer UI decides which of the two shapes to render.
    brdComposed: jsonb("brd_composed"),
    brdText: text("brd_text"),
    // Phase 6 price recognition. `amount` stays the CLAIMED figure and is never
    // rewritten - the audit trail depends on it. recognisedAmount is the claim
    // after the category cap is applied; weightedAmount is what the leaderboard
    // actually counts, after the recurring multiplier.
    //
    // Both NULL on every Season 1 row. Every read coalesces back to
    // verified_amount / amount, so Season 1 needs NO backfill and its totals
    // cannot move.
    recognisedAmount: integer("recognised_amount"),
    weightedAmount: integer("weighted_amount"),
    // Which cap was applied, so a student can be told WHY their figure was
    // trimmed rather than just seeing a smaller number.
    pricingCategoryId: integer("pricing_category_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("revenue_team_idx").on(t.teamId),
    index("revenue_season_team_idx").on(t.seasonId, t.teamId),
    index("revenue_project_idx").on(t.projectId),
    index("revenue_status_idx").on(t.status),
    index("revenue_team_status_idx").on(t.teamId, t.status),
    index("revenue_verified_team_idx")
      .on(t.teamId)
      .where(sql`${t.status} = 'verified'`),
  ],
);

export const insertRevenueEntrySchema = createInsertSchema(
  revenueEntriesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRevenueEntry = z.infer<typeof insertRevenueEntrySchema>;
export type RevenueEntry = typeof revenueEntriesTable.$inferSelect;

// Milestones
export const milestonesTable = pgTable(
  "milestones",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull(),
    // Season this row belongs to. DEFAULT 1 keeps every pre-existing
    // (Season 1) row valid and makes any un-migrated insert path degrade to
    // Season 1 instead of failing.
    seasonId: integer("season_id").notNull().default(1),
    type: milestoneTypeEnum("type").notNull().default("manual"),
    title: text("title").notNull(),
    description: text("description"),
    date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
    imageUrl: text("image_url"),
    linkUrl: text("link_url"),
    isPinned: boolean("is_pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("milestones_team_idx").on(t.teamId),
    index("milestones_season_team_idx").on(t.seasonId, t.teamId),
  ],
);

export const insertMilestoneSchema = createInsertSchema(milestonesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMilestone = z.infer<typeof insertMilestoneSchema>;
export type Milestone = typeof milestonesTable.$inferSelect;

// Demo Day Applications
export const demoDayApplicationsTable = pgTable("demo_day_applications", {
  id: serial("id").primaryKey(),
  // Season this row belongs to. DEFAULT 1 keeps every pre-existing
  // (Season 1) row valid and makes any un-migrated insert path degrade to
  // Season 1 instead of failing.
  seasonId: integer("season_id").notNull().default(1),
  teamId: integer("team_id").notNull(),
  demoUrl: text("demo_url"),
  pitchDeckUrl: text("pitch_deck_url"),
  growthPlan: text("growth_plan"),
  status: demoDayStatusEnum("status").notNull().default("draft"),
  timeSlot: text("time_slot"),
  presentationOrder: integer("presentation_order"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  },
  (t) => [
    // Widened for Season 2: one application per team PER SEASON.
    unique("demo_day_applications_team_season_unique").on(t.teamId, t.seasonId),
    index("demo_day_applications_season_idx").on(t.seasonId),
  ],
);

export const insertDemoDayApplicationSchema = createInsertSchema(
  demoDayApplicationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDemoDayApplication = z.infer<
  typeof insertDemoDayApplicationSchema
>;
export type DemoDayApplication = typeof demoDayApplicationsTable.$inferSelect;

// --- New Demo Day "best project" submissions (additive, isolated) ----------
// A separate, simpler flow from demo_day_applications: ANY team can submit
// their best project to be considered for a Demo Day presentation in front of
// investors / NxtWave founders. Submitting does NOT guarantee a slot — admins
// shortlist. Kept in its own table so the legacy Demo Day application flow and
// admin page are completely untouched.
export const demoDaySubmissionStatusEnum = pgEnum(
  "demo_day_submission_status",
  ["submitted", "shortlisted", "rejected"],
);

export const demoDaySubmissionsTable = pgTable(
  "demo_day_submissions",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull(),
    // Season this row belongs to. DEFAULT 1 keeps every pre-existing
    // (Season 1) row valid and makes any un-migrated insert path degrade to
    // Season 1 instead of failing.
    seasonId: integer("season_id").notNull().default(1),
    // Optional link to an existing project the team picked as their best work.
    projectId: integer("project_id"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    // Optional external link (pitch deck / live demo / video walkthrough).
    link: text("link"),
    // Optional uploaded file (deck/one-pager PDF) via object storage.
    fileUrl: text("file_url"),
    status: demoDaySubmissionStatusEnum("status")
      .notNull()
      .default("submitted"),
    // Who created/last edited (user id) — informational.
    submittedBy: text("submitted_by").notNull(),
    // Admin review note (e.g. why shortlisted/rejected). Optional.
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // One active submission per team — re-submitting edits the same row.
    unique("demo_day_submissions_team_season_unique").on(t.teamId, t.seasonId),
    index("demo_day_submissions_status_idx").on(t.status),
    index("demo_day_submissions_season_idx").on(t.seasonId),
  ],
);

export const insertDemoDaySubmissionSchema = createInsertSchema(
  demoDaySubmissionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDemoDaySubmission = z.infer<
  typeof insertDemoDaySubmissionSchema
>;
export type DemoDaySubmission = typeof demoDaySubmissionsTable.$inferSelect;

// Notifications
export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    type: text("type").notNull().default("general"),
    isRead: boolean("is_read").notNull().default(false),
    link: text("link"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId),
    index("notifications_user_read_idx").on(t.userId, t.isRead),
  ],
);

export const insertNotificationSchema = createInsertSchema(
  notificationsTable,
).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;

// Announcements
export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  // Which season this announcement belongs to. DEFAULT 1 so every existing
  // announcement remains a Season 1 announcement and nothing moves.
  seasonId: integer("season_id").notNull().default(1),
  authorId: text("author_id").notNull(),
  target: announcementTargetEnum("target").notNull().default("all"),
  campusId: integer("campus_id"),
  teamId: integer("team_id"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  pinToDashboard: boolean("pin_to_dashboard").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertAnnouncementSchema = createInsertSchema(
  announcementsTable,
).omit({ id: true, createdAt: true });
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcementsTable.$inferSelect;

// Per-student permanent dismissals of pinned announcements.
export const announcementDismissalsTable = pgTable(
  "announcement_dismissals",
  {
    userId: text("user_id").notNull(),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcementsTable.id, { onDelete: "cascade" }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.announcementId] }),
    index("announcement_dismissals_user_idx").on(t.userId),
  ],
);

export type AnnouncementDismissal =
  typeof announcementDismissalsTable.$inferSelect;

// Programme Config
export const programmeConfigTable = pgTable("programme_config", {
  id: serial("id").primaryKey(),
  // Season this row belongs to. DEFAULT 1 keeps every pre-existing
  // (Season 1) row valid and makes any un-migrated insert path degrade to
  // Season 1 instead of failing.
  seasonId: integer("season_id").notNull().default(1).unique(),
  startDate: text("start_date").notNull().default("2025-04-15"),
  endDate: text("end_date").notNull().default("2025-07-15"),
  demoDayDate: text("demo_day_date"),
  demoEligibilityThreshold: integer("demo_eligibility_threshold")
    .notNull()
    .default(200000),
  teamMemberLimit: integer("team_member_limit").notNull().default(5),
  leaderboardFrozen: boolean("leaderboard_frozen").notNull().default(false),
  demoDayApplicationsOpen: boolean("demo_day_applications_open")
    .notNull()
    .default(false),
  demoDayApplicationDeadline: text("demo_day_application_deadline"),
  programmePhase: text("programme_phase").notNull().default("Phase 1 - Launch"),
  // Module 5 reminder service master toggles. All default ON so the
  // service behaves as it did before these toggles existed. Admin can
  // disable any channel independently from /admin/config.
  // - reminderNotificationsEnabled: in-app notifications to *students*
  // - reminderEmailsEnabled:        Brevo emails to *students*
  // - coordinatorNotificationsEnabled: in-app pings to the campus
  //   coordinator at the day-7 silence threshold. Kept separate so admin
  //   can silence students without losing coordinator visibility.
  reminderNotificationsEnabled: boolean("reminder_notifications_enabled")
    .notNull()
    .default(true),
  reminderEmailsEnabled: boolean("reminder_emails_enabled")
    .notNull()
    .default(true),
  coordinatorNotificationsEnabled: boolean("coordinator_notifications_enabled")
    .notNull()
    .default(true),
  // When true, students can edit/delete journals from past (closed) weeks.
  // When false (default), past-week journals are read-only for students;
  // admin/coordinator can always edit/delete regardless.
  allowPastWeekEdits: boolean("allow_past_week_edits").notNull().default(false),
  // When true (default), the Resources sidebar entry + /resources-library
  // route are visible to students. When false, both are hidden — admin can
  // still manage resources from /admin/resources regardless of this flag.
  resourcesEnabledForStudents: boolean("resources_enabled_for_students")
    .notNull()
    .default(true),
  chatbotProvider: chatbotProviderEnum("chatbot_provider")
    .notNull()
    .default("cloudflare"),
  // GRIT Miles ladder (array of { level, revenueTarget, miles, reward? }).
  // Null until configured — callers fall back to DEFAULT_GRIT_LEVELS.
  gritLevels: jsonb("grit_levels"),
  // Deadline (YYYY-MM-DD) after which students can no longer edit journals.
  journalEditDeadline: text("journal_edit_deadline"),
  // Master toggle for the weekly journal escalation crons (on by default).
  escalationEnabled: boolean("escalation_enabled").notNull().default(true),
  // Version toggles for the Demo Day → GRIT Miles migration. Both default
  // false so students keep the PREVIOUS Demo Day experience until an admin
  // explicitly switches them on (manager-gated rollout). Independent of
  // each other.
  // - gritMilesMenuEnabled: student sidebar label + the /demo-day page
  //   (false = "Demo Day" 3-level page, true = "GRIT Miles" ladder page).
  // - gritMilesDashboardEnabled: student home dashboard UI
  //   (false = previous Demo Day dashboard, true = new GRIT Miles dashboard).
  gritMilesMenuEnabled: boolean("grit_miles_menu_enabled")
    .notNull()
    .default(false),
  gritMilesDashboardEnabled: boolean("grit_miles_dashboard_enabled")
    .notNull()
    .default(false),
  // When true (default), the "Demo Day" entry is visible in the student
  // sidebar and the /demo-day route is reachable. When false, both are hidden
  // for students. Independent of the GRIT Miles flags above and of the admin
  // "Demo Day Submissions" item, which is never affected.
  demoDayMenuEnabled: boolean("demo_day_menu_enabled").notNull().default(true),
  // ── BRAVE Finale Submissions ──────────────────────────────────────────────
  // Master switch for the student "BRAVE Finale Submissions" menu + page.
  finaleMenuEnabled: boolean("finale_menu_enabled").notNull().default(false),
  // Minimum VERIFIED revenue (INR) a team must have earned before its leader
  // and members can see the Finale page. Admin-tunable; 200000 = ₹2 lakhs.
  finaleMinVerifiedRevenue: integer("finale_min_verified_revenue")
    .notNull()
    .default(200000),
  // When true, the upload form is replaced by a banner on the Finale page —
  // the rest of the page (content, past submissions) still renders.
  finaleSubmissionsLocked: boolean("finale_submissions_locked")
    .notNull()
    .default(false),
  finaleLockMessage: text("finale_lock_message"),
  // Admin-authored content shown in the right-hand column of the Finale page.
  finaleContent: text("finale_content"),
  // ── People's Choice Award voting ──────────────────────────────────────────
  // Master switch. Turning it on emails every eligible voter, shows the banner
  // on every student page and unhides /vote/people-choice-award.
  pcaVotingEnabled: boolean("pca_voting_enabled").notNull().default(false),
  // Verified-revenue bar a team must clear to be votable AND for its members
  // to vote. Deliberately SEPARATE from finaleMinVerifiedRevenue so moving the
  // Finale bar never silently changes who can vote.
  pcaMinVerifiedRevenue: integer("pca_min_verified_revenue")
    .notNull()
    .default(200000),
  // Projects submissions lock (admin Config toggle). When true, students can
  // no longer add order book entries, add revenue entries, or submit revenue
  // for verification (BRD uploads) — the student Projects pages show the
  // message below instead. Admins are never blocked. Default false = open.
  projectSubmissionsLocked: boolean("project_submissions_locked")
    .notNull()
    .default(false),
  // Message shown at the top of the student Projects pages while locked.
  // Null → the UI falls back to a default message.
  projectSubmissionsLockMessage: text("project_submissions_lock_message"),
  // When true (default), the "Request to submit" button is shown to team
  // leaders in the projects-lock banner while the global lock is on, letting
  // them file a request an admin reviews. When false, the button is hidden and
  // the request API is blocked — students just see the lock message.
  submissionRequestEnabled: boolean("submission_request_enabled")
    .notNull()
    .default(true),
  // When true (default), students can edit + resubmit a REJECTED revenue entry
  // ("Edit & fix" / "Resubmit for verification" on the project detail page).
  // When false, both buttons are hidden and the API blocks resubmitting a
  // rejected entry. Admins are never affected.
  rejectedResubmitEnabled: boolean("rejected_resubmit_enabled")
    .notNull()
    .default(true),
  // When true, students no longer see rank (the 1/2/3 medals + rank numbers)
  // on the leaderboard — only revenue. Admins & coordinators always see rank.
  // Default false = students see rank as before.
  hideLeaderboardRankForStudents: boolean("hide_leaderboard_rank_for_students")
    .notNull()
    .default(false),
  // Optional banner image shown at the top of the leaderboard page (e.g. the
  // finalised leaderboard graphic). Null = no image.
  leaderboardImageUrl: text("leaderboard_image_url"),
  // Leaderboard banner source: "image" (use leaderboardImageUrl) or "template"
  // (render a built-in template with the content below). Default "image".
  leaderboardBannerSource: text("leaderboard_banner_source")
    .notNull()
    .default("image"),
  // Chosen template id when source = "template" (broadcast | podium |
  // spotlight | ribbon).
  leaderboardBannerTemplate: text("leaderboard_banner_template")
    .notNull()
    .default("broadcast"),
  // Editable template content ({ eyebrow,title,subtitle,timeText,chip1,chip2 }).
  // Null → the UI falls back to DEFAULT_BANNER_CONTENT.
  leaderboardBannerContent: jsonb("leaderboard_banner_content"),
  // Per-category email kill switches (key -> boolean). Missing key / null
  // column = enabled. Managed by super admins in Config → Notifications &
  // Reminders; enforced in the api-server's sendEmail().
  emailControls: jsonb("email_controls"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ── Phase 6: pricing categories ─────────────────────────────────────────────
// A published price band per kind of work, with a recognition cap. The cap
// exists because a team can charge a friend anything they like; what the
// programme RECOGNISES is bounded by what that work is plausibly worth.
//
// Season-scoped: Season 2's catalogue must not retroactively cap Season 1.
export const pricingCategoriesTable = pgTable(
  "pricing_categories",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id").notNull().default(2),
    name: text("name").notNull(),
    description: text("description"),
    // Guidance shown to students when they price the work.
    typicalMin: integer("typical_min"),
    typicalMax: integer("typical_max"),
    // The hard ceiling on what one project in this category can contribute.
    // NULL means uncapped, which is the safe default for a category nobody has
    // set a number for yet.
    recognitionCap: integer("recognition_cap"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("pricing_categories_season_idx").on(t.seasonId),
    uniqueIndex("pricing_categories_season_name_unique").on(t.seasonId, t.name),
  ],
);

// ── Phase 6: trust score events ─────────────────────────────────────────────
// An append-only ledger. A team's score is the SUM of its events, never a
// stored mutable number - so the score can always be explained line by line,
// and recomputing it is a query rather than a migration.
export const trustScoreEventsTable = pgTable(
  "trust_score_events",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull(),
    seasonId: integer("season_id").notNull().default(2),
    kind: trustEventKindEnum("kind").notNull(),
    // The points AS AWARDED. Deliberately stored rather than re-derived from
    // the published table: changing a published value later must not silently
    // rewrite history.
    points: integer("points").notNull(),
    // Shown verbatim to the team. Required for manual_adjustment.
    reason: text("reason"),
    // What triggered it, for a clickable trail back to the evidence.
    refType: text("ref_type"),
    refId: integer("ref_id"),
    // NULL for automated awards; set for a coordinator's manual adjustment.
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("trust_score_events_team_idx").on(t.teamId),
    index("trust_score_events_season_team_idx").on(t.seasonId, t.teamId),
    // Automated awards must fire once per underlying fact. A partial unique
    // index over (team, kind, ref) makes a repeat award a database error rather
    // than a silently inflated score.
    uniqueIndex("trust_score_events_dedup")
      .on(t.seasonId, t.teamId, t.kind, t.refType, t.refId)
      .where(sql`${t.refId} IS NOT NULL`),
  ],
);

// ── Phase 7: review assignments ─────────────────────────────────────────────
// One row per (submission, evaluator). Conflict-of-interest is enforced when
// the row is created, not when the decision is made - by then the evaluator has
// already read the submission.
export const reviewAssignmentsTable = pgTable(
  "review_assignments",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id").notNull().default(2),
    // The submission under review. This is a revenue_entries row, because
    // Season 2 submissions deliberately reuse the existing queue.
    revenueEntryId: integer("revenue_entry_id").notNull(),
    teamId: integer("team_id").notNull(),
    evaluatorId: text("evaluator_id").notNull(),
    decision: reviewDecisionEnum("decision").notNull().default("pending"),
    // -- SLA. Two clocks, deliberately.
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // The original deadline. Never moved; adjustments live in pausedSeconds so
    // the original commitment stays auditable.
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    // Non-null while the clock is paused (changes_requested only).
    clockPausedAt: timestamp("clock_paused_at", { withTimezone: true }),
    // Accumulated pause. Effective deadline = sla_due_at + paused_seconds.
    pausedSeconds: integer("paused_seconds").notNull().default(0),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // Shown to the team verbatim on a rejection or a change request, so a
    // decision is never delivered without a reason.
    decisionNote: text("decision_note"),
    // The six automated signals as computed AT ASSIGNMENT, so the evaluator's
    // view and any later audit see the same numbers.
    signals: jsonb("signals"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("review_assignments_evaluator_idx").on(t.evaluatorId, t.decision),
    index("review_assignments_entry_idx").on(t.revenueEntryId),
    index("review_assignments_season_idx").on(t.seasonId, t.decision),
    // One live assignment per submission per evaluator. Re-assigning to a
    // different evaluator is allowed; assigning the same one twice is a bug.
    uniqueIndex("review_assignments_entry_evaluator_unique").on(
      t.revenueEntryId,
      t.evaluatorId,
    ),
  ],
);

// ── Phase 7: appeals ────────────────────────────────────────────────────────
// A rejected team can ask for the decision to be looked at again. Separate from
// the assignment so an appeal never overwrites the original decision - both
// must remain readable.
export const reviewAppealsTable = pgTable(
  "review_appeals",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id").notNull().default(2),
    revenueEntryId: integer("revenue_entry_id").notNull(),
    teamId: integer("team_id").notNull(),
    // The assignment being appealed, so the original decision is one join away.
    assignmentId: integer("assignment_id"),
    reason: text("reason").notNull(),
    evidence: jsonb("evidence"),
    status: appealStatusEnum("status").notNull().default("open"),
    raisedBy: text("raised_by").notNull(),
    raisedAt: timestamp("raised_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Must be someone other than the original evaluator - enforced in the route.
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    outcomeNote: text("outcome_note"),
  },
  (t) => [
    index("review_appeals_team_idx").on(t.teamId),
    index("review_appeals_status_idx").on(t.status),
    // One open appeal per submission. A team cannot stack appeals to stall a
    // decision; the partial index lets a NEW appeal be raised once the previous
    // one is closed.
    uniqueIndex("review_appeals_open_unique")
      .on(t.revenueEntryId)
      .where(sql`${t.status} = 'open'`),
  ],
);

// ── Phase 7: audit sampling ─────────────────────────────────────────────────
// A percentage of APPROVED submissions is independently re-checked. This is how
// the review process itself is measured, rather than only the students.
export const reviewAuditSamplesTable = pgTable(
  "review_audit_samples",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id").notNull().default(2),
    assignmentId: integer("assignment_id").notNull(),
    revenueEntryId: integer("revenue_entry_id").notNull(),
    sampledAt: timestamp("sampled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    auditorId: text("auditor_id"),
    // NULL until the auditor decides. true = the auditor reached the same
    // conclusion as the evaluator.
    agreed: boolean("agreed"),
    note: text("note"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("review_audit_samples_season_idx").on(t.seasonId),
    // A submission is sampled at most once.
    uniqueIndex("review_audit_samples_entry_unique").on(t.revenueEntryId),
  ],
);

export const insertProgrammeConfigSchema = createInsertSchema(
  programmeConfigTable,
).omit({ id: true, updatedAt: true });
export type InsertProgrammeConfig = z.infer<typeof insertProgrammeConfigSchema>;
export type ProgrammeConfig = typeof programmeConfigTable.$inferSelect;

// Uploaded files metadata (filename / mime / size for objects in storage)
export const uploadedFilesTable = pgTable("uploaded_files", {
  objectPath: text("object_path").primaryKey(),
  filename: text("filename").notNull(),
  size: integer("size").notNull(),
  contentType: text("content_type").notNull(),
  uploadedById: text("uploaded_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertUploadedFileSchema = createInsertSchema(
  uploadedFilesTable,
).omit({ createdAt: true });
export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;
export type UploadedFile = typeof uploadedFilesTable.$inferSelect;

// Platform Feedback (star rating + optional comments, submitted by any authenticated user)
export const feedbackTable = pgTable(
  "feedback",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    rating: integer("rating").notNull(),
    comments: text("comments"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("feedback_user_idx").on(t.userId),
    index("feedback_created_idx").on(t.createdAt),
  ],
);

export const insertFeedbackSchema = createInsertSchema(feedbackTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedbackTable.$inferSelect;

// Audit Log
export const auditLogTable = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: integer("target_id"),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_actor_idx").on(t.actorId),
    index("audit_log_created_idx").on(t.createdAt),
  ],
);

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogTable.$inferSelect;

// ============================================================================
// PROGRESS ENFORCEMENT MODULES (new — additive, no existing table modified)
// ============================================================================

// Module 2 — Weekly Progress Journal
// One journal per team per week (Monday-anchored week start).
export const weeklyJournalsTable = pgTable(
  "weekly_journals",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull(),
    // Season this row belongs to. DEFAULT 1 keeps every pre-existing
    // (Season 1) row valid and makes any un-migrated insert path degrade to
    // Season 1 instead of failing.
    seasonId: integer("season_id").notNull().default(1),
    weekStartDate: text("week_start_date").notNull(), // YYYY-MM-DD (Monday)
    weekEndDate: text("week_end_date").notNull(), // YYYY-MM-DD (Sunday)
    whatWeDid: text("what_we_did").notNull(),
    blockers: text("blockers"),
    nextWeekPlan: text("next_week_plan"),
    clientsVisited: integer("clients_visited").notNull().default(0),
    activeConversations: integer("active_conversations").notNull().default(0),
    projectsStarted: integer("projects_started").notNull().default(0),
    projectsClosed: integer("projects_closed").notNull().default(0),
    submittedBy: text("submitted_by").notNull(),
    // Role of the actor who last submitted/edited this journal
    // ('student' | 'coordinator' | 'admin'). Nullable for legacy rows.
    submittedByRole: text("submitted_by_role"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // --- AI journal analysis (additive, all nullable; populated by the
    // Gemini journal auditor — see lib/ai/analyse-journal.ts). Old rows stay
    // null until analysed; nothing else reads these so legacy flows are safe.
    aiAnalysis: jsonb("ai_analysis"), // structured extraction blob
    aiAnalysedAt: timestamp("ai_analysed_at", { withTimezone: true }),
    // Denormalized blocker triage state (AI-seeded, admin-overridable).
    blockerPriority: text("blocker_priority"), // 'high' | 'medium' | 'low' | 'none'
    blockerPriorityManual: boolean("blocker_priority_manual")
      .notNull()
      .default(false), // true once an admin overrides the AI priority
    blockerStatus: text("blocker_status").notNull().default("open"), // 'open' | 'assigned' | 'resolved'
    blockerNote: text("blocker_note"),
    blockerUpdatedBy: text("blocker_updated_by"),
    blockerUpdatedAt: timestamp("blocker_updated_at", { withTimezone: true }),
    // --- Optional images attached to this journal entry (additive, nullable).
    // Array of uploaded image URLs (object storage). Used by students to add
    // photos (e.g. a client/facility visit) and surfaced to admins; also fed
    // to the reel generator. Old rows stay null. JPG/PNG/etc., optional.
    images: jsonb("images"), // string[] of image URLs
    // --- Per-journal reel scan (additive, all nullable; populated by the
    // Gemini reel auditor — see lib/ai/analyse-journal-reel.ts). Decides, using
    // this team's previous journals as context, whether THIS entry is worthy of
    // an Instagram-reel and, if so, stores a single ready-to-shoot script.
    // Nothing legacy reads these, so existing journal flows are untouched.
    reelWorthy: boolean("reel_worthy"), // null = not yet scanned
    reelBucket: text("reel_bucket"), // 'STORY' | 'INFORMATIVE' | 'PAIN POINT' | 'STUDENT QUESTION'
    reelScript: text("reel_script"), // the generated script (null when not worthy)
    reelReason: text("reel_reason"), // short rationale for the worthy/not decision
    reelAnalysedAt: timestamp("reel_analysed_at", { withTimezone: true }),
  },
  (t) => [
    unique("weekly_journals_team_week_unique").on(t.teamId, t.weekStartDate),
    index("weekly_journals_team_idx").on(t.teamId),
    index("weekly_journals_season_team_idx").on(t.seasonId, t.teamId),
    index("weekly_journals_week_idx").on(t.weekStartDate),
    index("weekly_journals_blocker_priority_idx").on(t.blockerPriority),
  ],
);

export const insertWeeklyJournalSchema = createInsertSchema(
  weeklyJournalsTable,
).omit({ id: true, submittedAt: true });
export type InsertWeeklyJournal = z.infer<typeof insertWeeklyJournalSchema>;
export type WeeklyJournal = typeof weeklyJournalsTable.$inferSelect;

// Module 2 (extension) — Programme Weeks (admin-controlled toggles)
// Auto-generated as strict 7-day chunks anchored to programme_config.startDate.
// Each week has an isOpen toggle. Cron auto-flips isOpen=true when the
// week's startDate arrives (unless admin already manually overrode it).
export const programmeWeeksTable = pgTable(
  "programme_weeks",
  {
    id: serial("id").primaryKey(),
    // Season this row belongs to. DEFAULT 1 keeps every pre-existing
    // (Season 1) row valid and makes any un-migrated insert path degrade to
    // Season 1 instead of failing.
    seasonId: integer("season_id").notNull().default(1),
    weekNumber: integer("week_number").notNull(),
    startDate: text("start_date").notNull(), // YYYY-MM-DD inclusive
    endDate: text("end_date").notNull(), // YYYY-MM-DD inclusive
    isOpen: boolean("is_open").notNull().default(false),
    manualOverride: boolean("manual_override").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // Widened for Season 2: week numbers repeat per season, so "week 1"
    // must be able to exist once per season rather than once overall.
    unique("programme_weeks_season_week_unique").on(t.seasonId, t.weekNumber),
    index("programme_weeks_start_date_idx").on(t.startDate),
  ],
);

export const insertProgrammeWeekSchema = createInsertSchema(
  programmeWeeksTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProgrammeWeek = z.infer<typeof insertProgrammeWeekSchema>;
export type ProgrammeWeek = typeof programmeWeeksTable.$inferSelect;

// Module 5 — Reminder log (de-dup tracking for cron-sent reminders)
export const reminderTypeEnum = pgEnum("reminder_type", [
  "silence_5d",
  "silence_7d",
  "journal_due",
  "journal_overdue",
]);

export const reminderChannelEnum = pgEnum("reminder_channel", [
  "notification",
  "email",
]);

export const reminderLogTable = pgTable(
  "reminder_log",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id"),
    userId: text("user_id"),
    reminderType: reminderTypeEnum("reminder_type").notNull(),
    channel: reminderChannelEnum("channel").notNull(),
    // The programme-week this reminder belongs to (YYYY-MM-DD of week start).
    // Nullable so legacy rows from before week-scoped dedup don't break.
    // Cron uses (teamId, userId, reminderType, weekStartDate) as the dedup
    // key — one Day-5 + one Day-7 per team-member-week, max.
    weekStartDate: text("week_start_date"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reminder_log_team_idx").on(t.teamId),
    index("reminder_log_user_idx").on(t.userId),
    index("reminder_log_sent_at_idx").on(t.sentAt),
    index("reminder_log_week_idx").on(t.weekStartDate),
  ],
);

export const insertReminderLogSchema = createInsertSchema(
  reminderLogTable,
).omit({ id: true, sentAt: true });
export type InsertReminderLog = z.infer<typeof insertReminderLogSchema>;
export type ReminderLog = typeof reminderLogTable.$inferSelect;

// ============================================================================
// RESOURCES (admin-curated reading list — projects/solutions docs)
// ============================================================================
// Each row is a resource shown to students (read-only) and managed by admins
// (full CRUD). `docUrl` is a Google Doc URL that opens in a new tab when the
// "Open" button is clicked. Public landing page surfaces a preview of these.
export const resourcesTable = pgTable(
  "resources",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    docUrl: text("doc_url").notNull(),
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("resources_created_at_idx").on(t.createdAt)],
);

export const insertResourceSchema = createInsertSchema(resourcesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertResource = z.infer<typeof insertResourceSchema>;
export type Resource = typeof resourcesTable.$inferSelect;

// ============================================================================
// ADMIN OVERDUE NOTIFICATION SUBSCRIBERS (additive)
// ============================================================================
// Email subscribers for daily digest of overdue review-queue items.
export const overdueNotificationSubscribersTable = pgTable(
  "overdue_notification_subscribers",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    isActive: boolean("is_active").notNull().default(true),
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("overdue_notification_subscribers_email_unique").on(t.email),
    index("overdue_notification_subscribers_active_idx").on(t.isActive),
  ],
);

export const insertOverdueNotificationSubscriberSchema = createInsertSchema(
  overdueNotificationSubscribersTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOverdueNotificationSubscriber = z.infer<
  typeof insertOverdueNotificationSubscriberSchema
>;
export type OverdueNotificationSubscriber =
  typeof overdueNotificationSubscribersTable.$inferSelect;

// AI BRD Analysis History — append-only log of every Gemini run for an
// entry. The latest snapshot still lives on revenue_entries; this table
// preserves the full history so admins can audit past analyses.
export const brdAnalysisHistoryTable = pgTable(
  "brd_analysis_history",
  {
    id: serial("id").primaryKey(),
    revenueEntryId: integer("revenue_entry_id").notNull(),
    brdScore: integer("brd_score"),
    uniquenessScore: integer("uniqueness_score"),
    analysisJson: jsonb("analysis_json"),
    analysedAt: timestamp("analysed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("brd_analysis_history_entry_idx").on(t.revenueEntryId),
    index("brd_analysis_history_analysed_at_idx").on(t.analysedAt),
  ],
);

export type BrdAnalysisHistory = typeof brdAnalysisHistoryTable.$inferSelect;

// ---------------------------------------------------------------------------
// Coordinator Tags — admin-managed functional tags for campus coordinators
// (e.g. "Success Coach", "COS"). Many-to-many with users via the join table.
// ---------------------------------------------------------------------------
export const coordinatorTagsTable = pgTable("coordinator_tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type CoordinatorTag = typeof coordinatorTagsTable.$inferSelect;

// Per-coordinator tag assignments. Composite PK doubles as the dedup key for
// onConflictDoNothing. Tag deletes cascade to their assignments.
export const userCoordinatorTagsTable = pgTable(
  "user_coordinator_tags",
  {
    userId: text("user_id").notNull(),
    tagId: integer("tag_id")
      .notNull()
      .references(() => coordinatorTagsTable.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tagId] }),
    index("user_coordinator_tags_user_idx").on(t.userId),
    index("user_coordinator_tags_tag_idx").on(t.tagId),
  ],
);

export type UserCoordinatorTag = typeof userCoordinatorTagsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Journal reporting — persisted login-gated report snapshots + escalation log.
// Written by the escalation / weekly-report crons; read by the Reports pages.
// ---------------------------------------------------------------------------
export const journalReportLinksTable = pgTable(
  "journal_report_links",
  {
    id: serial("id").primaryKey(),
    token: text("token").notNull().unique(),
    scope: text("scope").notNull(), // 'campus' | 'admin'
    kind: text("kind").notNull(),
    campusId: integer("campus_id"),
    campusName: text("campus_name"),
    weekId: integer("week_id").notNull(),
    weekLabel: text("week_label").notNull(),
    title: text("title").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("journal_report_links_created_idx").on(t.createdAt),
    index("journal_report_links_week_idx").on(t.weekId),
  ],
);

export type JournalReportLink = typeof journalReportLinksTable.$inferSelect;

// One row per (campus, week, level) escalation email batch that was sent, so
// re-runs never double-send. campusId is null for admin-level sends.
export const journalEscalationLogTable = pgTable(
  "journal_escalation_log",
  {
    id: serial("id").primaryKey(),
    campusId: integer("campus_id"),
    weekId: integer("week_id").notNull(),
    level: text("level").notNull(), // 'success_coach' | 'cos' | 'admin'
    recipientCount: integer("recipient_count").notNull().default(0),
    reportToken: text("report_token"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("journal_escalation_log_campus_week_level_unique").on(
      t.campusId,
      t.weekId,
      t.level,
    ),
    index("journal_escalation_log_week_idx").on(t.weekId),
  ],
);

export type JournalEscalationLog =
  typeof journalEscalationLogTable.$inferSelect;

// Reel Script Library (additive, isolated). Holds both the imported reference
// scripts and the ones generated daily by the Gemini cron from weekly journals.
// `bucket` is the script category (e.g. STORY | INFORMATIVE | PAIN POINT |
// STUDENT QUESTION). `dedupeKey` is a normalized form of the script used to
// avoid storing duplicates. `source` distinguishes 'imported' vs 'generated'.
export const reelScriptsTable = pgTable(
  "reel_scripts",
  {
    id: serial("id").primaryKey(),
    bucket: text("bucket").notNull(),
    script: text("script").notNull(),
    source: text("source").notNull().default("imported"), // 'imported' | 'generated'
    dedupeKey: text("dedupe_key"),
    // Generation provenance (nullable; only set for source = 'generated').
    sourceJournalId: integer("source_journal_id"),
    teamId: integer("team_id"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reel_scripts_created_idx").on(t.createdAt),
    index("reel_scripts_bucket_idx").on(t.bucket),
    // Unique on the normalized dedupe key so duplicates are rejected at the DB
    // level — the in-memory scan only looked at the newest 500 rows, so an old
    // duplicate could slip back in once the library grew past that. dedupeKey is
    // nullable; Postgres treats NULLs as distinct, so imported/legacy rows that
    // never set a key are unaffected.
    uniqueIndex("reel_scripts_dedupe_key_unique").on(t.dedupeKey),
  ],
);

export type ReelScript = typeof reelScriptsTable.$inferSelect;

// Admin-managed student pop-ups (additive, isolated). Admins create templates
// on the Config page; enabled templates are shown to students one at a time
// until acknowledged. This is entirely separate from the live Terms &
// Conditions gate (users.terms_accepted_at) — it neither reads nor writes it.
export const popupTemplatesTable = pgTable(
  "popup_templates",
  {
    id: serial("id").primaryKey(),
    // Which season this pop-up belongs to. DEFAULT 1 so every pop-up that
    // existed before seasons stays exactly where it was — a Season 1 pop-up.
    seasonId: integer("season_id").notNull().default(1),
    name: text("name").notNull(),
    message: text("message").notNull(),
    // require_checkbox = true → a confirmation checkbox must be ticked before
    // the Confirm button enables. false → just the message + Confirm button.
    requireCheckbox: boolean("require_checkbox").notNull().default(false),
    // Optional custom label for the checkbox (falls back to a default in UI).
    checkboxLabel: text("checkbox_label"),
    // enabled = shown to all students until each acknowledges it.
    enabled: boolean("enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("popup_templates_enabled_idx").on(t.enabled)],
);

export type PopupTemplate = typeof popupTemplatesTable.$inferSelect;

// One row per (student, popup) written when the student confirms. Its presence
// means the student has acknowledged that popup, so it is never shown again.
export const popupAcknowledgementsTable = pgTable(
  "popup_acknowledgements",
  {
    id: serial("id").primaryKey(),
    popupId: integer("popup_id").notNull(),
    userId: text("user_id").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("popup_ack_user_popup_unique").on(t.popupId, t.userId),
    index("popup_ack_user_idx").on(t.userId),
  ],
);

export type PopupAcknowledgement =
  typeof popupAcknowledgementsTable.$inferSelect;

// Admin-managed catalog of common revenue rejection reasons (additive,
// isolated). CRUD lives on the Config page; the review-queue reject dialogs
// show these as tap-to-insert chips instead of a hardcoded list. Seeded once
// at server bootstrap with the two previously hardcoded reasons.
export const rejectionReasonsTable = pgTable(
  "rejection_reasons",
  {
    id: serial("id").primaryKey(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("rejection_reasons_sort_idx").on(t.sortOrder)],
);

export type RejectionReason = typeof rejectionReasonsTable.$inferSelect;

// Per-team exemption from the global "Projects Submissions Lock" (additive,
// isolated). When the global lock is ON, EVERY team is blocked from adding
// revenue / order-book entries and submitting BRDs — EXCEPT teams that have a
// row here. One row per team = that team may still submit while locked.
// Toggling a team "off" deletes its row. When the global lock is OFF this
// table is irrelevant (everyone can submit).
export const teamSubmissionExemptionsTable = pgTable(
  "team_submission_exemptions",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull(),
    enabledBy: text("enabled_by"),
    enabledAt: timestamp("enabled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("team_submission_exemptions_team_unique").on(t.teamId),
    index("team_submission_exemptions_enabled_at_idx").on(t.enabledAt),
  ],
);

export type TeamSubmissionExemption =
  typeof teamSubmissionExemptionsTable.$inferSelect;

// Student "Request to submit" — filed by a team leader from the locked
// Projects page when the global submissions lock is on and their team isn't
// exempted. Admins review these in the "Teams Submissions" Config page and the
// Communications → Submission Requests page, and can enable that team (which
// writes a team_submission_exemptions row). One PENDING request per team.
export const submissionAccessRequestsTable = pgTable(
  "submission_access_requests",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull(),
    requestedBy: text("requested_by").notNull(),
    purpose: text("purpose"),
    status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // Admin's reason when a request is rejected (emailed to the team).
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("submission_access_requests_team_idx").on(t.teamId),
    index("submission_access_requests_status_idx").on(t.status),
    index("submission_access_requests_created_idx").on(t.createdAt),
  ],
);

export type SubmissionAccessRequest =
  typeof submissionAccessRequestsTable.$inferSelect;

// BRAVE Finale Submissions — pptx decks uploaded by a team leader from the
// student "BRAVE Finale Submissions" page. A team may submit more than once
// (each upload is its own row); the admin list shows the latest per team, and
// every member of the team can see all of their team's rows.
//
// Files are uploaded to object storage first (presigned URL, same flow as
// BRDs) and stored here as an object path. A background/manual mirror pushes
// them to Google Drive and fills driveUrl/driveFileId — same pattern as the
// BRD Drive migration.
export const finaleSubmissionsTable = pgTable(
  "finale_submissions",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull(),
    submittedBy: text("submitted_by").notNull(),
    // Season this row belongs to. DEFAULT 1 keeps every pre-existing
    // (Season 1) row valid and makes any un-migrated insert path degrade to
    // Season 1 instead of failing.
    seasonId: integer("season_id").notNull().default(1),
    // Object-storage path (/objects/<id>) of the uploaded .pptx.
    fileUrl: text("file_url").notNull(),
    fileName: text("file_name"),
    // Free-text category the team files the deck under.
    category: text("category"),
    remarks: text("remarks"),
    // Google Drive mirror of the pptx (shareable link used by the export).
    driveUrl: text("drive_url"),
    driveFileId: text("drive_file_id"),
    driveSyncedAt: timestamp("drive_synced_at", { withTimezone: true }),
    driveError: text("drive_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Admin review of the deck: 'pending' until an admin verifies or rejects
    // it. Either decision emails the team, and either can be changed later —
    // a verified deck can still be rejected and vice versa.
    reviewStatus: text("review_status").notNull().default("pending"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    // Set when the deck or remarks are edited (by the leader or an admin).
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: text("updated_by"),
    // Soft delete: rows are never physically removed, so a mistaken delete is
    // recoverable and the mirrored Drive file is never orphaned. Every read
    // path filters on `deletedAt IS NULL`.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by"),
  },
  (t) => [
    index("finale_submissions_team_idx").on(t.teamId),
    index("finale_submissions_season_team_idx").on(t.seasonId, t.teamId),
    index("finale_submissions_created_at_idx").on(t.createdAt),
    index("finale_submissions_deleted_at_idx").on(t.deletedAt),
  ],
);

export type FinaleSubmission = typeof finaleSubmissionsTable.$inferSelect;

// People's Choice Award votes. One row per VOTER — the unique index on
// voterId is what enforces "one vote per person" at the database level, not
// just in the route.
//
// A voter must belong to a team above the PCA revenue bar, and may not vote
// for their own team (the API never even lists it). voterRole is snapshotted
// at vote time so the admin's Leader/Member tag stays accurate even if the
// team's leadership changes afterwards.
export const pcaVotesTable = pgTable(
  "pca_votes",
  {
    id: serial("id").primaryKey(),
    voterId: text("voter_id").notNull(),
    // The voter's OWN team — used for the admin tag and the self-vote check.
    // Season this row belongs to. DEFAULT 1 keeps every pre-existing
    // (Season 1) row valid and makes any un-migrated insert path degrade to
    // Season 1 instead of failing.
    seasonId: integer("season_id").notNull().default(1),
    voterTeamId: integer("voter_team_id").notNull(),
    voterRole: text("voter_role").notNull(), // 'leader' | 'member'
    // The team they voted FOR. Never equal to voterTeamId.
    votedTeamId: integer("voted_team_id").notNull(),
    comments: text("comments"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Set when an admin edits the vote (students vote once and cannot change).
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: text("updated_by"),
  },
  (t) => [
    unique("pca_votes_voter_season_unique").on(t.voterId, t.seasonId),
    index("pca_votes_voted_team_idx").on(t.votedTeamId),
    index("pca_votes_season_idx").on(t.seasonId),
    index("pca_votes_voter_team_idx").on(t.voterTeamId),
    index("pca_votes_created_idx").on(t.createdAt),
  ],
);

export type PcaVote = typeof pcaVotesTable.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// SEASONS (additive, isolated — Season 1 / Season 2 coexistence)
//
// A season is a single run of the BRAVE programme. Season 1 (id 1) is the
// completed, read-only archive; Season 2 (id 2) is the live season. Identity
// data (users, roster, campuses, teams, team_members, invite codes) is SHARED
// across seasons and is deliberately NOT season-scoped — the same teams carry
// forward and nobody re-registers. Only *activity* carries a season_id.
//
// Exactly one row should have isActive = true. `resolveSeason()` in the
// api-server reads it; every scoped table defaults season_id to 1 so any write
// path that has not been updated still produces a valid Season 1 row rather
// than failing.
//
// The three allow* override flags live here rather than on programme_config so
// the read-only guard can decide with the single season row it already loaded.
// ─────────────────────────────────────────────────────────────────────────────
export const seasonsTable = pgTable(
  "seasons",
  {
    id: serial("id").primaryKey(),
    // Display name, e.g. "BRAVE Season 2".
    name: text("name").notNull(),
    // Short badge label shown in the sidebar, e.g. "1.0" / "2.0".
    slug: text("slug").notNull(),
    startDate: text("start_date"), // YYYY-MM-DD
    endDate: text("end_date"), // YYYY-MM-DD
    weekCount: integer("week_count").notNull().default(12),
    // Exactly one season is active. New activity is written against it.
    isActive: boolean("is_active").notNull().default(false),
    // When true, student write paths are blocked for this season unless the
    // matching allow* override below is switched on by a super admin.
    isReadOnly: boolean("is_read_only").notNull().default(false),
    // Per-capability archive overrides. All default false = fully read-only.
    // Flipping any of these is audit-logged by the route that changes it.
    allowJournalWrites: boolean("allow_journal_writes").notNull().default(false),
    allowRevenueWrites: boolean("allow_revenue_writes").notNull().default(false),
    allowProjectWrites: boolean("allow_project_writes").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("seasons_slug_unique").on(t.slug),
    index("seasons_active_idx").on(t.isActive),
  ],
);

export const insertSeasonSchema = createInsertSchema(seasonsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSeason = z.infer<typeof insertSeasonSchema>;
export type Season = typeof seasonsTable.$inferSelect;

// Stable ids. Season 1 is the archive; Season 2 is the live season. These are
// the values the `season_id` DEFAULT and the bootstrap seed rely on.
export const SEASON_1_ID = 1;
export const SEASON_2_ID = 2;

// ═════════════════════════════════════════════════════════════════════════════
// SEASON 2 LEAD PIPELINE (additive, isolated — Season 1 never reads any of it)
//
// The structural change of Season 2: a revenue claim must descend from a
// traceable relationship. Nothing here exists in Season 1, so every table
// carries season_id and every Season 1 code path is untouched.
//
//   Lead  ──Gate A──>  Qualified/Converted  ──Gate B──>  Project
//         3 dated interactions                only from a Converted lead
//         spanning 7+ days
//
//   Project ──> phases + payment schedule ──> payments ──Gate C──> BRD
//
// The BRD is COMPOSED from these rows rather than uploaded, which is what
// removes the fabrication surface: it cannot contain anything that was not
// recorded as it happened.
// ═════════════════════════════════════════════════════════════════════════════










// ── leads ───────────────────────────────────────────────────────────────────
// 17 student-supplied fields (9 mandatory) plus derived state. Filled the day
// the student meets someone, ideally at the client's premises.
export const leadsTable = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    teamId: integer("team_id").notNull(),
    seasonId: integer("season_id").notNull().default(2),

    // -- how they met (asked FIRST, because it decides related-party status)
    source: leadSourceEnum("source").notNull(),
    // Required when source = referral.
    referrerName: text("referrer_name"),
    // Required when source = known_contact.
    relationshipNote: text("relationship_note"),

    // -- who the client is
    businessName: text("business_name").notNull(),
    ownerName: text("owner_name").notNull(),
    // Primary dedup key across the whole programme. Stored as given; the
    // normalised form lives on client_registry for cross-team matching.
    phone: text("phone").notNull(),
    altPhone: text("alt_phone"),
    businessCategory: businessCategoryEnum("business_category").notNull(),
    city: text("city").notNull(),
    areaLocality: text("area_locality"),
    // "Use my location" at the client's premises. Strongest available evidence
    // that the student was physically there, and impossible to fake from a
    // desk — which is why the mobile capture flow exists.
    geoLat: text("geo_lat"),
    geoLng: text("geo_lng"),

    // -- first meeting
    firstMeetingDate: text("first_meeting_date").notNull(), // YYYY-MM-DD
    meetingMode: meetingModeEnum("meeting_mode").notNull(),

    // -- what was said (voice-to-text on the client)
    conversationNote: text("conversation_note").notNull(),
    painPoint: text("pain_point"),
    estimatedValue: integer("estimated_value"),

    // -- evidence: photo with client, visiting card, shopfront, screenshot
    evidence: jsonb("evidence"),

    // -- derived / system-owned
    stage: leadStageEnum("stage").notNull().default("new"),
    // Mirrors source ∈ {referral, known_contact}. Denormalised so the fraud
    // console can filter on it without re-deriving.
    isRelatedParty: boolean("is_related_party").notNull().default(false),
    // 0-100, recomputed on every interaction. Gate C requires Moderate+.
    trailStrength: integer("trail_strength").notNull().default(0),
    // Drives the 10/21/30-day nudge, escalation and dormancy crons.
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    nextActionDate: text("next_action_date"), // YYYY-MM-DD
    // Nudge ladder position: 0 = none sent, 10 = student nudged,
    // 21 = coordinator escalated. Stored so the daily sweep is idempotent —
    // without it every run would re-notify the same silent lead.
    lastNudgeLevel: integer("last_nudge_level").notNull().default(0),
    lastNudgeAt: timestamp("last_nudge_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("leads_team_idx").on(t.teamId),
    index("leads_season_team_idx").on(t.seasonId, t.teamId),
    index("leads_stage_idx").on(t.stage),
    // The cross-team duplicate-client fraud signal.
    index("leads_phone_idx").on(t.phone),
    index("leads_related_party_idx").on(t.isRelatedParty),
    // Cron sweeps order by silence.
    index("leads_last_contact_idx").on(t.lastContactAt),
  ],
);

export const insertLeadSchema = createInsertSchema(leadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;

// ── lead_interactions ───────────────────────────────────────────────────────
// The dated trail. This is what later composes the BRD, and what Gate A counts.
export const leadInteractionsTable = pgTable(
  "lead_interactions",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id").notNull(),
    // Denormalised so Gate A and the coordinator oversight table can filter by
    // team without joining leads on every query.
    teamId: integer("team_id").notNull(),
    seasonId: integer("season_id").notNull().default(2),

    // When the contact actually happened.
    interactionDate: text("interaction_date").notNull(), // YYYY-MM-DD
    interactionType: interactionTypeEnum("interaction_type").notNull(),
    summary: text("summary").notNull(),
    outcome: interactionOutcomeEnum("outcome").notNull(),
    // Present when outcome = objection. Feeds mentor coaching topics.
    objectionNote: text("objection_note"),
    nextActionDate: text("next_action_date"), // YYYY-MM-DD
    // Screenshot / photo / quotation. An entry WITH evidence fills the trail
    // dot solid and counts for more in trail strength.
    attachments: jsonb("attachments"),
    // Optional stage move recorded with this interaction.
    stageChange: leadStageEnum("stage_change"),

    // When the row was WRITTEN, as opposed to when the contact happened. The
    // gap between the two is the backdating signal, so both are kept.
    loggedAt: timestamp("logged_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    loggedBy: text("logged_by").notNull(),
  },
  (t) => [
    index("lead_interactions_lead_idx").on(t.leadId),
    index("lead_interactions_team_idx").on(t.teamId),
    index("lead_interactions_season_team_idx").on(t.seasonId, t.teamId),
    index("lead_interactions_date_idx").on(t.interactionDate),
  ],
);

export const insertLeadInteractionSchema = createInsertSchema(
  leadInteractionsTable,
).omit({ id: true, loggedAt: true });
export type InsertLeadInteraction = z.infer<typeof insertLeadInteractionSchema>;
export type LeadInteraction = typeof leadInteractionsTable.$inferSelect;

// ── project_phases ──────────────────────────────────────────────────────────
// Phase-wise delivery plan. Mandatory in Season 2 (minimum 2 phases) — it was
// the commonest gap in Season 1 BRDs.
export const projectPhasesTable = pgTable(
  "project_phases",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    name: text("name").notNull(),
    deliverables: text("deliverables"),
    startDate: text("start_date"), // YYYY-MM-DD
    endDate: text("end_date"), // YYYY-MM-DD
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("project_phases_project_idx").on(t.projectId, t.sortOrder)],
);

export type ProjectPhase = typeof projectPhasesTable.$inferSelect;

// ── payment_schedule ────────────────────────────────────────────────────────
// Phase-wise PAYMENT plan, the planned counterpart to `payments`. Every row
// maps to a phase, so a schedule can never describe money for work that was
// never scoped.
export const paymentScheduleTable = pgTable(
  "payment_schedule",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull(),
    phaseId: integer("phase_id").notNull(),
    amount: integer("amount").notNull(),
    dueDate: text("due_date"), // YYYY-MM-DD
    revenueType: revenueTypeEnum("revenue_type").notNull().default("one_time"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("payment_schedule_project_idx").on(t.projectId),
    index("payment_schedule_phase_idx").on(t.phaseId),
  ],
);

export type PaymentScheduleRow = typeof paymentScheduleTable.$inferSelect;

// ── payments ────────────────────────────────────────────────────────────────
// Money actually received, recorded against a specific PHASE rather than the
// project as a whole. Partial delivery is normal and must be recordable
// without penalty — honestly logging 2 of 4 phases should score better than
// claiming 4 with no evidence.
export const paymentsTable = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id").notNull(),
    phaseId: integer("phase_id").notNull(),
    teamId: integer("team_id").notNull(),
    seasonId: integer("season_id").notNull().default(2),

    amountReceived: integer("amount_received").notNull(),
    paymentDate: text("payment_date").notNull(), // YYYY-MM-DD
    paymentMode: paymentModeEnum("payment_mode").notNull(),
    // UTR / reference. Mandatory for everything except cash — enforced in the
    // route, not the column, so a legitimate cash payment is still recordable.
    transactionRef: text("transaction_ref"),
    paymentProof: text("payment_proof").notNull(),
    invoiceDoc: text("invoice_doc").notNull(),
    deliveryProof: jsonb("delivery_proof"),

    // Set by the automated post-delivery NPS call, never by the student. Kept
    // read-only in the UI for exactly that reason.
    clientConfirmed: boolean("client_confirmed").notNull().default(false),
    clientConfirmedAt: timestamp("client_confirmed_at", { withTimezone: true }),

    recordedBy: text("recorded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("payments_project_idx").on(t.projectId),
    index("payments_phase_idx").on(t.phaseId),
    index("payments_season_team_idx").on(t.seasonId, t.teamId),
    // The duplicate-UTR fraud check cannot work without this. Partial index so
    // cash payments (no reference) are exempt rather than colliding on NULL.
    uniqueIndex("payments_transaction_ref_unique")
      .on(t.transactionRef)
      .where(sql`${t.transactionRef} IS NOT NULL`),
  ],
);

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;

// ── client_registry ─────────────────────────────────────────────────────────
// One row per real SMB across the whole programme, populated from lead capture.
// Two jobs: the cross-team duplicate-client fraud signal, and the record the
// automated satisfaction call writes back to.
export const clientRegistryTable = pgTable(
  "client_registry",
  {
    id: serial("id").primaryKey(),
    // Digits only, country code stripped — so "+91 98490 12345" and
    // "9849012345" collide as they should.
    phoneNormalised: text("phone_normalised").notNull(),
    businessName: text("business_name").notNull(),
    ownerName: text("owner_name"),
    businessCategory: businessCategoryEnum("business_category"),
    city: text("city"),

    // Verification by the automated call.
    verifiedByCall: boolean("verified_by_call").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    callTranscript: text("call_transcript"),
    npsScore: integer("nps_score"),
    npsComment: text("nps_comment"),
    unreachable: boolean("unreachable").notNull().default(false),

    // Raised when the client disputes delivery, or the student reports
    // non-payment. Routed to the Pod for safeguarding.
    disputeOpen: boolean("dispute_open").notNull().default(false),
    disputeNote: text("dispute_note"),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // One registry row per real business. The whole dedup signal rests on this.
    uniqueIndex("client_registry_phone_unique").on(t.phoneNormalised),
    index("client_registry_dispute_idx").on(t.disputeOpen),
  ],
);

export type ClientRegistryEntry = typeof clientRegistryTable.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp (additive, isolated — Karix RCM).
//
// Two tables, both new and unread by anything that existed before. Deleting
// this block means dropping routes/whatsapp.ts and its one mount line.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Templates approved in the Karix/Konverse console.
 *
 * This table exists because Karix exposes NO API for listing the templates an
 * account has registered — verified against both of their published Postman
 * collections (190 + 46 endpoints, none of them a template list). So an admin
 * records each approved template here once and the dashboard sends against it.
 *
 * `templateId` must match the template NAME in Konverse exactly. A mismatch is
 * Karix status code 210 ("Invalid HSM Data") at send time, which is why the
 * send path surfaces that code's meaning rather than the raw number.
 */
export const whatsappTemplatesTable = pgTable(
  "whatsapp_templates",
  {
    id: serial("id").primaryKey(),
    /** Template name exactly as registered in Konverse. */
    templateId: text("template_id").notNull(),
    /** Human label shown in the admin picker. */
    displayName: text("display_name").notNull(),
    /** marketing | utility | authentication — mirrors Meta's categories. */
    category: text("category").notNull().default("utility"),
    language: text("language").notNull().default("en"),
    /** How many {{n}} placeholders the body carries. */
    variableCount: integer("variable_count").notNull().default(0),
    /** Optional per-variable labels, so the send form can name its inputs. */
    variableLabels: jsonb("variable_labels").$type<string[]>(),
    /** Body text copied from Konverse, for the preview. */
    sampleBody: text("sample_body"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("whatsapp_templates_template_id_unique").on(t.templateId)],
);

export type WhatsappTemplate = typeof whatsappTemplatesTable.$inferSelect;

/**
 * One row per send ATTEMPT per recipient.
 *
 * WhatsApp has no unsend. If a broadcast goes to the wrong audience, this table
 * is the only way to reconstruct who was messaged, with what, and by whom — so
 * a row is written for every recipient regardless of outcome, including
 * failures and skips.
 */
export const whatsappSendsTable = pgTable(
  "whatsapp_sends",
  {
    id: serial("id").primaryKey(),
    /** Groups every recipient of one broadcast. */
    batchId: text("batch_id").notNull(),
    templateId: text("template_id").notNull(),
    recipientPhone: text("recipient_phone").notNull(),
    recipientUserId: text("recipient_user_id"),
    recipientName: text("recipient_name"),
    recipientRole: text("recipient_role"),
    campusId: integer("campus_id"),
    parameterValues: jsonb("parameter_values"),
    /** pending | sent | failed | skipped */
    status: text("status").notNull().default("pending"),
    /** Karix statusCode, kept as TEXT because their API returns it as a string. */
    statusCode: text("status_code"),
    statusDesc: text("status_desc"),
    /** Karix `mid`, for correlating delivery webhooks later. */
    messageId: text("message_id"),
    seasonId: integer("season_id").notNull().default(1),
    sentBy: text("sent_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("whatsapp_sends_batch_idx").on(t.batchId),
    index("whatsapp_sends_created_idx").on(t.createdAt),
    index("whatsapp_sends_phone_idx").on(t.recipientPhone),
  ],
);

export type WhatsappSend = typeof whatsappSendsTable.$inferSelect;
