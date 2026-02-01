import { Router } from "express";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import { UserRoles } from "../constants/constants.js";
import {
  createSlot,
  updateSlot,
  getSlotDetails,
  getAllSlots,
  deleteSlot,
} from "../controllers/slot.controller.js";

const router = Router();

// All routes require authentication
router.use(verifyJWT);

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
