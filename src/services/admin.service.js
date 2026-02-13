import { Admin } from "../models/admin.model.js";
import { AdminActionLog } from "../models/adminActionLog.model.js";
import { ApiError } from "../utils/ApiError.js";
import cacheService from "../utils/cache.js";
import { CACHE_KEYS, CACHE_TTL } from "../utils/cacheStrategy.js";
import bcryptjs from "bcryptjs";

class AdminService {
  /**
   * Get admin profile by ID
   * @param {string} adminId - Admin ID
   * @returns {Promise<object>} Admin profile without password
   */
  async getAdminProfile(adminId) {
    if (!adminId) {
      throw new ApiError(400, "Admin ID is required");
    }

    // Try cache first
    const cacheKey = CACHE_KEYS.ADMIN_PROFILE(adminId);
    const admin = await cacheService.getOrSet(
      cacheKey,
      async () => {
        const data = await Admin.findById(adminId)
          .select("-password -refreshToken")
          .lean();
        if (!data) {
          throw new ApiError(404, "Admin not found");
        }
        return data;
      },
      CACHE_TTL.STUDENT_PROFILE, // 1 hour
    );

    return admin;
  }

  /**
   * Update admin profile
   * @param {string} adminId - Admin ID
   * @param {object} updateData - Data to update
   * @returns {Promise<object>} Updated admin profile
   */
  async updateAdminProfile(adminId, updateData) {
    if (!adminId) {
      throw new ApiError(400, "Admin ID is required");
    }

    if (!updateData || Object.keys(updateData).length === 0) {
      throw new ApiError(400, "No data to update");
    }

    // Prevent password update through this method (should use password change endpoint)
    delete updateData.password;
    delete updateData.refreshToken;

    const admin = await Admin.findById(adminId);
    if (!admin) {
      throw new ApiError(404, "Admin not found");
    }

    const updatedAdmin = await Admin.findByIdAndUpdate(adminId, updateData, {
      new: true,
      runValidators: true,
    }).select("-password -refreshToken");

    // Invalidate cache after update
    await cacheService.del(CACHE_KEYS.ADMIN_PROFILE(adminId));

    return updatedAdmin;
  }

  /**
   * Change admin password
   * @param {string} adminId - Admin ID
   * @param {string} oldPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<boolean>} Success indicator
   */
  async changePassword(adminId, oldPassword, newPassword) {
    if (!adminId || !oldPassword || !newPassword) {
      throw new ApiError(
        400,
        "Admin ID, old password, and new password are required",
      );
    }

    if (oldPassword === newPassword) {
      throw new ApiError(
        400,
        "New password must be different from old password",
      );
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      throw new ApiError(404, "Admin not found");
    }

    const isPasswordValid = await admin.isPasswordCorrect(oldPassword);
    if (!isPasswordValid) {
      throw new ApiError(401, "Invalid old password");
    }

    const hashedPassword = await bcryptjs.hash(newPassword, 10);
    await Admin.findByIdAndUpdate(adminId, { password: hashedPassword });

    return true;
  }

  /**
   * Create new admin
   * @param {object} adminData - Admin data
   * @param {string} creatorId - Admin ID who is creating this admin
   * @returns {Promise<object>} Created admin
   */
  async createAdmin(adminData, creatorId) {
    if (!adminData || !creatorId) {
      throw new ApiError(400, "Admin data and creator ID are required");
    }

    const { username, email, password, role = "STAFF" } = adminData;

    if (!username || !email || !password) {
      throw new ApiError(400, "Username, email, and password are required");
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({
      $or: [{ email }, { username }],
    });
    if (existingAdmin) {
      throw new ApiError(
        409,
        "Admin with this email or username already exists",
      );
    }

    // Create new admin
    const admin = await Admin.create({
      username,
      email,
      password,
      role,
      isActive: true,
    });

    // Log the action
    await AdminActionLog.create({
      adminId: creatorId,
      action: "CREATE_ADMIN",
      targetEntity: "ADMIN",
      targetId: admin._id,
      newValue: {
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
      metadata: { createdAdminId: admin._id },
    });

    const createdAdmin = await Admin.findById(admin._id).select("-password");

    return createdAdmin;
  }

  /**
   * Update admin details
   * @param {string} adminId - Admin ID to update
   * @param {object} updateData - Data to update
   * @param {string} updatedByAdminId - Admin ID who is making the update
   * @returns {Promise<object>} Updated admin
   */
  async updateAdmin(adminId, updateData, updatedByAdminId) {
    if (!adminId || !updatedByAdminId) {
      throw new ApiError(400, "Admin ID and updater admin ID are required");
    }

    if (!updateData || Object.keys(updateData).length === 0) {
      throw new ApiError(400, "No data to update");
    }

    // Prevent password update through this method
    delete updateData.password;
    delete updateData.refreshToken;

    const admin = await Admin.findById(adminId);
    if (!admin) {
      throw new ApiError(404, "Admin not found");
    }

    const oldValue = {
      username: admin.username,
      email: admin.email,
      role: admin.role,
      isActive: admin.isActive,
    };

    const updatedAdmin = await Admin.findByIdAndUpdate(adminId, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    // Log the action
    await AdminActionLog.create({
      adminId: updatedByAdminId,
      action: "UPDATE_ADMIN",
      targetEntity: "ADMIN",
      targetId: adminId,
      oldValue,
      newValue: {
        username: updatedAdmin.username,
        email: updatedAdmin.email,
        role: updatedAdmin.role,
        isActive: updatedAdmin.isActive,
      },
      metadata: { updatedAdminId: adminId },
    });

    return updatedAdmin;
  }

  /**
   * Get all admins
   * @returns {Promise<array>} List of all admins without passwords
   */
  async getAllAdmins() {
    const cacheKey = "admins:all";
    const admins = await cacheService.getOrSet(
      cacheKey,
      async () => {
        return await Admin.find({}).select("-password -refreshToken").lean();
      },
      CACHE_TTL.STUDENT_PROFILE, // 1 hour
    );
    return admins;
  }

  /**
   * Delete admin
   * @param {string} adminId - Admin ID to delete
   * @param {string} deletedByAdminId - Admin ID who is deleting
   * @returns {Promise<object>} Deleted admin info
   */
  async deleteAdmin(adminId, deletedByAdminId) {
    if (!adminId || !deletedByAdminId) {
      throw new ApiError(400, "Admin ID and deleter admin ID are required");
    }

    if (adminId === deletedByAdminId) {
      throw new ApiError(400, "Admin cannot delete their own account");
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      throw new ApiError(404, "Admin not found");
    }

    // Check if this is the last super admin
    if (admin.role === "SUPER_ADMIN") {
      const superAdminCount = await Admin.countDocuments({
        role: "SUPER_ADMIN",
      });
      if (superAdminCount <= 1) {
        throw new ApiError(400, "Cannot delete the last super admin");
      }
    }

    const deletedAdmin = await Admin.findByIdAndDelete(adminId);

    // Invalidate caches
    await cacheService.del(CACHE_KEYS.ADMIN_PROFILE(adminId));
    await cacheService.del("admins:all");

    // Log the action
    await AdminActionLog.create({
      adminId: deletedByAdminId,
      action: "DELETE_ADMIN",
      targetEntity: "ADMIN",
      targetId: adminId,
      oldValue: {
        username: deletedAdmin.username,
        email: deletedAdmin.email,
        role: deletedAdmin.role,
      },
      metadata: { deletedAdminId: adminId },
    });

    return deletedAdmin;
  }

  /**
   * Update last login timestamp
   * @param {string} adminId - Admin ID
   * @returns {Promise<boolean>} Success indicator
   */
  async updateLastLogin(adminId) {
    if (!adminId) {
      throw new ApiError(400, "Admin ID is required");
    }

    await Admin.findByIdAndUpdate(adminId, { lastLogin: new Date() });
    return true;
  }

  /**
   * Get action logs
   * @param {object} filters - Filter criteria
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {Promise<object>} Paginated action logs
   */
  async getActionLogs(filters = {}, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const filter = {};
    if (filters.adminId) filter.adminId = filters.adminId;
    if (filters.action) filter.action = filters.action;
    if (filters.targetEntity) filter.targetEntity = filters.targetEntity;

    const logs = await AdminActionLog.find(filter)
      .select("adminId action targetEntity targetId createdAt details")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await AdminActionLog.countDocuments(filter);

    const formattedLogs = logs.map((log) => ({
      id: log._id,
      admin: log.adminId,
      action: log.action,
      targetEntity: log.targetEntity,
      targetId: log.targetId,
      changes: {
        old: log.oldValue,
        new: log.newValue,
      },
      timestamp: log.createdAt,
    }));

    return {
      data: formattedLogs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Set admin public key
   * @param {string} adminId - Admin ID
   * @param {string} publicKey - Public key
   * @returns {Promise<boolean>} Success indicator
   */
  async setPublicKey(adminId, publicKey) {
    if (!adminId || !publicKey) {
      throw new ApiError(400, "Admin ID and public key are required");
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      throw new ApiError(404, "Admin not found");
    }

    await Admin.findByIdAndUpdate(adminId, { publicKey });
    return true;
  }

  /**
   * Set admin key backup
   * @param {string} adminId - Admin ID
   * @param {object} backupData - Key backup data
   * @returns {Promise<boolean>} Success indicator
   */
  async setKeyBackup(adminId, backupData) {
    if (!adminId || !backupData) {
      throw new ApiError(400, "Admin ID and backup data are required");
    }

    const {
      encryptedPrivateKey,
      salt,
      iv,
      version = 1,
      publicKey,
    } = backupData;

    if (!encryptedPrivateKey || !salt || !iv || !publicKey) {
      throw new ApiError(
        400,
        "encryptedPrivateKey, salt, iv, and publicKey are required",
      );
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      throw new ApiError(404, "Admin not found");
    }

    await Admin.findByIdAndUpdate(adminId, {
      publicKey,
      encryptedPrivateKey,
      keyBackupSalt: salt,
      keyBackupIv: iv,
      keyBackupVersion: version,
      keyBackupUpdatedAt: new Date(),
    });

    return true;
  }

  /**
   * Get admin key backup
   * @param {string} adminId - Admin ID
   * @returns {Promise<object>} Key backup data
   */
  async getKeyBackup(adminId) {
    if (!adminId) {
      throw new ApiError(400, "Admin ID is required");
    }

    const admin = await Admin.findById(adminId).select(
      "publicKey encryptedPrivateKey keyBackupSalt keyBackupIv keyBackupVersion",
    );

    if (!admin) {
      throw new ApiError(404, "Admin not found");
    }

    if (
      !admin.encryptedPrivateKey ||
      !admin.keyBackupSalt ||
      !admin.keyBackupIv
    ) {
      throw new ApiError(404, "Key backup not found");
    }

    return {
      publicKey: admin.publicKey,
      encryptedPrivateKey: admin.encryptedPrivateKey,
      salt: admin.keyBackupSalt,
      iv: admin.keyBackupIv,
      version: admin.keyBackupVersion ?? 1,
    };
  }
}

export default new AdminService();
