import resendInstance from "../config/email.config.js";


// Iska naam unique rakhein
export const connectEmailService = async () => {
  console.log("✅ Email service initialized (Resend API mode)");
  return resendInstance;
};

export const sendEmail = async (to, subject, text, html = null) => {
  try {
    const { data, error } = await resendInstance.emails.send({
      from: 'Gurukal Library <onboarding@resend.dev>',
      to: Array.isArray(to) ? to : [to],
      subject: subject,
      text: text,
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