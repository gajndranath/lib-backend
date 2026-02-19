import resend from "../config/email.config.js";
import { ApiError } from "../utils/ApiError.js";

export const initializeEmail = async () => {
  // API mode mein complex verification ki zaroorat nahi hoti
  console.log("✅ Email service initialized (Resend API mode)");
  return resend;
};

export const sendEmail = async (to, subject, text, html = null) => {
  try {
    if (process.env.EMAIL_DISABLED === "true") return { success: false, skipped: true };

    const { data, error } = await resend.emails.send({
      from: 'Gurukal Library <onboarding@resend.dev>',
      to: Array.isArray(to) ? to : [to],
      subject: subject,
      text: text,
      html: html || `<div style="font-family: sans-serif; padding: 20px;">${text}</div>`,
    });

    if (error) throw error;
    console.log(`✅ Email sent via Resend API: ${data.id}`);
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error("❌ Email sending error:", error.message);
    return { success: false, error: error.message };
  }
};

export const sendTemplateEmail = async (to, templateName, data) => {
  const templates = {
    PAYMENT_REMINDER: {
      subject: `Payment Reminder - ${data.monthYear}`,
      text: `Dear ${data.studentName}, your payment of ₹${data.amount} for ${data.monthYear} is pending.`,
    },
    PAYMENT_CONFIRMATION: {
      subject: `Payment Received - ${data.monthYear}`,
      text: `Dear ${data.studentName}, thank you for your payment of ₹${data.amount}.`,
    },
    STUDENT_REGISTRATION: {
      subject: `Welcome to Our Library`,
      text: `Dear ${data.studentName}, welcome! Your ID is: ${data.studentId}`,
    },
  };

  const template = templates[templateName];
  if (!template) throw new ApiError(400, `Template ${templateName} not found`);

  return await sendEmail(to, template.subject, template.text);
};