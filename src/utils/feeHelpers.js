/**
 * Fee Calculation Utilities
 * Centralized fee calculation and due tracking logic
 */

import { StudentMonthlyFee } from "../models/studentMonthlyFee.model.js";
import { DueRecord } from "../models/dueRecord.model.js";
import { AdvanceBalance } from "../models/advanceBalance.model.js";

/**
 * Calculate due carried forward from previous month
 * @param {string} studentId - Student MongoDB ObjectId
 * @param {number} month - Current month (0-11)
 * @param {number} year - Current year
 * @returns {Promise<number>} Amount to carry forward
 */
export const calculateDueCarryForward = async (studentId, month, year) => {
  // Calculate previous month
  const previousMonth = month === 0 ? 11 : month - 1;
  const previousYear = month === 0 ? year - 1 : year;

  const previousFee = await StudentMonthlyFee.findOne({
    studentId,
    month: previousMonth,
    year: previousYear,
  });

  let dueCarriedForward = 0;

  // Carry forward if previous month has unpaid dues
  if (previousFee) {
    if (previousFee.status === "DUE") {
      // Full unpaid month
      dueCarriedForward =
        previousFee.baseFee + previousFee.dueCarriedForwardAmount;
    } else if (previousFee.status === "PAID" && previousFee.paidAmount) {
      // Partial payment - carry forward the unpaid portion
      const unpaidAmount =
        Math.round((previousFee.totalAmount - previousFee.paidAmount) * 100) /
        100;
      if (unpaidAmount > 0) {
        dueCarriedForward = unpaidAmount;
      }
    }
  }

  // Also check for unresolved due records to ensure cumulative tracking
  const unresolvedDue = await DueRecord.findOne({
    studentId,
    resolved: false,
  });

  if (unresolvedDue && unresolvedDue.totalDueAmount > 0) {
    // Add any additional unresolved dues
    dueCarriedForward =
      Math.round((dueCarriedForward + unresolvedDue.totalDueAmount) * 100) /
      100;
  }

  return dueCarriedForward;
};

/**
 * Calculate total amount for a fee record
 * @param {number} baseFee - Base monthly fee
 * @param {number} dueCarriedForward - Due amount from previous months
 * @returns {number} Total amount (rounded to 2 decimals)
 */
export const calculateTotalFeeAmount = (baseFee, dueCarriedForward = 0) => {
  return Math.round((baseFee + dueCarriedForward) * 100) / 100;
};

/**
 * Check if advance balance can cover a fee
 * @param {string} studentId - Student ID
 * @param {number} totalAmount - Total fee amount
 * @returns {Promise<boolean>} True if advance can cover
 */
export const canAdvanceCoverFee = async (studentId, totalAmount) => {
  const advanceBalance = await AdvanceBalance.findOne({ studentId });

  if (!advanceBalance) {
    return false;
  }

  return advanceBalance.remainingAmount >= totalAmount;
};

/**
 * Create month-year key for due tracking
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {string} Format: "YYYY-MM"
 */
export const createMonthYearKey = (month, year) => {
  return `${year}-${String(month).padStart(2, "0")}`;
};

/**
 * Parse month-year key back to month and year
 * @param {string} key - Format: "YYYY-MM"
 * @returns {Object} { month, year }
 */
export const parseMonthYearKey = (key) => {
  const [year, month] = key.split("-");
  return {
    month: parseInt(month, 10),
    year: parseInt(year, 10),
  };
};

/**
 * Get month name from month number
 * @param {number} month - Month (0-11)
 * @returns {string} Month name
 */
export const getMonthName = (month) => {
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return monthNames[month];
};

/**
 * Get short month name
 * @param {number} month - Month (0-11)
 * @returns {string} Short month name (e.g., "Jan")
 */
export const getShortMonthName = (month) => {
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return monthNames[month];
};

/**
 * Calculate next billing date based on billing day
 * @param {number} billingDay - Day of month for billing (1-31)
 * @param {Date} fromDate - Starting date (defaults to today)
 * @returns {Date} Next billing date
 */
export const calculateNextBillingDate = (billingDay, fromDate = new Date()) => {
  const nextDate = new Date(fromDate);
  nextDate.setMonth(nextDate.getMonth() + 1);

  // Handle months with fewer days
  const maxDayInNextMonth = new Date(
    nextDate.getFullYear(),
    nextDate.getMonth() + 1,
    0,
  ).getDate();

  if (billingDay > maxDayInNextMonth) {
    nextDate.setDate(maxDayInNextMonth);
  } else {
    nextDate.setDate(billingDay);
  }

  return nextDate;
};

/**
 * Check if a fee record exists for a student in a given month
 * @param {string} studentId - Student ID
 * @param {number} month - Month (0-11)
 * @param {number} year - Year
 * @returns {Promise<Object|null>} Fee record or null
 */
export const getFeeRecordForMonth = async (studentId, month, year) => {
  return await StudentMonthlyFee.findOne({
    studentId,
    month,
    year,
  });
};

/**
 * Round fee amount to 2 decimal places
 * @param {number} amount - Amount to round
 * @returns {number} Rounded amount
 */
export const roundFeeAmount = (amount) => {
  return Math.round(amount * 100) / 100;
};
