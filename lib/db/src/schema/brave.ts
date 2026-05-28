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
    provisionedVia: provisionedViaEnum("provisioned_via")
      .notNull()
      .default("manual"),
    profileCompletedAt: timestamp("profile_completed_at", {
      withTimezone: true,
    }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
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
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("weekly_journals_team_week_unique").on(t.teamId, t.weekStartDate),
    index("weekly_journals_team_idx").on(t.teamId),
    index("weekly_journals_week_idx").on(t.weekStartDate),
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
