// Add these imports at the TOP of your email.config.js
import ResendApiService from "../services/resendApi.service.js";

// **MODIFY your existing initializeEmail function** - find it and update:
export const initializeEmail = async () => {
  console.log("\n📧 ===== EMAIL SERVICE INITIALIZATION =====");
  console.log(`📧 Node Version: ${process.version}`);
  console.log(`📧 Platform: ${process.platform}`);
  console.log(`📧 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`📧 PID: ${process.pid}`);
  if (process.env.EMAIL_DISABLED === "true") {
    console.warn("⚠️ Email service disabled via EMAIL_DISABLED=true");
    return null;
  }
  // No SMTP or Brevo fallback, only Resend is used
  return true;
};

// **MODIFY your existing sendEmail function** - find it and update:
export const sendEmail = async (to, subject, text, html = null) => {
  try {
    if (process.env.EMAIL_DISABLED === "true") {
      console.warn("📧 Email disabled, skipping send:", { to, subject });
      return { success: false, error: "Email service disabled", skipped: true };
    }

    // ✅ Use Resend API for all transactional emails
    const apiResult = await ResendApiService.sendEmail(to, subject, text, html);
    if (apiResult.success) {
      return apiResult;
    }
    // If fail, return error
    return {
      success: false,
      error: "All email methods failed",
      skipped: true,
    };
  } catch (error) {
    console.error("❌ Email sending error:", {
      to,
      subject,
      errorCode: error.code || "N/A",
      errorMessage: error.message,
    });
    return {
      success: false,
      error: error.message,
      code: error.code,
      skipped: true,
    };
  }
};

// Send template-based email (wrapper for sendEmail)
export const sendTemplateEmail = async (to, templateType, templateData) => {
  // You can expand this logic to use different templates based on templateType
  let subject = "";
  let text = "";
  let html = null;

  switch (templateType) {
    case "PAYMENT_REMINDER":
      subject = `Payment Reminder - ${templateData.monthYear}`;
      text = `Dear ${templateData.studentName},\nYour payment of ₹${templateData.amount} for ${templateData.monthYear} is pending.`;
      break;
    case "PAYMENT_CONFIRMATION":
      subject = `Payment Confirmation - ${templateData.monthYear}`;
      text = `Dear ${templateData.studentName},\nPayment of ₹${templateData.amount} for ${templateData.monthYear} received. Receipt: ${templateData.receiptNumber}. Date: ${templateData.paymentDate}`;
      break;
    case "OVERDUE_ALERT":
      subject = `Overdue Alert - ${templateData.monthYear}`;
      text = `Dear ${templateData.studentName},\nYour payment of ₹${templateData.amount} for ${templateData.monthYear} is overdue. Please pay soon.`;
      break;
    default:
      subject = templateType;
      text = JSON.stringify(templateData);
  }

  // Optionally, you can generate a custom HTML template here
  // For now, just use the default sendEmail template
  return sendEmail(to, subject, text, html);
};
