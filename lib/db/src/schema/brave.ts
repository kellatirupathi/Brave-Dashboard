import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Enums
export const userRoleEnum = pgEnum("user_role", ["student", "coordinator", "admin"]);
export const provisionedViaEnum = pgEnum("provisioned_via", ["roster", "csv_import", "manual", "auto_forms_sso"]);
export const teamStatusEnum = pgEnum("team_status", ["pending", "active", "rejected", "changes_requested"]);
export const projectStatusEnum = pgEnum("project_status", ["active", "inactive"]);
export const entryStatusEnum = pgEnum("entry_status", ["draft", "submitted", "verified", "rejected"]);
export const enteredByEnum = pgEnum("entered_by", ["student", "admin"]);
export const milestoneTypeEnum = pgEnum("milestone_type", ["auto", "manual"]);
export const demoDayStatusEnum = pgEnum("demo_day_status", ["draft", "submitted", "shortlisted", "rejected"]);
export const announcementTargetEnum = pgEnum("announcement_target", ["all", "campus", "team"]);
export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "accepted", "declined", "cancelled"]);
export const joinRequestStatusEnum = pgEnum("join_request_status", ["pending", "approved", "declined", "cancelled"]);
export const leaveRequestStatusEnum = pgEnum("leave_request_status", ["pending", "approved", "declined"]);

// Campuses
export const campusesTable = pgTable("campuses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  coordinatorId: text("coordinator_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCampusSchema = createInsertSchema(campusesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCampus = z.infer<typeof insertCampusSchema>;
export type Campus = typeof campusesTable.$inferSelect;

// Users
export const usersTable = pgTable("users", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  replitId: text("replit_id").unique(),
  formsUserId: text("forms_user_id").unique(),
  email: text("email").notNull().unique(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  profileImage: text("profile_image_url"),
  role: userRoleEnum("role").notNull().default("student"),
  campusId: integer("campus_id"),
  passwordHash: text("password_hash"),
  isActive: boolean("is_active").notNull().default(true),
  provisionedVia: provisionedViaEnum("provisioned_via").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

// Forms SSO auth tokens (one-time use, short-lived)
export const authTokensTable = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: text("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuthTokenSchema = createInsertSchema(authTokensTable).omit({ id: true, createdAt: true });
export type InsertAuthToken = z.infer<typeof insertAuthTokenSchema>;
export type AuthToken = typeof authTokensTable.$inferSelect;

// Student roster
export const rosterTable = pgTable("roster", {
  id: serial("id").primaryKey(),
  studentId: text("student_id").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email").unique(),
  campusName: text("campus_name").notNull(),
  campusId: integer("campus_id"),
  niatId: text("niat_id"),
  batchSectionName: text("batch_section_name"),
  isWhitelisted: boolean("is_whitelisted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRosterSchema = createInsertSchema(rosterTable).omit({ id: true, createdAt: true });
export type InsertRoster = z.infer<typeof insertRosterSchema>;
export type Roster = typeof rosterTable.$inferSelect;

// Access Requests
export const accessRequestStatusEnum = pgEnum("access_request_status", ["pending", "approved", "rejected"]);

export const accessRequestsTable = pgTable("access_requests", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  batch: text("batch"),
  niatId: text("niat_id"),
  campusName: text("campus_name").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAccessRequestSchema = createInsertSchema(accessRequestsTable).omit({ id: true, createdAt: true });
export type InsertAccessRequest = z.infer<typeof insertAccessRequestSchema>;
export type AccessRequest = typeof accessRequestsTable.$inferSelect;

// Teams
export const teamsTable = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  campusId: integer("campus_id").notNull(),
  leaderId: text("leader_id").notNull(),
  status: teamStatusEnum("status").notNull().default("pending"),
  tagline: text("tagline"),
  photoUrl: text("photo_url"),
  inviteCode: text("invite_code").unique(),
  rejectionReason: text("rejection_reason"),
  coordinatorComment: text("coordinator_comment"),
  isHidden: boolean("is_hidden").notNull().default(false),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTeamSchema = createInsertSchema(teamsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teamsTable.$inferSelect;

// Team members
export const teamMembersTable = pgTable("team_members", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  userId: text("user_id").notNull(),
  memberRole: text("member_role"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("team_members_user_unique").on(t.userId)]);

export const insertTeamMemberSchema = createInsertSchema(teamMembersTable).omit({ id: true, joinedAt: true });
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertTeamInvitationSchema = createInsertSchema(teamInvitationsTable).omit({ id: true, createdAt: true });
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertTeamJoinRequestSchema = createInsertSchema(teamJoinRequestsTable).omit({ id: true, createdAt: true });
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertTeamLeaveRequestSchema = createInsertSchema(teamLeaveRequestsTable).omit({ id: true, createdAt: true });
export type TeamLeaveRequest = typeof teamLeaveRequestsTable.$inferSelect;

// Projects
export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: projectStatusEnum("status").notNull().default("active"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;

// Order Book Entries
export const orderBookEntriesTable = pgTable("order_book_entries", {
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrderBookEntrySchema = createInsertSchema(orderBookEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrderBookEntry = z.infer<typeof insertOrderBookEntrySchema>;
export type OrderBookEntry = typeof orderBookEntriesTable.$inferSelect;

// Revenue Entries
export const revenueEntriesTable = pgTable("revenue_entries", {
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
  enteredBy: enteredByEnum("entered_by").notNull().default("student"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRevenueEntrySchema = createInsertSchema(revenueEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRevenueEntry = z.infer<typeof insertRevenueEntrySchema>;
export type RevenueEntry = typeof revenueEntriesTable.$inferSelect;

// Milestones
export const milestonesTable = pgTable("milestones", {
  id: serial("id").primaryKey(),
  teamId: integer("team_id").notNull(),
  type: milestoneTypeEnum("type").notNull().default("manual"),
  title: text("title").notNull(),
  description: text("description"),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  imageUrl: text("image_url"),
  linkUrl: text("link_url"),
  isPinned: boolean("is_pinned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMilestoneSchema = createInsertSchema(milestonesTable).omit({ id: true, createdAt: true });
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDemoDayApplicationSchema = createInsertSchema(demoDayApplicationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDemoDayApplication = z.infer<typeof insertDemoDayApplicationSchema>;
export type DemoDayApplication = typeof demoDayApplicationsTable.$inferSelect;

// Notifications
export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  type: text("type").notNull().default("general"),
  isRead: boolean("is_read").notNull().default(false),
  link: text("link"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAnnouncementSchema = createInsertSchema(announcementsTable).omit({ id: true, createdAt: true });
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcementsTable.$inferSelect;

// Programme Config
export const programmeConfigTable = pgTable("programme_config", {
  id: serial("id").primaryKey(),
  startDate: text("start_date").notNull().default("2025-04-15"),
  endDate: text("end_date").notNull().default("2025-07-15"),
  demoDayDate: text("demo_day_date"),
  demoEligibilityThreshold: integer("demo_eligibility_threshold").notNull().default(200000),
  leaderboardFrozen: boolean("leaderboard_frozen").notNull().default(false),
  demoDayApplicationsOpen: boolean("demo_day_applications_open").notNull().default(false),
  demoDayApplicationDeadline: text("demo_day_application_deadline"),
  programmePhase: text("programme_phase").notNull().default("Phase 1 - Launch"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProgrammeConfigSchema = createInsertSchema(programmeConfigTable).omit({ id: true, updatedAt: true });
export type InsertProgrammeConfig = z.infer<typeof insertProgrammeConfigSchema>;
export type ProgrammeConfig = typeof programmeConfigTable.$inferSelect;

// Uploaded files metadata (filename / mime / size for objects in storage)
export const uploadedFilesTable = pgTable("uploaded_files", {
  objectPath: text("object_path").primaryKey(),
  filename: text("filename").notNull(),
  size: integer("size").notNull(),
  contentType: text("content_type").notNull(),
  uploadedById: text("uploaded_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUploadedFileSchema = createInsertSchema(uploadedFilesTable).omit({ createdAt: true });
export type InsertUploadedFile = z.infer<typeof insertUploadedFileSchema>;
export type UploadedFile = typeof uploadedFilesTable.$inferSelect;

// Audit Log
export const auditLogTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id"),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogTable.$inferSelect;
