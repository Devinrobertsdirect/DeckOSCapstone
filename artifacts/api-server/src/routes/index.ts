import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiRouterRouter from "./ai-router";
import pluginsRouter from "./plugins";
import memoryRouter from "./memory";
import systemRouter from "./system";
import commandsRouter from "./commands";
import devicesRouter from "./devices";
import eventsRouter from "./events";

const router: IRouter = Router();

router.use(healthRouter);
router.use(aiRouterRouter);
router.use(pluginsRouter);
router.use(memoryRouter);
router.use(systemRouter);
router.use(commandsRouter);
router.use(devicesRouter);
router.use(eventsRouter);

export default router;
