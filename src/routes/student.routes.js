import { Router } from "express";
import {
  registerStudent,
  updateStudent,
  archiveStudent,
  reactivateStudent,
  getStudentDetails,
  searchStudents,
  getStudentsBySlot,
  changeStudentSlot,
  overrideStudentFee,
  savePushSubscription,
  removePushSubscription,
  getStudentSlotHistory,
  getPendingSlotChangeRequests,
  approveSlotChangeRequest,
  rejectSlotChangeRequest,
} from "../controllers/student.controller.js";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import { apiLimiter } from "../middlewares/rateLimiter.middleware.js";
import { UserRoles } from "../constants/constants.js";

const router = Router();

// Apply rate limiting and authentication to all routes
router.use(apiLimiter);
router.use(verifyJWT);

// Student management routes
router
  .route("/")
  .post(authorizeRoles(UserRoles.SUPER_ADMIN), registerStudent)
  .get(searchStudents);

router
  .route("/:studentId")
  .get(getStudentDetails)
  .patch(authorizeRoles(UserRoles.SUPER_ADMIN), updateStudent);

router
  .route("/:studentId/archive")
  .patch(authorizeRoles(UserRoles.SUPER_ADMIN), archiveStudent);

router
  .route("/:studentId/reactivate")
  .patch(authorizeRoles(UserRoles.SUPER_ADMIN), reactivateStudent);

router.route("/slot/:slotId").get(getStudentsBySlot);

// Slot and fee management
router
  .route("/:studentId/change-slot")
  .patch(authorizeRoles(UserRoles.SUPER_ADMIN), changeStudentSlot);

router
  .route("/:studentId/slot-history")
  .get(authorizeRoles(UserRoles.SUPER_ADMIN), getStudentSlotHistory);

router
  .route("/slot-requests/pending")
  .get(authorizeRoles(UserRoles.SUPER_ADMIN), getPendingSlotChangeRequests);

router
  .route("/slot-requests/:requestId/approve")
  .patch(authorizeRoles(UserRoles.SUPER_ADMIN), approveSlotChangeRequest);

router
  .route("/slot-requests/:requestId/reject")
  .patch(authorizeRoles(UserRoles.SUPER_ADMIN), rejectSlotChangeRequest);

router
  .route("/:studentId/override-fee")
  .patch(authorizeRoles(UserRoles.SUPER_ADMIN), overrideStudentFee);

// Push subscription routes
router.route("/:studentId/subscribe").post(savePushSubscription);

router.route("/:studentId/unsubscribe").post(removePushSubscription);

export default router;
