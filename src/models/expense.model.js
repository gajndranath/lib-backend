import mongoose, { Schema } from "mongoose";

const expenseSchema = new Schema(
  {
    khatabookId: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: [
        "RENT",
        "ELECTRICITY",
        "INTERNET",
        "MAINTENANCE",
        "SALARY",
        "MARKETING",
        "FURNITURE",
        "STATIONERY",
        "REFRESHMENTS",
        "MISCELLANEOUS",
      ],
      default: "MISCELLANEOUS",
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ["CASH", "ONLINE", "CHEQUE", "UPI", "CARD", "NET_BANKING"],
      default: "CASH",
    },
    date: {
      type: Date,
      default: Date.now,
      required: true,
    },
    paidBy: {
      type: String, // Name of the person who paid (optional)
      trim: true,
    },
    receiptUrl: {
      type: String, // URL to uploaded receipt image
      trim: true,
    },
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Library",
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for common queries
expenseSchema.index({ tenantId: 1, date: -1 });
expenseSchema.index({ tenantId: 1, category: 1 });

export const Expense = mongoose.model("Expense", expenseSchema);
