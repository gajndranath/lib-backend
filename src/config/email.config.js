import nodemailer from "nodemailer";
import { ApiError } from "../utils/ApiError.js";

let transporter = null;
let emailAvailable = false;
let initializationPromise = null; // Add this to track initialization state

/**
 * ✅ Fixed Retry Logic for Email Initialization
 */
const retryEmailInit = async (maxRetries = 3, delay = 3000) => {
  const host = process.env.EMAIL_HOST || "smtp.gmail.com";
  const user = process.env.EMAIL_USER || "gurukullibrerysrnt@gmail.com";
  const pass = process.env.EMAIL_PASSWORD || "bkmyiwqnhpobedto"; // Ensure no spaces

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📧 Email init attempt ${attempt}/${maxRetries}...`);
      
      const transportConfig = {
        service: "gmail",
        host: host,
        port: 465, // Port 465 is more stable on Render for Gmail
        secure: true, 
        auth: {
          user: user,
          pass: pass.replace(/\s+/g, ""), // Automatically removes any spaces
        },
        pool: true,
        maxConnections: 3,
        connectionTimeout: 20000, 
        greetingTimeout: 20000,
        socketTimeout: 30000,
        debug: true,
        logger: true,
        tls: {
          rejectUnauthorized: false, // Prevents certificate handshake issues in cloud environments
          servername: host
        },
      };

      transporter = nodemailer.createTransport(transportConfig);

      // Verify connection immediately
      await new Promise((resolve, reject) => {
        transporter.verify((error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      console.log(`✅ Email server verified & ready (attempt ${attempt}/${maxRetries})`);
      emailAvailable = true;
      return true; // Success!

    } catch (error) {
      console.error(
        `❌ Email init failed (attempt ${attempt}/${maxRetries}):`,
        error.code || error.message
      );

      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.error("❌ All email initialization attempts failed.");
        emailAvailable = false;
        transporter = null;
      }
    }
  }
  return false;
};

export const initializeEmail = async () => {
  // If already initialized, return existing transporter
  if (transporter && emailAvailable) {
    return transporter;
  }
  
  // If initialization is in progress, wait for it
  if (initializationPromise) {
    return initializationPromise;
  }

  try {
    const user = process.env.EMAIL_USER || "gurukullibrerysrnt@gmail.com";
    const pass = process.env.EMAIL_PASSWORD || "bkmyiwqnhpobedto";

    if (!user || !pass) {
      console.warn("⚠️ Email configuration missing. Email functionality disabled.");
      return null;
    }

    initializationPromise = retryEmailInit(3, 3000);
    await initializationPromise;

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
  } finally {
    initializationPromise = null;
  }
};

export const getEmailTransporter = () => transporter;

export const sendEmail = async (to, subject, text, html = null) => {
  try {
    if (process.env.EMAIL_DISABLED === "true") {
      console.log("📧 Email service disabled by config");
      return { success: false, error: "Email service disabled", skipped: true };
    }

    // Ensure transporter is initialized
    let mailTransporter = getEmailTransporter();
    
    // If not initialized, try to initialize now
    if (!mailTransporter) {
      console.log("📧 Transporter not initialized, attempting to initialize now...");
      mailTransporter = await initializeEmail();
      
      if (!mailTransporter) {
        throw new Error("Failed to initialize email transporter");
      }
    }

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || "Gurukal Library"}" <${process.env.EMAIL_USER || "gurukullibrerysrnt@gmail.com"}>`,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject: subject,
      text: text,
      html: html || `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #4f46e5;">Gurukal Library</h2>
          <p style="white-space: pre-wrap;">${text}</p>
          <hr />
          <p style="font-size: 12px; color: #666;">© ${new Date().getFullYear()} Library Management System</p>
        </div>
      `,
    };

    console.log(`📧 Attempting to send email to: ${to}`);
    const info = await mailTransporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email sending error:", {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response
    });
    
    // If error is due to transporter, reset it
    if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      transporter = null;
      emailAvailable = false;
    }
    
    return { success: false, error: error.message };
  }
};

export const sendTemplateEmail = async (to, templateName, data) => {
  const templates = {
    PAYMENT_REMINDER: {
      subject: `Payment Reminder - ${data.monthYear}`,
      text: `Dear ${data.studentName},\n\nThis is a reminder for your pending payment of ₹${data.amount} for ${data.monthYear}.`,
    },
    PAYMENT_CONFIRMATION: {
      subject: `Payment Received - ${data.monthYear}`,
      text: `Dear ${data.studentName},\n\nThank you for your payment of ₹${data.amount} for ${data.monthYear}.`,
    },
    STUDENT_REGISTRATION: {
      subject: `Welcome to Our Library - ${data.studentName}`,
      text: `Dear ${data.studentName},\n\nWelcome! Your Student ID is: ${data.studentId}`,
    },
  };

  const template = templates[templateName];
  if (!template) throw new ApiError(400, `Template ${templateName} not found`);

  return await sendEmail(to, template.subject, template.text);
};