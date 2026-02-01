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
} from "../controllers/student.controller.js";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import { UserRoles } from "../constants/constants.js";

const router = Router();

// All routes require authentication
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
  .route("/:studentId/override-fee")
  .patch(authorizeRoles(UserRoles.SUPER_ADMIN), overrideStudentFee);

// Push subscription routes
router.route("/:studentId/subscribe").post(savePushSubscription);

router.route("/:studentId/unsubscribe").post(removePushSubscription);

export default router;
