import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import devAuthRouter from "./dev-auth";
import storageRouter from "./storage";
import campusesRouter from "./campuses";
import teamsRouter from "./teams";
import teamFlowRouter from "./team-flow";
import projectsRouter from "./projects";
import financialsRouter from "./financials";
import leaderboardRouter from "./leaderboard";
import dashboardRouter from "./dashboard";
import milestonesRouter from "./milestones";
import demoDayRouter from "./demoday";
import notificationsRouter from "./notifications";
import announcementsRouter from "./announcements";
import adminRouter from "./admin";
import adminTeamsRouter from "./admin-teams";
import adminLeadsRouter from "./admin-leads";
import feedbackRouter from "./feedback";
import journalsRouter from "./journals";
import heatmapRouter from "./heatmap";
import programmeWeeksRouter from "./programme-weeks";
import cronRouter from "./cron";
import resourcesRouter from "./resources";
import chatbotRouter from "./chatbot";
import campusInsightsRouter from "./campus-insights";
import adminNotificationsRouter from "./admin-notifications";
import cronOverdueNotificationsRouter from "./cron-overdue-notifications";
import cronBackupSupabaseRouter from "./cron-backup-supabase";
import brdAnalysisRouter from "./brd-analysis";
import accessRequestsRouter from "./access-requests";
import adminPermissionsRouter from "./admin-permissions";
import adminChatbotRouter from "./admin-chatbot";
import pageViewsRouter from "./page-views";
import coordinatorTagsRouter from "./coordinator-tags";
import gritConfigRouter from "./grit-config";
import reportsRouter from "./reports";
import cronJournalEscalationRouter from "./cron-journal-escalation";
import reelsScriptsRouter from "./reels-scripts";
import termsRouter from "./terms";
import demoDaySubmissionsRouter from "./demoday-submissions";
import adminBrdDriveRouter from "./admin-brd-drive";
import popupsRouter from "./popups";
import projectsLockRouter from "./projects-lock";
import journalSubmissionsLockRouter from "./journal-submissions-lock";
import finaleRouter from "./finale";
import pcaVotesRouter from "./pca-votes";
import rejectionReasonsRouter from "./rejection-reasons";
import leaderboardConfigRouter from "./leaderboard-config";
import seasonsRouter from "./seasons";
import leadsRouter from "./leads";
import pipelineRouter from "./pipeline";
import pipelineGatesRouter from "./pipeline-gates";
import leadsControlRouter from "./leads-control";
import cronLeadNudgesRouter from "./cron-lead-nudges";
import whatsappRouter from "./whatsapp";
import pricingRouter from "./pricing";
import reviewRouter from "./review";
import productTourRouter from "./product-tour";
import publicAppRouter from "./public-app";
import seasonOverridesRouter from "./season-overrides";

const router: IRouter = Router();

router.use(healthRouter);
router.use(publicAppRouter);
// Per-user season overrides: pins named students to a season while everyone
// else follows the live one (additive, isolated, super-admin only).
router.use(seasonOverridesRouter);
router.use(authRouter);
router.use(devAuthRouter);
router.use(storageRouter);
router.use(campusesRouter);
// team-flow must come BEFORE teams so its specific paths
// (/teams/browse, /teams/join-by-code, /teams/:id/invitations, etc.)
// aren't swallowed by the generic /teams/:id route.
router.use(teamFlowRouter);
router.use(teamsRouter);
router.use(projectsRouter);
router.use(financialsRouter);
router.use(leaderboardRouter);
router.use(dashboardRouter);
router.use(milestonesRouter);
router.use(demoDayRouter);
router.use(notificationsRouter);
router.use(announcementsRouter);
router.use(adminRouter);
router.use(adminTeamsRouter);
// Admin oversight of the Season 2 lead pipeline: every lead, every team, with
// trail / project / payment / BRD state (additive, isolated, read-only).
// Deleting admin-leads.ts means removing this line and its import above.
router.use(adminLeadsRouter);
router.use(feedbackRouter);
// Progress-enforcement modules (new — additive only)
router.use(programmeWeeksRouter);
router.use(journalsRouter);
router.use(heatmapRouter);
router.use(cronRouter);
// Resources (admin-curated reading list — additive only)
router.use(resourcesRouter);
// Chatbot (Cerebras-powered Q&A widget — additive only)
router.use(chatbotRouter);
// Campus Insights (hidden admin-only page — additive only)
router.use(campusInsightsRouter);
// Admin notification subscribers + daily overdue cron (additive only)
router.use(adminNotificationsRouter);
router.use(cronOverdueNotificationsRouter);
// Supabase mirror backup cron (additive only, isolated)
router.use(cronBackupSupabaseRouter);
// AI BRD analysis history + cross-entry view (additive only)
router.use(brdAnalysisRouter);
// New-User Access Request gate (student submit + status — additive only)
router.use(accessRequestsRouter);
// Super Admin + per-page admin permissions (additive only, isolated)
router.use(adminPermissionsRouter);
// Admin Chatbot History viewer (additive only, isolated)
router.use(adminChatbotRouter);
// Page-view tracking + admin Pages Log (additive only, isolated)
router.use(pageViewsRouter);
// Coordinator Tags catalog + per-coordinator assignments (additive, isolated)
router.use(coordinatorTagsRouter);
// GRIT Miles ladder + journal-edit deadline + escalation toggle (additive)
router.use(gritConfigRouter);
// Admin journal Reports (campus-wise tables + saved report links, additive)
router.use(reportsRouter);
// Journal escalation chain + weekly report crons (additive, isolated)
router.use(cronJournalEscalationRouter);
// Reel Scripts library (admin list/import). NOTE: daily reel-generation cron
// removed — reels are now decided per-journal on submit (see journals scan).
router.use(reelsScriptsRouter);
// Student Terms & Conditions consent gate (additive, isolated)
router.use(termsRouter);
// New Demo Day "best project" submissions + admin shortlist (additive)
router.use(demoDaySubmissionsRouter);
// Manual BRD → Google Drive migration (admin Config button, additive/isolated)
router.use(adminBrdDriveRouter);
// Admin-managed student pop-ups: CRUD + student pending/ack (additive, isolated)
router.use(popupsRouter);
// Projects submissions lock: admin Config toggle + student read (additive)
router.use(projectsLockRouter);
// Weekly Journal submissions lock: season-scoped admin toggle + student read.
router.use(journalSubmissionsLockRouter);
router.use(finaleRouter);
router.use(pcaVotesRouter);
// Revenue rejection reasons catalog: admin Config CRUD + queue chips (additive)
router.use(rejectionReasonsRouter);
// Leaderboard display config: hide-rank-for-students + banner image (additive)
router.use(leaderboardConfigRouter);
// Season switching + the Season 1 archive controls (additive, isolated).
// Deleting seasons.ts means removing this line and its import above.
router.use(seasonsRouter);
// Season 2 lead pipeline: capture, dated trail, stage gates (additive,
// isolated). Deleting leads.ts means removing this line and its import.
router.use(leadsRouter);
// Season 2 pipeline stages 3-5: project (Gate B), payments, composed BRD
// (Gate C). Deleting pipeline.ts means removing this line and its import.
router.use(pipelineRouter);
// Pipeline gate mode (advisory vs enforced), read + admin toggle (additive).
router.use(pipelineGatesRouter);
// Season-scoped CRUD matrix + master lock for every student Leads mutation.
router.use(leadsControlRouter);
// Season 2 lead nudge / escalation / dormancy sweep (additive, isolated)
router.use(cronLeadNudgesRouter);
// WhatsApp broadcasts via Karix (additive, isolated). Super-admin only.
// Deleting whatsapp.ts means removing this line and its import above.
router.use(whatsappRouter);
// Phase 6 pricing categories + recognition caps (additive, isolated)
router.use(pricingRouter);
// Phase 7 evaluation: assignment, decisions, appeals, audit (additive, isolated)
router.use(reviewRouter);
router.use(productTourRouter);

export default router;
