import { Router } from "express";
import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";
import { resolveTenant } from "../middlewares/tenant.middleware.js";
import { apiLimiter } from "../middlewares/rateLimiter.middleware.js";
import { UserRoles } from "../constants/constants.js";
import {
  createExpense,
  getExpenses,
  getExpenseStats,
  updateExpense,
  deleteExpense,
} from "../controllers/expense.controller.js";

const router = Router();

// Apply rate limiting, authentication, and tenant resolution to all routes
router.use(apiLimiter);
router.use(verifyJWT);
router.use(resolveTenant);

// Only Admins and Super Admins can manage expenses
router.use(authorizeRoles(UserRoles.ADMIN, UserRoles.SUPER_ADMIN));

router.route("/").post(createExpense).get(getExpenses);

router.route("/stats").get(getExpenseStats);

router.route("/:expenseId")
  .patch(updateExpense)
  .delete(deleteExpense);

export default router;
