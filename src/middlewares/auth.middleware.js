import jwt from "jsonwebtoken";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Admin } from "../models/admin.model.js";
import { getRedisClient } from "../config/redis.js";

const ADMIN_CACHE_TTL = 300; // 5 minutes

/**
 * Get admin from Redis cache, falling back to DB.
 * Caches the result to avoid a DB hit on every authenticated request.
 */
const getAdminCached = async (adminId) => {
  const cacheKey = `admin:profile:${adminId}`;

  try {
    const redis = getRedisClient();
    if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        parsed._cached = true; // Mark as cached
        return parsed;
      }
    }
  } catch {
    // Redis unavailable — fall through to DB
  }

  // DB lookup
  // Remove .lean() so Mongoose applies Schema defaults (like isActive: true) if missing in DB
  const adminDoc = await Admin.findById(adminId).select("-password");
  const admin = adminDoc ? adminDoc.toObject() : null;

  if (admin) {
    try {
      const redis = getRedisClient();
      if (redis) {
        await redis.setex(cacheKey, ADMIN_CACHE_TTL, JSON.stringify(admin));
      }
    } catch {
      // Cache write failed — not critical
    }
  }

  return admin;
};

/**
 * Invalidate admin cache on logout or isActive change.
 * Call this from AdminService.logout() and AdminService.deactivate().
 */
export const invalidateAdminCache = async (adminId) => {
  try {
    const redis = getRedisClient();
    if (redis) await redis.del(`admin:profile:${adminId}`);
  } catch {
    // Non-critical
  }
};

export const verifyJWT = asyncHandler(async (req, _, next) => {
  try {
    const token =
      req.cookies?.accessToken ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (!token) throw new ApiError(401, "Unauthorized request");

    // Verify token signature and expiry
    let decodedToken;
    try {
      decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw new ApiError(401, "Access token expired");
      } else if (error.name === "JsonWebTokenError") {
        throw new ApiError(401, "Invalid access token");
      }
      throw error;
    }

    // Accept both ADMIN and SUPER_ADMIN roles
    if (
      decodedToken?.role === "ADMIN" ||
      decodedToken?.role === "SUPER_ADMIN" ||
      decodedToken?.role === "STAFF"
    ) {
      const admin = await getAdminCached(decodedToken._id);
      
      if (!admin) throw new ApiError(401, "Invalid Access Token");
      if (!admin.isActive) throw new ApiError(403, "Admin account is inactive");
      req.admin = admin;
      next();
    } else {
      throw new ApiError(401, "Unauthorized: Not an admin token");
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(401, error?.message || "Invalid access token");
  }
});

export const authorizeRoles = (...roles) => {
  return (req, _, next) => {
    if (!roles.includes(req.admin.role)) {
      throw new ApiError(
        403,
        `Role: ${req.admin.role} is not allowed to access this resource`,
      );
    }
    next();
  };
};
