import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
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

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(storageRouter);
router.use(campusesRouter);
router.use(teamsRouter);
router.use(teamFlowRouter);
router.use(projectsRouter);
router.use(financialsRouter);
router.use(leaderboardRouter);
router.use(dashboardRouter);
router.use(milestonesRouter);
router.use(demoDayRouter);
router.use(notificationsRouter);
router.use(announcementsRouter);
router.use(adminRouter);

export default router;
