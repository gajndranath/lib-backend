/**
 * CACHING STRATEGY CONFIGURATION
 * Defines what gets cached, for how long, and when it gets invalidated
 */

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  // Short TTL for frequently changing data
  FEE_SUMMARY: 300, // 5 minutes
  SLOT_OCCUPANCY: 300, // 5 minutes

  // Medium TTL for moderately changing data
  STUDENT_PROFILE: 3600, // 1 hour
  SLOT_DETAILS: 1800, // 30 minutes
  NOTIFICATION_PREFERENCES: 3600, // 1 hour

  // Long TTL for static data
  ADMIN_PUBLIC_KEY: 86400, // 24 hours
  ALL_ACTIVE_SLOTS: 900, // 15 minutes

  // Session data
  SESSION: 86400, // 24 hours
};

// Cache key patterns
export const CACHE_KEYS = {
  // Student data
  STUDENT: (studentId) => `student:${studentId}`,
  STUDENT_FEES: (studentId) => `student:${studentId}:fees`,
  STUDENT_DUE: (studentId) => `student:${studentId}:due`,
  STUDENT_ADVANCE: (studentId) => `student:${studentId}:advance`,
  STUDENT_NOTIFICATIONS: (studentId) => `student:${studentId}:notifications`,

  // Slot data
  SLOT: (slotId) => `slot:${slotId}`,
  SLOT_OCCUPANCY: (slotId) => `slot:${slotId}:occupancy`,
  ALL_SLOTS: `slots:active:all`,

  // Admin data
  ADMIN_PUBLIC_KEY: (adminId) => `admin:${adminId}:publicKey`,
  ADMIN_PROFILE: (adminId) => `admin:${adminId}:profile`,

  // Reminders and announcements
  ANNOUNCEMENTS: `announcements:active`,
  REMINDERS_PENDING: `reminders:pending`,
};

/**
 * INVALIDATION STRATEGY
 * When a resource is updated, which caches should be cleared
 */
export const CACHE_INVALIDATION_MAP = {
  // When a student is updated
  "STUDENT:UPDATE": [
    (studentId) => CACHE_KEYS.STUDENT(studentId),
    (studentId) => CACHE_KEYS.STUDENT_NOTIFICATIONS(studentId),
  ],

  // When a student's slot changes
  "STUDENT:SLOT_CHANGE": [
    (studentId, newSlotId, oldSlotId) => [
      CACHE_KEYS.STUDENT(studentId),
      CACHE_KEYS.SLOT_OCCUPANCY(newSlotId),
      CACHE_KEYS.SLOT_OCCUPANCY(oldSlotId),
      CACHE_KEYS.ALL_SLOTS,
    ],
  ],

  // When fees are marked paid
  "FEE:PAID": [
    (studentId) => CACHE_KEYS.STUDENT_FEES(studentId),
    (studentId) => CACHE_KEYS.STUDENT_DUE(studentId),
  ],

  // When fees are marked due
  "FEE:DUE": [
    (studentId) => CACHE_KEYS.STUDENT_FEES(studentId),
    (studentId) => CACHE_KEYS.STUDENT_DUE(studentId),
  ],

  // When advance is added
  "ADVANCE:ADD": [
    (studentId) => CACHE_KEYS.STUDENT_ADVANCE(studentId),
    (studentId) => CACHE_KEYS.STUDENT_FEES(studentId),
  ],

  // When slot is updated
  "SLOT:UPDATE": [
    (slotId) => CACHE_KEYS.SLOT(slotId),
    (slotId) => CACHE_KEYS.SLOT_OCCUPANCY(slotId),
    () => CACHE_KEYS.ALL_SLOTS,
  ],

  // When admin public key is updated
  "ADMIN:KEY_UPDATE": [(adminId) => CACHE_KEYS.ADMIN_PUBLIC_KEY(adminId)],
};

/**
 * Cache hit tracking for monitoring
 */
export const CacheMetrics = {
  hits: 0,
  misses: 0,

  recordHit() {
    this.hits++;
  },

  recordMiss() {
    this.misses++;
  },

  getHitRate() {
    const total = this.hits + this.misses;
    if (total === 0) return 0;
    return ((this.hits / total) * 100).toFixed(2);
  },

  reset() {
    this.hits = 0;
    this.misses = 0;
  },

  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      total: this.hits + this.misses,
      hitRate: `${this.getHitRate()}%`,
    };
  },
};

export default {
  CACHE_TTL,
  CACHE_KEYS,
  CACHE_INVALIDATION_MAP,
  CacheMetrics,
};
