import { Router, type IRouter } from "express";
import customerEnrollmentRouter from "./customer-enrollment";
import demoBankingRouter from "./demo-banking";
import healthRouter from "./health";
import mobileDepositsRouter from "./mobile-deposits";

const router: IRouter = Router();

router.use(healthRouter);
router.use(customerEnrollmentRouter);
router.use(demoBankingRouter);
router.use(mobileDepositsRouter);

export default router;
