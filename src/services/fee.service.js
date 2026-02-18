/**
 * Fee Service — Facade
 *
 * Delegates to focused fee sub-services for better maintainability.
 * Controllers should import this service for backward compatibility,
 * or import the specific sub-service directly for new code.
 *
 * Sub-services:
 *   - FeeGenerationService  → fee creation and billing cycles
 *   - FeePaymentService     → payment recording and receipts
 *   - FeeAdvanceService     → advance payments management
 *   - FeeDueService         → due tracking and reminders
 */

import FeeGenerationService from "./feeGeneration.service.js";
import FeePaymentService from "./feePayment.service.js";
import FeeAdvanceService from "./feeAdvance.service.js";
import FeeDueService from "./feeDue.service.js";

class FeeService {
  // ─── Fee Generation ───────────────────────────────────────────────────────

  static async generateMonthlyFees(month, year, adminId) {
    return FeeGenerationService.generateMonthlyFees(month, year, adminId);
  }

  static async ensureMonthlyFeeExists(studentId, month, year, adminId) {
    return FeeGenerationService.ensureMonthlyFeeExists(studentId, month, year, adminId);
  }

  static async generatePersonalizedFees(adminId = null) {
    return FeeGenerationService.generatePersonalizedFees(adminId);
  }

  static async getStudentsWithOverduePayments(graceDays = 1) {
    return FeeGenerationService.getStudentsWithOverduePayments(graceDays);
  }

  static async autoMarkOverdueAsDue(graceDays = 1, adminId = null) {
    return FeeGenerationService.autoMarkOverdueAsDue(graceDays, adminId);
  }

  // ─── Fee Payment ──────────────────────────────────────────────────────────

  static async markAsPaid(studentId, month, year, paymentData, adminId) {
    return FeePaymentService.markAsPaid(studentId, month, year, paymentData, adminId);
  }

  static async getStudentFeeSummary(studentId) {
    return FeePaymentService.getStudentFeeSummary(studentId);
  }

  static async getDashboardPaymentStatus(month, year) {
    return FeePaymentService.getDashboardPaymentStatus(month, year);
  }

  static async generateReceipt(studentId, month, year) {
    return FeePaymentService.generateReceipt(studentId, month, year);
  }

  // ─── Fee Advance ──────────────────────────────────────────────────────────

  static async addAdvance(studentId, amount, adminId) {
    return FeeAdvanceService.addAdvance(studentId, amount, adminId);
  }

  static async applyAdvanceToMonth(studentId, month, year, adminId) {
    return FeeAdvanceService.applyAdvanceToMonth(studentId, month, year, adminId);
  }

  static async getAdvanceBalance(studentId) {
    return FeeAdvanceService.getAdvanceBalance(studentId);
  }

  static async getAdvanceUsageHistory(studentId) {
    return FeeAdvanceService.getAdvanceUsageHistory(studentId);
  }

  // ─── Fee Due ──────────────────────────────────────────────────────────────

  static async markAsDue(studentId, month, year, reminderDate, adminId) {
    return FeeDueService.markAsDue(studentId, month, year, reminderDate, adminId);
  }

  static async getStudentDueRecords(studentId) {
    return FeeDueService.getStudentDueRecords(studentId);
  }

  static async getCurrentDueRecord(studentId) {
    return FeeDueService.getCurrentDueRecord(studentId);
  }
}

export default FeeService;
