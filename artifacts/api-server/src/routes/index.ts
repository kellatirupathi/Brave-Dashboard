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
import feedbackRouter from "./feedback";
import journalsRouter from "./journals";
import heatmapRouter from "./heatmap";
import programmeWeeksRouter from "./programme-weeks";
import cronRouter from "./cron";

const router: IRouter = Router();

router.use(healthRouter);
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
router.use(feedbackRouter);
// Progress-enforcement modules (new — additive only)
router.use(programmeWeeksRouter);
router.use(journalsRouter);
router.use(heatmapRouter);
router.use(cronRouter);

export default router;
