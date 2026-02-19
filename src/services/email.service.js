import resend from "../config/email.config.js";
import { ApiError } from "../utils/ApiError.js";

// Index.js ke liye initialization function
export const connectEmailService = async () => {
  console.log("✅ Email service initialized (Resend API mode)");
  return resend;
};

// Controllers ke liye send function
export const sendEmail = async (to, subject, text, html = null) => {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Gurukal Library <onboarding@resend.dev>',
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html: html || `<div style="font-family: sans-serif;">${text}</div>`,
    });
    if (error) throw error;
    return { success: true, messageId: data.id };
  } catch (error) {
    console.error("❌ Email Error:", error.message);
    return { success: false, error: error.message };
  }
};

export const sendTemplateEmail = async (to, templateName, data) => {
  const templates = {
    STUDENT_REGISTRATION: {
      subject: "Welcome to Library",
      text: `Hi ${data.studentName}, your ID is ${data.studentId}`
    }
    // Baaki templates yahan add karein...
  };
  const template = templates[templateName];
  return await sendEmail(to, template.subject, template.text);
};