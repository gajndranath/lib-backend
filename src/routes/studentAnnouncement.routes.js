import { Router } from "express";
import { verifyStudentJWT } from "../middlewares/studentAuth.middleware.js";
import { resolveTenant } from "../middlewares/tenant.middleware.js";
import { apiLimiter } from "../middlewares/rateLimiter.middleware.js";
import { listStudentAnnouncements } from "../controllers/studentAnnouncement.controller.js";

const router = Router();

router.use(apiLimiter);
router.use(verifyStudentJWT);
router.use(resolveTenant);

router.route("/").get(listStudentAnnouncements);

export default router;
