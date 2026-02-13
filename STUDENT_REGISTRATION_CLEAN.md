# Student Registration & Login - Clean Architecture

## ✅ Refactored & Cleaned

### 📁 File Structure

```
backend/src/
├── utils/
│   └── studentHelpers.js          ✅ NEW - Shared utilities
├── controllers/
│   └── studentAuth.controller.js  ✅ CLEANED - Student self-service
├── services/
│   └── student.service.js         ✅ CLEANED - Admin operations
└── models/
    └── student.model.js           ✅ UPDATED - Flexible schema
```

---

## 🔄 Two Distinct Flows

### 1️⃣ Student Self-Registration (`/api/v1/student-auth/register`)

**Controller:** `studentAuth.controller.js → registerStudent()`

**Flow:**

```
1. Student submits: name, email, phone, address, fatherName
2. System checks email & phone uniqueness
3. Generates libraryId (LIB0001, LIB0002, etc.)
4. Creates student with:
   - status: INACTIVE
   - emailVerified: false
   - NO slotId (optional in model)
   - NO billing setup
5. Generates 6-digit OTP
6. Sends verification email
7. Returns: { email, libraryId, message }
```

**Required Fields:**

- ✅ name (2-100 chars)
- ✅ email (valid format)
- ✅ phone (10 digits, unique)
- ⚪ address (optional)
- ⚪ fatherName (optional)

**Response:**

```json
{
  "statusCode": 201,
  "success": true,
  "data": {
    "email": "student@example.com",
    "libraryId": "LIB0042",
    "message": "Check your email for verification code"
  },
  "message": "Registration successful. Please verify your email."
}
```

---

### 2️⃣ Admin Student Creation (`/api/v1/students` - POST)

**Service:** `student.service.js → registerStudent()`

**Flow:**

```
1. Admin submits: full student data including slotId
2. System checks email & phone uniqueness
3. Validates slot exists & has capacity
4. Generates libraryId
5. Creates student with:
   - status: ACTIVE (or as specified)
   - emailVerified: false (admin can verify later)
   - slotId: REQUIRED
   - monthlyFee, billingDay, nextBillingDate
6. Creates monthly fee record
7. Logs admin action
8. Returns: created student
```

**Required Fields:**

- ✅ name
- ✅ phone (unique)
- ✅ slotId (validated)
- ✅ monthlyFee
- ✅ joiningDate
- ✅ billingDay (1-31)
- ✅ status (ACTIVE/INACTIVE)
- ⚪ email (optional but recommended)
- ⚪ address, fatherName (optional)

**Response:**

```json
{
  "statusCode": 201,
  "success": true,
  "data": {
    "_id": "...",
    "libraryId": "LIB0042",
    "name": "Test Student",
    "phone": "9876543210",
    "slotId": "...",
    "status": "ACTIVE",
    ...
  },
  "message": "Student registered successfully"
}
```

---

## 🔧 Shared Utilities (`studentHelpers.js`)

### Functions:

1. **`generateLibraryId()`**
   - Auto-increments from last student
   - Format: LIB0001, LIB0002, etc.
   - Used by BOTH flows

2. **`generateOtp()`**
   - 6-digit random number
   - Used for email verification

3. **`hashOtp(otp)`**
   - SHA-256 hash for secure storage
   - Never store plain OTP

4. **`checkEmailExists(email)`**
   - Case-insensitive email check
   - Returns existing student or null

5. **`checkPhoneExists(phone)`**
   - Phone uniqueness check
   - Returns existing student or null

---

## 📊 Student Model Schema (Updated)

```javascript
{
  // ✅ Always Required
  name: String (required),
  phone: String (required, unique),
  libraryId: String (auto-generated),

  // ✅ Optional (student self-reg)
  slotId: ObjectId (optional - assigned by admin later),
  billingDay: Number (optional - set when slot assigned),
  nextBillingDate: Date (optional - calculated when slot assigned),

  // ✅ Defaults
  status: INACTIVE (student) | ACTIVE (admin),
  emailVerified: false,
  monthlyFee: 0 (student) | set by admin,

  // ✅ Optional Fields
  email: String,
  password: String,
  address: String,
  fatherName: String
}
```

---

## 🎯 Key Differences

| Feature                 | Student Self-Registration       | Admin Creation               |
| ----------------------- | ------------------------------- | ---------------------------- |
| **Endpoint**            | `/api/v1/student-auth/register` | `/api/v1/students`           |
| **Authentication**      | ❌ Public                       | ✅ Admin JWT Required        |
| **SlotId**              | ❌ Not required                 | ✅ Required & Validated      |
| **Initial Status**      | INACTIVE                        | ACTIVE (or specified)        |
| **Email Verification**  | ✅ OTP Sent                     | ⚪ Optional                  |
| **Billing Setup**       | ❌ Later                        | ✅ Immediate                 |
| **Fee Record**          | ❌ Not created                  | ✅ Created for current month |
| **Admin Log**           | ❌ No                           | ✅ Yes                       |
| **Slot Capacity Check** | ❌ N/A                          | ✅ Yes                       |

---

## ✅ No Duplicate Logic

### Before Refactor:

- ❌ LibraryId generation duplicated
- ❌ Email/phone checks duplicated
- ❌ OTP generation duplicated
- ❌ Mixed validation logic

### After Refactor:

- ✅ Shared utilities in `studentHelpers.js`
- ✅ Clear separation: auth vs admin
- ✅ Single source of truth
- ✅ Reusable functions

---

## 🔐 Security

1. **OTP Handling:**
   - ✅ Hashed with SHA-256
   - ✅ 10-minute expiration
   - ✅ One-time use
   - ✅ Cleared after verification

2. **Password:**
   - ✅ Bcrypt hashing (model pre-save hook)
   - ✅ Set during OTP verification
   - ✅ Never exposed in responses

3. **Email Validation:**
   - ✅ Case-insensitive storage
   - ✅ Uniqueness enforced
   - ✅ Verified before full access

---

## 📝 Complete User Journey

### Student Path:

```
1. POST /register → { email, phone, name }
2. Check email → Find OTP (123456)
3. POST /verify-otp → { email, otp, setPassword }
4. ✅ Account verified → Can login
5. ⏳ Status: INACTIVE (until admin assigns slot)
6. Admin assigns slot → Status: ACTIVE
7. Billing starts
```

### Admin Path:

```
1. POST /students → { full data + slotId }
2. ✅ Student created with ACTIVE status
3. ✅ Billing starts immediately
4. Student can login (if email/password set)
```

---

## 🧪 Testing

### Test Student Registration:

```bash
POST http://localhost:8000/api/v1/student-auth/register
{
  "name": "Test Student",
  "email": "test@example.com",
  "phone": "9876543210",
  "address": "Test Address",
  "fatherName": "Father Name"
}
```

### Test Admin Creation:

```bash
POST http://localhost:8000/api/v1/students
Authorization: Bearer <ADMIN_TOKEN>
{
  "name": "Admin Created",
  "email": "admin@example.com",
  "phone": "9123456789",
  "slotId": "<VALID_SLOT_ID>",
  "monthlyFee": 1500,
  "joiningDate": "2026-02-05",
  "billingDay": 1,
  "status": "ACTIVE"
}
```

---

## ✅ Checklist

- [x] No duplicate logic between flows
- [x] Shared utilities extracted
- [x] Clear code comments & sections
- [x] Phone required & unique validation
- [x] Email optional but unique if provided
- [x] LibraryId auto-generation
- [x] OTP email verification
- [x] Proper status enum (INACTIVE/ACTIVE)
- [x] Slot validation for admin flow
- [x] Billing created for admin flow
- [x] Clean separation of concerns

**Status: ✅ PRODUCTION READY**
