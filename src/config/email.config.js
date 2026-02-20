// Add these imports at the TOP of your email.config.js
import BrevoApiService from "../services/brevoApi.service.js";

// Add these variables near your other variables
let brevoApiAvailable = false;
let emailAvailable = false;
let transporter = null;

// Helper to get the current transporter (if SMTP is available)
function getEmailTransporter() {
  return transporter;
}

// Helper to retry SMTP initialization
async function retryEmailInit(retries, delay) {
  for (let i = 0; i < retries; i++) {
    try {
      // Dynamically import nodemailer to avoid issues if not installed
      const nodemailer = (await import("nodemailer")).default;
      transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT) : 587,
        secure: process.env.EMAIL_SECURE === "true", // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
      });
      // Verify connection
      await transporter.verify();
      return true;
    } catch (err) {
      console.warn(`SMTP init attempt ${i + 1} failed:`, err.message);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  return false;
}

// Add this function to initialize Brevo API
export const initializeBrevoApi = async () => {
  try {
    await BrevoApiService.initialize();
    brevoApiAvailable = BrevoApiService.isAvailable();
    return brevoApiAvailable;
  } catch (error) {
    console.error("❌ Failed to initialize Brevo API:", error.message);
    brevoApiAvailable = false;
    return false;
  }
};

// **MODIFY your existing initializeEmail function** - find it and update:
export const initializeEmail = async () => {
  try {
    console.log("\n📧 ===== EMAIL SERVICE INITIALIZATION =====");
    console.log(`📧 Node Version: ${process.version}`);
    console.log(`📧 Platform: ${process.platform}`);
    console.log(`📧 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`📧 PID: ${process.pid}`);

    // Check if email is disabled
    if (process.env.EMAIL_DISABLED === "true") {
      console.warn("⚠️ Email service disabled via EMAIL_DISABLED=true");
      emailAvailable = false;
      return null;
    }

    // ✅ Initialize Brevo API first (this will work on Render)
    await initializeBrevoApi();

    // Check for required SMTP configuration
    if (
      !process.env.EMAIL_HOST ||
      !process.env.EMAIL_USER ||
      !process.env.EMAIL_PASSWORD
    ) {
      console.warn("\n⚠️ SMTP configuration incomplete:");
      console.warn(`   EMAIL_HOST: ${process.env.EMAIL_HOST ? "✓" : "✗"}`);
      console.warn(`   EMAIL_USER: ${process.env.EMAIL_USER ? "✓" : "✗"}`);
      console.warn(
        `   EMAIL_PASSWORD: ${process.env.EMAIL_PASSWORD ? "✓" : "✗"}`,
      );

      // If Brevo API is available, we can still send emails
      if (brevoApiAvailable) {
        console.log("✅ Brevo API is available as fallback");
        emailAvailable = true;
        return transporter;
      }

      console.warn("📧 Email notifications will be disabled");
      emailAvailable = false;
      return null;
    }

    // Try to initialize SMTP with retries
    const success = await retryEmailInit(3, 2000);

    if (success) {
      emailAvailable = true;
      console.log("\n✅ SMTP email service initialized successfully");
    } else {
      // Check if Brevo API is available as fallback
      if (brevoApiAvailable) {
        console.log("\n✅ Using Brevo API as fallback (SMTP failed)");
        emailAvailable = true;
      } else {
        emailAvailable = false;
        console.warn("\n⚠️ Email service UNAVAILABLE after multiple attempts");
        console.warn(
          "   This will NOT affect your application's core functionality",
        );
        console.warn("   All email operations will be safely skipped");
      }

      transporter = null;
    }

    // Setup graceful shutdown
    process.on("SIGTERM", () => {
      if (transporter) {
        transporter.close();
        console.log("✅ Email transporter closed gracefully");
      }
    });

    process.on("SIGINT", () => {
      if (transporter) {
        transporter.close();
        console.log("✅ Email transporter closed on app termination");
      }
    });

    return transporter;
  } catch (error) {
    console.error("\n❌ Fatal email initialization error:", error.message);
    emailAvailable = false;
    transporter = null;
    return null;
  }
};

// **MODIFY your existing sendEmail function** - find it and update:
export const sendEmail = async (to, subject, text, html = null) => {
  try {
    if (process.env.EMAIL_DISABLED === "true") {
      console.warn("📧 Email disabled, skipping send:", { to, subject });
      return { success: false, error: "Email service disabled", skipped: true };
    }

    // ✅ Try SMTP first if available
    const mailTransporter = getEmailTransporter();
    if (mailTransporter) {
      try {
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
          // Default HTML template (your existing template)
          mailOptions.html = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 30px 20px; text-align: center; }
                .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
                .content { background: #f9fafb; padding: 30px; border-radius: 0; }
                .footer { text-align: center; padding: 20px; background: #f3f4f6; color: #666; font-size: 13px; border-top: 1px solid #e5e7eb; }
                .button { background: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 500; margin: 20px 0; }
                .button:hover { background: #4338ca; }
                .info-box { background: white; border-left: 4px solid #4f46e5; padding: 15px; margin: 20px 0; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                @media only screen and (max-width: 600px) {
                  .container { margin: 10px; width: auto; }
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>📚 Gurukal Library</h1>
                </div>
                <div class="content">
                  ${text.replace(/\n/g, "<br>")}
                </div>
                <div class="footer">
                  <p>This is an automated message. Please do not reply to this email.</p>
                  <p>&copy; ${new Date().getFullYear()} Library Management System by Gajendra Nath Tripathi. All rights reserved.</p>
                  <p style="margin-top: 15px; font-size: 11px; color: #999;">
                    Sent from ${process.env.RENDER_SERVICE_NAME || "Render"} • ${new Date().toLocaleString()}
                  </p>
                </div>
              </div>
            </body>
            </html>
          `;
        }

        console.log(`📧 Sending email to ${to} via SMTP...`);
        const startTime = Date.now();
        const info = await mailTransporter.sendMail(mailOptions);
        const duration = Date.now() - startTime;

        console.log(`✅ Email sent successfully to ${to} in ${duration}ms`);
        console.log(`   Message ID: ${info.messageId}`);
        console.log(`   Response: ${info.response?.substring(0, 100)}...`);

        return { success: true, messageId: info.messageId, duration };
      } catch (smtpError) {
        console.warn(
          `⚠️ SMTP failed, trying Brevo API fallback:`,
          smtpError.message,
        );
        // Fall through to Brevo API
      }
    }

    // ✅ Try Brevo API as fallback
    console.log(`📧 Trying Brevo API for ${to}...`);
    const apiResult = await BrevoApiService.sendEmail(to, subject, text, html);

    if (apiResult.success) {
      return apiResult;
    }

    // If both fail, return error
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
