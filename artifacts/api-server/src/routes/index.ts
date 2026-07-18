import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import kycRouter from "./kyc";
import offersRouter from "./offers";
import ordersRouter from "./orders";
import disputesRouter from "./disputes";
import dashboardRouter from "./dashboard";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(kycRouter);
router.use(offersRouter);
router.use(ordersRouter);
router.use(disputesRouter);
router.use(dashboardRouter);
router.use(adminRouter);

export default router;
