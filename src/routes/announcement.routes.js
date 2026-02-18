import { Router } from "express";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import { resolveTenant } from "../middlewares/tenant.middleware.js";
import { apiLimiter } from "../middlewares/rateLimiter.middleware.js";
import {
  createAnnouncement,
  resolveRecipients,
} from "../controllers/announcement.controller.js";

const router = Router();

router.use(apiLimiter);
router.use(verifyJWT);
router.use(resolveTenant);
router.use(authorizeRoles("SUPER_ADMIN", "STAFF"));

router.route("/recipients").post(resolveRecipients);
router.route("/").post(createAnnouncement);

export default router;
