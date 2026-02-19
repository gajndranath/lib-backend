import nodemailer from "nodemailer";
import { ApiError } from "../utils/ApiError.js";

let transporter = null;
let emailAvailable = false;

// ✅ Retry logic for email initialization
const retryEmailInit = async (maxRetries = 3, delay = 2000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📧 Email init attempt ${attempt}/${maxRetries}...`);

      const host = process.env.EMAIL_HOST || process.env.SMTP_HOST;
      const user = process.env.EMAIL_USER || process.env.SMTP_USER;
      const pass = process.env.EMAIL_PASSWORD || process.env.SMTP_PASS;
      const envPort = process.env.EMAIL_PORT || process.env.SMTP_PORT;

      console.log(`📧 Creating transporter for ${user} (Host: ${host})`);

      const transportConfig = {
        auth: {
          user: user,
          pass: pass,
        },
        connectionTimeout: 60000, // 1 minute connection timeout
        greetingTimeout: 60000,
        socketTimeout: 60000,
        pool: true,
        maxConnections: 3,
        maxMessages: 100,
        debug: true,
        logger: true,
        tls: {
          rejectUnauthorized: false, // Helps with some cloud network cert issues
          minVersion: "TLSv1.2",
          servername: host
        },
      };

      // ✅ Gmail-specific service optimization
      // When 'service' is used, Nodemailer ignores host/port and handles everything optimally
      if (host.toLowerCase().includes("gmail.com") || user.toLowerCase().includes("@gmail.com")) {
        console.log("📧 Using Nodemailer 'gmail' service relay...");
        transportConfig.service = "gmail";
      } else {
        transportConfig.host = host;
        transportConfig.port = port;
        transportConfig.secure = isSecure;
      }

      transporter = nodemailer.createTransport(transportConfig);

      // ✅ Async verification (Non-blocking)
      transporter.verify((error) => {
        if (error) {
          console.error(
            `❌ Email lazy-verification failed (attempt ${attempt}/${maxRetries}):`,
            error.code || error.message,
          );
        } else {
          console.log(`✅ Email server verified & ready (attempt ${attempt}/${maxRetries})`);
          emailAvailable = true;
        }
      });

      // ✅ Success if transporter is created, even if verify takes longer
      return true;

      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch (error) {
      console.error(
        `❌ Email initialization error (attempt ${attempt}/${maxRetries}):`,
        error.message,
      );

      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  return false;
};

export const initializeEmail = async () => {
  try {
    const host = process.env.EMAIL_HOST || process.env.SMTP_HOST;
    const user = process.env.EMAIL_USER || process.env.SMTP_USER;
    const pass = process.env.EMAIL_PASSWORD || process.env.SMTP_PASS;
    const envPort = process.env.EMAIL_PORT || process.env.SMTP_PORT;

    if (!host || !user || !pass) {
      console.warn(
        "⚠️ Email configuration missing (Host/User/Pass). Email functionality will be disabled.",
      );
      emailAvailable = false;
      return null;
    }

    // ✅ Try to initialize with retries
    await retryEmailInit(3, 3000);

    // ✅ FORCE ENABLE if we have a transporter instance
    // This allows lazy sending even if initial verify timed out
    if (transporter) {
      emailAvailable = true;
      console.log("📧 Email transporter is active (allowing outbound attempts)");
    } else {
      emailAvailable = false;
      console.warn("❌ Failed to create email transporter. Outbound emails disabled.");
    }

    // ✅ Close on shutdown
    process.on("SIGTERM", () => {
      if (transporter) {
        transporter.close();
        console.log("✅ Email transporter closed");
      }
    });

    return transporter;
  } catch (error) {
    console.error("❌ Email initialization error:", error.message);
    emailAvailable = false;
    transporter = null;
    return null;
  }
};

export const isEmailAvailable = () => {
  return emailAvailable;
};

export const getEmailTransporter = () => {
  if (!transporter) {
    return null;
  }
  return transporter;
};

export const sendEmail = async (to, subject, text, html = null) => {
  try {
    const host = process.env.EMAIL_HOST || process.env.SMTP_HOST;
    const user = process.env.EMAIL_USER || process.env.SMTP_USER;
    
    console.log(`📧 sendEmail called: to=${to}, subject="${subject}"`);
    console.log(`📧 Config - HOST: ${host}, USER: ${user}`);

    if (process.env.EMAIL_DISABLED === "true") {
      console.warn("📧 Email disabled, skipping send:", { to, subject });
      return { success: false, error: "Email service disabled", skipped: true };
    }

    const mailTransporter = getEmailTransporter();
    if (!mailTransporter) {
      console.error("❌ Email transporter not available!");
      console.error("❌ emailAvailable:", emailAvailable);
      console.error("❌ transporter:", transporter);
      // ✅ Don't fail the app if email is unavailable
      return {
        success: false,
        error: "Email service not initialized",
        skipped: true,
      };
    }

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Library System"}" <${
        process.env.EMAIL_FROM || process.env.EMAIL_USER
      }>`,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject: subject,
      text: text,
    };

    if (html) {
      mailOptions.html = html;
    } else {
      // Default HTML template
      mailOptions.html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4f46e5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            .button { background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Gurukal Library</h1>
            </div>
            <div class="content">
              ${text.replace(/\n/g, "<br>")}
            </div>
            <div class="footer">
              <p>This is an automated message. Please do not reply to this email.</p>
              <p>&copy; ${new Date().getFullYear()} Library Management System by Gajendra Nath Tripathi. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    console.log(`📧 Attempting to send email via SMTP to ${to}...`);
    const info = await mailTransporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email sending error:", error.code || error.message);
    // ✅ Don't throw error - return gracefully
    // Email failure should not break the app
    return {
      success: false,
      error: error.message,
      code: error.code,
      skipped: true,
    };
  }
};

export const sendTemplateEmail = async (to, templateName, data) => {
  const templates = {
    PAYMENT_REMINDER: {
      subject: `Payment Reminder - ${data.monthYear}`,
      text: `Dear ${data.studentName},\n\nThis is a reminder for your pending payment of ₹${data.amount} for ${data.monthYear}.\n\nPlease make the payment at your earliest convenience.\n\nThank you,\nLibrary Management System`,
    },
    PAYMENT_CONFIRMATION: {
      subject: `Payment Received - ${data.monthYear}`,
      text: `Dear ${data.studentName},\n\nThank you for your payment of ₹${data.amount} for ${data.monthYear}. Your payment has been successfully recorded.\n\nReceipt Number: ${data.receiptNumber}\nPayment Date: ${data.paymentDate}\n\nThank you,\nLibrary Management System`,
    },
    OVERDUE_ALERT: {
      subject: `URGENT: Overdue Payment - ${data.monthYear}`,
      text: `Dear ${data.studentName},\n\nYour payment of ₹${data.amount} for ${data.monthYear} is now overdue.\n\nPlease clear your dues immediately to avoid any inconvenience.\n\nThank you,\nLibrary Management System`,
    },
    STUDENT_REGISTRATION: {
      subject: `Welcome to Our Library - ${data.studentName}`,
      text: `Dear ${data.studentName},\n\nWelcome to our library! Your registration is complete.\n\nStudent ID: ${data.studentId}\nSlot: ${data.slotName}\nMonthly Fee: ₹${data.monthlyFee}\n\nPlease visit the library to complete the formalities.\n\nThank you,\nLibrary Management System`,
    },
  };

  const template = templates[templateName];
  if (!template) {
    throw new ApiError(400, `Email template '${templateName}' not found`);
  }

  return await sendEmail(to, template.subject, template.text);
};
