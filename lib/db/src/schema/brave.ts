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
    campusId: integer("campus_id"),
    passwordHash: text("password_hash"),
    isActive: boolean("is_active").notNull().default(true),
    // Super Admin capability (additive). A super admin is an `admin` with this
    // flag set — all existing `role === "admin"` checks still pass unchanged.
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
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
    isWhitelisted: boolean("is_whitelisted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("roster_campus_idx").on(t.campusId),
    index("roster_full_name_idx").on(t.fullName),
    index("roster_email_idx").on(t.email),
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
    status: projectStatusEnum("status").notNull().default("active"),
    createdBy: text("created_by").notNull(),
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
    index("projects_team_status_idx").on(t.teamId, t.status),
    index("projects_active_team_idx")
      .on(t.teamId)
      .where(sql`${t.status} = 'active'`),
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
  (t) => [index("milestones_team_idx").on(t.teamId)],
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
  teamId: integer("team_id").notNull().unique(),
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
});

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
    unique("demo_day_submissions_team_unique").on(t.teamId),
    index("demo_day_submissions_status_idx").on(t.status),
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
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

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
    unique("programme_weeks_week_number_unique").on(t.weekNumber),
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
    index("finale_submissions_created_at_idx").on(t.createdAt),
    index("finale_submissions_deleted_at_idx").on(t.deletedAt),
  ],
);

export type FinaleSubmission = typeof finaleSubmissionsTable.$inferSelect;
