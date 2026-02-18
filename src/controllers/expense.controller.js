import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Expense } from "../models/expense.model.js";

// Create new expense
export const createExpense = asyncHandler(async (req, res) => {
  const { amount, description, category, paymentMethod, date, paidBy } =
    req.body;

  if (!amount || !description) {
    throw new ApiError(400, "Amount and description are required");
  }

  const expense = await Expense.create({
    amount,
    description,
    category: category || "MISCELLANEOUS",
    paymentMethod: paymentMethod || "CASH",
    date: date || new Date(),
    paidBy,
    tenantId: req.tenantId,
    createdBy: req.admin._id,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, expense, "Expense created successfully"));
});

// Get all expenses with filtering and pagination
export const getExpenses = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    category,
    startDate,
    endDate,
    search,
  } = req.query;

  const query = { tenantId: req.tenantId }; // Tenant isolation

  // Filters
  if (category) {
    query.category = category;
  }

  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }

  if (search) {
    query.description = { $regex: search, $options: "i" };
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [expenses, total] = await Promise.all([
    Expense.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("createdBy", "username name")
      .lean(),
    Expense.countDocuments(query),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        expenses,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
      "Expenses fetched successfully"
    )
  );
});

// Get expense statistics (Dashboard)
export const getExpenseStats = asyncHandler(async (req, res) => {
  const { month, year } = req.query;

  const currentDate = new Date();
  const targetYear = year ? parseInt(year) : currentDate.getFullYear();
  const targetMonth = month ? parseInt(month) : currentDate.getMonth();

  const startOfMonth = new Date(targetYear, targetMonth, 1);
  const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

  const stats = await Expense.aggregate([
    {
      $match: {
        tenantId: req.tenantId, // Tenant isolation
        date: { $gte: startOfMonth, $lte: endOfMonth },
      },
    },
    {
      $group: {
        _id: "$category",
        totalAmount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { totalAmount: -1 },
    },
  ]);

  const totalExpense = stats.reduce((sum, item) => sum + item.totalAmount, 0);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        month: targetMonth,
        year: targetYear,
        totalExpense,
        categoryBreakdown: stats,
      },
      "Expense stats fetched successfully"
    )
  );
});

// Update expense
export const updateExpense = asyncHandler(async (req, res) => {
  const { expenseId } = req.params;
  const updates = req.body;

  const expense = await Expense.findOne({
    _id: expenseId,
    tenantId: req.tenantId, // Tenant isolation check
  });

  if (!expense) {
    throw new ApiError(404, "Expense not found");
  }

  // Update fields
  Object.keys(updates).forEach((key) => {
    if (updates[key] !== undefined && key !== "_id" && key !== "tenantId") {
      expense[key] = updates[key];
    }
  });

  await expense.save();

  return res
    .status(200)
    .json(new ApiResponse(200, expense, "Expense updated successfully"));
});

// Delete expense
export const deleteExpense = asyncHandler(async (req, res) => {
  const { expenseId } = req.params;

  const expense = await Expense.findOneAndDelete({
    _id: expenseId,
    tenantId: req.tenantId, // Tenant isolation check
  });

  if (!expense) {
    throw new ApiError(404, "Expense not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, null, "Expense deleted successfully"));
});
