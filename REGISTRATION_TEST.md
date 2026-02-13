# Registration Testing Guide

## ✅ Two Registration Flows

### 1. Student Self-Registration

**Endpoint:** `POST /api/v1/student-auth/register`

**Body:**

```json
{
  "name": "Gajendra Nath Tripathi",
  "email": "gajendra.tripathi.me@gmail.com",
  "phone": "9721567165",
  "address": "Sarnath",
  "fatherName": "Jagmohan Tripathi"
}
```

**Expected:**

- ✅ Student created with `status: INACTIVE`
- ✅ No `slotId` required
- ✅ No billing setup
- ✅ OTP sent to email for verification
- ✅ `emailVerified: false`

**After OTP Verification:**

```json
POST /api/v1/student-auth/verify-otp
{
  "email": "gajendra.tripathi.me@gmail.com",
  "otp": "123456",
  "setPassword": "password123"
}
```

- ✅ `emailVerified: true`
- ✅ Password set
- ✅ Returns access token
- ⚠️ Still `status: INACTIVE` (until admin assigns slot)

---

### 2. Admin Student Creation

**Endpoint:** `POST /api/v1/students`
**Requires:** Admin JWT token

**Body:**

```json
{
  "name": "Test Student",
  "email": "test@example.com",
  "phone": "9876543210",
  "address": "Test Address",
  "fatherName": "Father Name",
  "slotId": "VALID_SLOT_ID_HERE",
  "monthlyFee": 1500,
  "joiningDate": "2026-02-05",
  "billingDay": 1,
  "status": "ACTIVE"
}
```

**Expected:**

- ✅ Student created with `status: ACTIVE`
- ✅ `slotId` required and validated
- ✅ Slot capacity checked
- ✅ Billing record created
- ✅ Admin action logged
- ✅ No OTP sent (admin-created, direct activation)

---

## Key Differences

| Feature            | Self-Registration          | Admin Creation |
| ------------------ | -------------------------- | -------------- |
| SlotId             | ❌ Optional                | ✅ Required    |
| Initial Status     | INACTIVE                   | ACTIVE         |
| Email Verification | Required (OTP)             | Not required   |
| Billing Setup      | Later (when slot assigned) | Immediate      |
| Password           | Set during verification    | Optional       |

---

## Admin Workflow After Self-Registration

1. Student self-registers → Status = INACTIVE
2. Student verifies email → emailVerified = true
3. Admin reviews in dashboard
4. Admin assigns slot via `PATCH /api/v1/students/:id/slot`
5. System creates billing records
6. Status changes to ACTIVE

---

## Testing Checklist

- [x] Model allows optional slotId
- [x] Model allows optional billingDay/nextBillingDate
- [x] Self-registration doesn't require slot
- [x] Admin registration requires slot
- [x] Email OTP sends successfully
- [x] Proper status enum (INACTIVE not "inactive")
