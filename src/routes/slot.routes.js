import { Router } from "express";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import { resolveTenant } from "../middlewares/tenant.middleware.js";
import { apiLimiter } from "../middlewares/rateLimiter.middleware.js";
import { UserRoles } from "../constants/constants.js";
import {
  createSlot,
  updateSlot,
  getSlotDetails,
  getAllSlots,
  deleteSlot,
} from "../controllers/slot.controller.js";

const router = Router();

// Apply rate limiting and authentication to all routes
router.use(apiLimiter);
router.use(verifyJWT);
router.use(resolveTenant);

// Get all slots (all staff can view)
router.route("/").get(getAllSlots);

// Get slot details
router.route("/:slotId").get(getSlotDetails);

// Protected routes for Super Admin only
router.route("/").post(authorizeRoles(UserRoles.SUPER_ADMIN), createSlot);

router
  .route("/:slotId")
  .patch(authorizeRoles(UserRoles.SUPER_ADMIN), updateSlot);

router
  .route("/:slotId")
  .delete(authorizeRoles(UserRoles.SUPER_ADMIN), deleteSlot);

export default router;
