// models/admin.model.js
import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const adminSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    refreshToken: { type: String },
    fcmToken: { type: String },
    webPushSubscription: { type: Schema.Types.Mixed },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "STAFF"],
      default: "STAFF", // Default to STAFF, first admin becomes SUPER_ADMIN
    },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sound: { type: Boolean, default: true },
      vibration: { type: Boolean, default: true },
    },
    lastLogin: { type: Date },
    lastActive: { type: Date },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

// Password hashing before saving
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Static method to check if this is the first admin
adminSchema.statics.isFirstAdmin = async function () {
  const count = await this.countDocuments();
  return count === 0;
};

// Password verification method
adminSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// Token Generation Methods
adminSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      role: this.role,
      username: this.username,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
  );
};

adminSchema.methods.generateRefreshToken = function () {
  return jwt.sign({ _id: this._id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
  });
};

// Update last active
adminSchema.methods.updateLastActive = function () {
  this.lastActive = new Date();
  return this.save();
};

// Check if admin is super admin
adminSchema.methods.isSuperAdmin = function () {
  return this.role === "SUPER_ADMIN";
};

// Check if admin can create other admins
adminSchema.methods.canCreateAdmins = function () {
  return this.role === "SUPER_ADMIN";
};

export const Admin = mongoose.model("Admin", adminSchema);
