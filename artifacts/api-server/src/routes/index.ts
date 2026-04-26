import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiRouterRouter from "./ai-router";
import pluginsRouter from "./plugins";
import memoryRouter from "./memory";
import systemRouter from "./system";
import commandsRouter from "./commands";
import devicesRouter from "./devices";
import eventsRouter from "./events";
import ucmRouter from "./ucm";
import goalsRouter from "./goals";
import feedbackRouter from "./feedback";
import predictionsRouter from "./predictions";
import autonomyRouter from "./autonomy";
import traceRouter from "./trace";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiRouterRouter);
router.use(pluginsRouter);
router.use(memoryRouter);
router.use(systemRouter);
router.use(commandsRouter);
router.use(devicesRouter);
router.use(eventsRouter);
router.use(ucmRouter);
router.use(goalsRouter);
router.use(feedbackRouter);
router.use(predictionsRouter);
router.use(autonomyRouter);
router.use(traceRouter);

export default router;
