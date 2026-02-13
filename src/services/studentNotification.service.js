import { Student } from "../models/student.model.js";
import { ApiError } from "../utils/ApiError.js";
import cacheService from "../utils/cache.js";
import { CACHE_KEYS, CACHE_TTL } from "../utils/cacheStrategy.js";

class StudentNotificationService {
  /**
   * Save or update push subscription (web or fcm)
   * @param {string} studentId - Student ID
   * @param {object} subscription - Subscription data
   * @param {string} type - Subscription type ('web' or 'fcm')
   * @returns {Promise<object>} Updated student with subscription
   */
  async savePushSubscription(studentId, subscription, type = "web") {
    if (!studentId) {
      throw new ApiError(400, "Student ID is required");
    }

    if (!subscription) {
      throw new ApiError(400, "Subscription is required");
    }

    if (!["web", "fcm"].includes(type)) {
      throw new ApiError(
        400,
        "Invalid subscription type. Must be 'web' or 'fcm'",
      );
    }

    // Validate based on type
    if (type === "web") {
      if (!subscription.endpoint || !subscription.keys) {
        throw new ApiError(400, "Invalid web push subscription format");
      }
    } else if (type === "fcm") {
      const token = subscription.token || subscription;
      if (!token || typeof token !== "string") {
        throw new ApiError(400, "Invalid FCM token format");
      }
    }

    const student = await Student.findById(studentId);
    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    // Update based on type
    const updateData =
      type === "web"
        ? { webPushSubscription: subscription }
        : { fcmToken: subscription.token || subscription };

    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      updateData,
      { new: true, runValidators: false },
    );

    // Invalidate cache
    await cacheService.del(CACHE_KEYS.STUDENT_NOTIFICATIONS(studentId));

    return updatedStudent;
  }

  /**
   * Remove push subscription (web or fcm)
   * @param {string} studentId - Student ID
   * @param {string} type - Subscription type ('web' or 'fcm')
   * @returns {Promise<object>} Updated student with subscription removed
   */
  async removePushSubscription(studentId, type = "web") {
    if (!studentId) {
      throw new ApiError(400, "Student ID is required");
    }

    if (!["web", "fcm"].includes(type)) {
      throw new ApiError(
        400,
        "Invalid subscription type. Must be 'web' or 'fcm'",
      );
    }

    const student = await Student.findById(studentId);
    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    const updateData =
      type === "web" ? { webPushSubscription: null } : { fcmToken: null };

    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      updateData,
      { new: true, runValidators: false },
    );

    // Invalidate cache
    await cacheService.del(CACHE_KEYS.STUDENT_NOTIFICATIONS(studentId));

    return updatedStudent;
  }

  /**
   * Get all push subscriptions for a student (with caching)
   * @param {string} studentId - Student ID
   * @returns {Promise<object>} Subscription data
   */
  async getPushSubscriptions(studentId) {
    if (!studentId) {
      throw new ApiError(400, "Student ID is required");
    }

    // Try to get from cache first
    const cacheKey = CACHE_KEYS.STUDENT_NOTIFICATIONS(studentId);
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const student = await Student.findById(studentId).select(
      "webPushSubscription fcmToken",
    );

    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    const result = {
      webPush: student.webPushSubscription || null,
      fcm: student.fcmToken || null,
      isWebSubscribed: !!student.webPushSubscription,
      isFcmSubscribed: !!student.fcmToken,
    };

    // Cache the result
    await cacheService.set(cacheKey, result, CACHE_TTL.STUDENT_NOTIFICATIONS);

    return result;
  }

  /**
   * Update FCM token
   * @param {string} studentId - Student ID
   * @param {string} token - FCM token
   * @returns {Promise<object>} Updated student
   */
  async updateFCMToken(studentId, token) {
    if (!studentId) {
      throw new ApiError(400, "Student ID is required");
    }

    if (!token || typeof token !== "string") {
      throw new ApiError(400, "Valid FCM token is required");
    }

    const student = await Student.findById(studentId);
    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      { fcmToken: token },
      { new: true, runValidators: false },
    );

    return updatedStudent;
  }

  /**
   * Update web push subscription
   * @param {string} studentId - Student ID
   * @param {object} subscription - Web push subscription object
   * @returns {Promise<object>} Updated student
   */
  async updateWebPushSubscription(studentId, subscription) {
    if (!studentId) {
      throw new ApiError(400, "Student ID is required");
    }

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      throw new ApiError(400, "Invalid web push subscription format");
    }

    const student = await Student.findById(studentId);
    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      { webPushSubscription: subscription },
      { new: true, runValidators: false },
    );

    return updatedStudent;
  }

  /**
   * Clear all push subscriptions for a student
   * @param {string} studentId - Student ID
   * @returns {Promise<object>} Updated student
   */
  async clearAllSubscriptions(studentId) {
    if (!studentId) {
      throw new ApiError(400, "Student ID is required");
    }

    const student = await Student.findById(studentId);
    if (!student) {
      throw new ApiError(404, "Student not found");
    }

    const updatedStudent = await Student.findByIdAndUpdate(
      studentId,
      { webPushSubscription: null, fcmToken: null },
      { new: true, runValidators: false },
    );

    return updatedStudent;
  }
}

export default new StudentNotificationService();
