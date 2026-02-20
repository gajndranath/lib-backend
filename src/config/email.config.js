import nodemailer from "nodemailer";
import { ApiError } from "../utils/ApiError.js";
import dns from "dns";
import net from "net";
import { promisify } from "util";

const dnsResolve4 = promisify(dns.resolve4);
const dnsLookup = promisify(dns.lookup);

let transporter = null;
let emailAvailable = false;

// ✅ DNS and Connectivity Debugger
const debugConnectivity = async () => {
  const host = process.env.EMAIL_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.EMAIL_PORT || "587");

  console.log("\n🔍 ===== EMAIL CONNECTIVITY DIAGNOSTICS =====");
  console.log(`🔍 Target: ${host}:${port}`);
  console.log(`🔍 Timestamp: ${new Date().toISOString()}`);

  // Step 1: DNS Resolution
  try {
    console.log(`\n🔍 Step 1/5 - Resolving DNS for ${host}...`);
    const addresses = await dnsResolve4(host);
    console.log(`✅ DNS A records resolved: ${addresses.join(", ")}`);

    // Try to ping each IP (just to see if reachable)
    for (const ip of addresses.slice(0, 2)) {
      // Test first 2 IPs
      try {
        const lookup = await dnsLookup(ip);
        console.log(`   ✓ IP ${ip} is reachable via DNS`);
      } catch (e) {
        console.log(`   ⚠️ IP ${ip} DNS lookup failed: ${e.message}`);
      }
    }
  } catch (dnsError) {
    console.error(`❌ DNS resolution failed:`, dnsError.message);
    console.log(`🔍 Trying fallback DNS lookup...`);
    try {
      const lookup = await dnsLookup(host, { family: 4 });
      console.log(`✅ DNS lookup succeeded: ${lookup.address}`);
    } catch (lookupError) {
      console.error(`❌ DNS lookup also failed:`, lookupError.message);
      console.log(`⚠️ This suggests a network-level DNS issue on Render`);
    }
  }

  // Step 2: TCP Connection Test
  console.log(`\n🔍 Step 2/5 - Testing TCP connection to ${host}:${port}...`);

  const tcpResult = await new Promise((resolve) => {
    const socket = new net.Socket();
    const startTime = Date.now();
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        const duration = Date.now() - startTime;
        console.error(`❌ TCP connection TIMEOUT after ${duration}ms`);
        console.error(`   ⚠️ This indicates a network block or firewall issue`);
        console.error(`   🔧 Possible causes:`);
        console.error(`      - Render's outbound IP is blocked by Gmail`);
        console.error(`      - Gmail's SMTP servers are rate-limiting your IP`);
        console.error(
          `      - Network routing issue between Render and Google`,
        );
        socket.destroy();
        resolved = true;
        resolve({ success: false, error: "timeout", duration });
      }
    }, 8000);

    socket.once("connect", () => {
      if (!resolved) {
        const duration = Date.now() - startTime;
        console.log(`✅ TCP connection SUCCESSFUL in ${duration}ms`);
        clearTimeout(timeout);
        socket.end();
        resolved = true;
        resolve({ success: true, duration });
      }
    });

    socket.once("error", (err) => {
      if (!resolved) {
        const duration = Date.now() - startTime;
        console.error(
          `❌ TCP connection ERROR after ${duration}ms:`,
          err.message,
        );
        console.error(`   Error code: ${err.code || "N/A"}`);
        clearTimeout(timeout);
        socket.destroy();
        resolved = true;
        resolve({ success: false, error: err.code || err.message, duration });
      }
    });

    socket.connect(port, host);
  });

  // Step 3: SMTP Banner Test (if TCP connected)
  if (tcpResult.success) {
    console.log(`\n🔍 Step 3/5 - Checking SMTP banner (HELO response)...`);

    const bannerResult = await new Promise((resolve) => {
      const socket = new net.Socket();
      const startTime = Date.now();
      let banner = "";
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          console.error(
            `❌ SMTP banner timeout after ${Date.now() - startTime}ms`,
          );
          socket.destroy();
          resolved = true;
          resolve({ success: false, error: "timeout" });
        }
      }, 5000);

      socket.once("connect", () => {
        console.log(`✅ Connected to SMTP server, waiting for banner...`);
      });

      socket.on("data", (data) => {
        banner += data.toString();
        console.log(`📨 Received data: ${data.toString().trim()}`);

        if (banner.includes("220")) {
          clearTimeout(timeout);
          console.log(`✅ SMTP banner received successfully`);
          console.log(`   Banner: ${banner.split("\n")[0].trim()}`);
          socket.end();
          resolved = true;
          resolve({ success: true, banner: banner.split("\n")[0].trim() });
        }
      });

      socket.once("error", (err) => {
        if (!resolved) {
          console.error(`❌ SMTP banner error:`, err.message);
          clearTimeout(timeout);
          socket.destroy();
          resolved = true;
          resolve({ success: false, error: err.message });
        }
      });

      socket.connect(port, host);
    });

    if (!bannerResult.success) {
      console.log(
        `⚠️ SMTP banner test failed - server might not be responding correctly`,
      );
    }
  }

  // Step 4: Environment Variables Check
  console.log(`\n🔍 Step 4/5 - Environment Configuration Check:`);
  console.log(`   📧 EMAIL_HOST: ${process.env.EMAIL_HOST || "❌ NOT SET"}`);
  console.log(`   📧 EMAIL_PORT: ${process.env.EMAIL_PORT || "❌ NOT SET"}`);
  console.log(
    `   📧 EMAIL_USER: ${process.env.EMAIL_USER ? "✓ SET (" + process.env.EMAIL_USER + ")" : "❌ NOT SET"}`,
  );
  console.log(
    `   📧 EMAIL_PASSWORD: ${process.env.EMAIL_PASSWORD ? "✓ SET (length: " + process.env.EMAIL_PASSWORD.length + ")" : "❌ NOT SET"}`,
  );
  console.log(
    `   📧 EMAIL_FROM: ${process.env.EMAIL_FROM || "❌ NOT SET (will use EMAIL_USER)"}`,
  );
  console.log(
    `   📧 EMAIL_FROM_NAME: ${process.env.EMAIL_FROM_NAME || '❌ NOT SET (default: "Library System")'}`,
  );

  // Step 5: Gmail-specific checks
  if (host.includes("gmail.com") || host.includes("google.com")) {
    console.log(`\n🔍 Step 5/5 - Gmail-specific Diagnostics:`);

    // Check if using App Password
    const isAppPassword =
      process.env.EMAIL_PASSWORD && process.env.EMAIL_PASSWORD.length === 16;
    console.log(
      `   🔐 Using App Password: ${isAppPassword ? "✓ YES (16 chars)" : "⚠️ NO - this might be the issue"}`,
    );

    if (!isAppPassword) {
      console.log(`   ℹ️ For Gmail, you MUST use an App Password:`);
      console.log(
        `      1. Enable 2-Factor Authentication at https://myaccount.google.com/security`,
      );
      console.log(`      2. Go to https://myaccount.google.com/apppasswords`);
      console.log(
        `      3. Generate a new App Password for "Mail" and "Other" device`,
      );
      console.log(`      4. Use that 16-character password in EMAIL_PASSWORD`);
    }

    console.log(`   🔌 Common Gmail SMTP issues:`);
    console.log(
      `      • Gmail blocks connections from cloud hosting IPs (AWS/Render)`,
    );
    console.log(`      • Too many failed attempts triggers temporary ban`);
    console.log(`      • Rate limiting: max ~500 emails/day for free accounts`);
  }

  console.log(`\n🔍 ===== DIAGNOSTICS COMPLETE =====\n`);

  return tcpResult.success;
};

// ✅ Enhanced retry logic with debug mode
const retryEmailInit = async (maxRetries = 3, delay = 2000) => {
  const debugMode = process.env.EMAIL_DEBUG === "true";

  // Run connectivity debug first if in debug mode
  if (debugMode) {
    console.log("🔍 EMAIL_DEBUG=true - Running full connectivity diagnostics");
    await debugConnectivity();
  } else {
    console.log(
      "ℹ️ Set EMAIL_DEBUG=true for detailed connectivity diagnostics",
    );
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`\n📧 Email init attempt ${attempt}/${maxRetries}...`);
      console.log(
        `📧 Connecting to: ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}`,
      );

      // Create transporter with current config
      transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || "587"),
        secure: process.env.EMAIL_PORT === "465",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 15000,
        pool: {
          maxConnections: 5,
          maxMessages: 50,
          rateDelta: 2000,
          rateLimit: 10,
        },
        tls: {
          rejectUnauthorized: false,
          // Enable TLS debugging in debug mode
          ...(debugMode && { debug: true }),
        },
        // Enable Nodemailer logging in debug mode
        logger: debugMode,
        debug: debugMode,
      });

      // ✅ Enhanced verification with detailed error handling
      const verified = await new Promise((resolve) => {
        const verifyTimeout = setTimeout(() => {
          console.warn(
            `\n⚠️ Email verification TIMEOUT (attempt ${attempt}/${maxRetries})`,
          );
          console.warn(
            `   This means the SMTP server is not responding within 8 seconds`,
          );
          console.warn(`   🔧 Troubleshooting steps:`);
          console.warn(
            `      1. Check if ${process.env.EMAIL_HOST} is correct`,
          );
          console.warn(`      2. Try using port 465 instead of 587`);
          console.warn(`      3. Gmail might be blocking Render's IP range`);
          console.warn(
            `      4. Consider using a transactional email service (SendGrid, Brevo, etc.)`,
          );
          resolve(false);
        }, 8000);

        transporter.verify((error, success) => {
          clearTimeout(verifyTimeout);

          if (error) {
            console.error(
              `\n❌ Email verification FAILED (attempt ${attempt}/${maxRetries}):`,
            );
            console.error(`   Error Code: ${error.code || "N/A"}`);
            console.error(`   Error Command: ${error.command || "N/A"}`);
            console.error(`   Error Response: ${error.response || "N/A"}`);
            console.error(`   Error Message: ${error.message}`);

            // Categorize error for better debugging
            if (error.code === "ETIMEDOUT") {
              console.error(`\n   🔴 NETWORK TIMEOUT ERROR`);
              console.error(
                `   This is a network-level issue - Render cannot reach the SMTP server`,
              );
              console.error(`   🔧 Solutions:`);
              console.error(
                `      1. Try using port 465 (SSL) instead of 587 (STARTTLS)`,
              );
              console.error(
                `      2. Check if your SMTP provider allows connections from cloud hosts`,
              );
              console.error(
                `      3. Switch to an email API service (SendGrid, Resend, etc.)`,
              );
              console.error(
                `      4. Contact Render support to check outbound connectivity`,
              );
            } else if (error.code === "EAUTH") {
              console.error(`\n   🔴 AUTHENTICATION ERROR`);
              console.error(`   Username/password rejected by the SMTP server`);
              console.error(`   🔧 Solutions:`);
              console.error(
                `      1. Verify EMAIL_USER and EMAIL_PASSWORD are correct`,
              );
              console.error(`      2. For Gmail, generate a new App Password`);
              console.error(
                `      3. Check if 2FA is enabled (required for App Passwords)`,
              );
            } else if (error.code === "ESOCKET") {
              console.error(`\n   🔴 SOCKET ERROR`);
              console.error(
                `   Connection was established but immediately closed`,
              );
              console.error(`   🔧 Solutions:`);
              console.error(`      1. The server might be rejecting TLS/SSL`);
              console.error(
                `      2. Try secure: ${process.env.EMAIL_PORT !== "465"} (opposite of current)`,
              );
              console.error(`      3. Server might be blocking your IP`);
            } else if (error.code === "ECONNREFUSED") {
              console.error(`\n   🔴 CONNECTION REFUSED`);
              console.error(`   The server actively refused the connection`);
              console.error(`   🔧 Solutions:`);
              console.error(
                `      1. Check if the port (${process.env.EMAIL_PORT}) is correct`,
              );
              console.error(
                `      2. The SMTP server might be down or firewalled`,
              );
              console.error(
                `      3. Try a different port (465 or 25 if allowed)`,
              );
            } else if (error.response && error.response.includes("535")) {
              console.error(`\n   🔴 AUTHENTICATION FAILED (535)`);
              console.error(`   Username and password not accepted`);
              console.error(`   🔧 Solutions:`);
              console.error(`      1. Generate a new App Password for Gmail`);
              console.error(
                `      2. Check if your account is locked due to suspicious activity`,
              );
              console.error(
                `      3. Verify the username is correct (full email address)`,
              );
            }

            resolve(false);
          } else {
            console.log(
              `\n✅ Email verification SUCCESSFUL (attempt ${attempt}/${maxRetries})`,
            );
            console.log(
              `   SMTP server is reachable and authentication worked`,
            );
            resolve(true);
          }
        });
      });

      if (verified) {
        emailAvailable = true;
        return true;
      }

      if (attempt < maxRetries) {
        console.log(
          `\n⏳ Retry ${attempt}/${maxRetries} failed, waiting ${delay}ms before next attempt...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch (error) {
      console.error(
        `\n❌ Email initialization error (attempt ${attempt}/${maxRetries}):`,
        error.message,
      );

      if (error.code) {
        console.error(`   Error Code: ${error.code}`);
      }

      if (error.stack && process.env.EMAIL_DEBUG === "true") {
        console.error(`   Stack: ${error.stack.split("\n")[1]}`);
      }

      if (attempt < maxRetries) {
        console.log(
          `\n⏳ Waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}...`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  return false;
};

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

    // Check for required configuration
    if (
      !process.env.EMAIL_HOST ||
      !process.env.EMAIL_USER ||
      !process.env.EMAIL_PASSWORD
    ) {
      console.warn("\n⚠️ Email configuration incomplete:");
      console.warn(`   EMAIL_HOST: ${process.env.EMAIL_HOST ? "✓" : "✗"}`);
      console.warn(`   EMAIL_USER: ${process.env.EMAIL_USER ? "✓" : "✗"}`);
      console.warn(
        `   EMAIL_PASSWORD: ${process.env.EMAIL_PASSWORD ? "✓" : "✗"}`,
      );
      console.warn("📧 Email notifications will be disabled");
      emailAvailable = false;
      return null;
    }

    // Try to initialize with retries
    const success = await retryEmailInit(3, 2000);

    if (success) {
      emailAvailable = true;
      console.log("\n✅ Email service initialized successfully");
      console.log("📧 Ready to send emails");
    } else {
      emailAvailable = false;
      console.warn("\n⚠️ Email service UNAVAILABLE after multiple attempts");
      console.warn(
        "   This will NOT affect your application's core functionality",
      );
      console.warn("   All email operations will be safely skipped");

      if (process.env.EMAIL_HOST?.includes("gmail.com")) {
        console.warn("\n💡 Recommendation for Gmail SMTP:");
        console.warn("   Since you're getting ETIMEDOUT on Render, consider:");
        console.warn("   1. Using a transactional email service instead:");
        console.warn(
          "      • SendGrid (free: 100 emails/day) - smtp.sendgrid.net:587",
        );
        console.warn(
          "      • Brevo (free: 300 emails/day) - smtp-relay.brevo.com:587",
        );
        console.warn("      • Resend (free: 3000 emails/month) - API based");
        console.warn(
          "   2. Contact Render support to check if outbound SMTP is blocked",
        );
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
    if (process.env.EMAIL_DISABLED === "true") {
      console.warn("📧 Email disabled, skipping send:", { to, subject });
      return { success: false, error: "Email service disabled", skipped: true };
    }

    const mailTransporter = getEmailTransporter();
    if (!mailTransporter) {
      console.warn("📧 Email transporter not available, skipping send:", {
        to,
        subject,
      });
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

    console.log(`📧 Sending email to ${to}...`);
    const startTime = Date.now();
    const info = await mailTransporter.sendMail(mailOptions);
    const duration = Date.now() - startTime;

    console.log(`✅ Email sent successfully to ${to} in ${duration}ms`);
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Response: ${info.response?.substring(0, 100)}...`);

    return { success: true, messageId: info.messageId, duration };
  } catch (error) {
    console.error("❌ Email sending error:", {
      to,
      subject,
      errorCode: error.code || "N/A",
      errorMessage: error.message,
      command: error.command || "N/A",
      response: error.response?.substring(0, 200) || "N/A",
    });

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
      subject: `Welcome to Gurukal Library - ${data.studentName}`,
      text: `Dear ${data.studentName},\n\nWelcome to Gurukal Library! Your registration is complete.\n\nStudent ID: ${data.studentId}\nSlot: ${data.slotName}\nMonthly Fee: ₹${data.monthlyFee}\n\nPlease visit the library to complete the formalities.\n\nThank you,\nGurukal Library Management`,
    },
    PAYMENT_RECEIPT: {
      subject: `Payment Receipt - ${data.monthYear}`,
      text: `Dear ${data.studentName},\n\nThank you for your payment. Here is your receipt:\n\nReceipt No: ${data.receiptNumber}\nDate: ${data.paymentDate}\nAmount: ₹${data.amount}\nMonth: ${data.monthYear}\nPayment Method: ${data.paymentMethod || "Cash"}\n\nThank you for your continued support!\n\nGurukal Library Management`,
    },
    ACCOUNT_SUSPENSION: {
      subject: `Important: Account Suspension Notice`,
      text: `Dear ${data.studentName},\n\nYour library account has been suspended due to non-payment of dues.\n\nOutstanding Amount: ₹${data.amount}\nLast Payment Date: ${data.lastPaymentDate || "N/A"}\n\nPlease clear your dues immediately to reactivate your account.\n\nThank you,\nGurukal Library Management`,
    },
  };

  const template = templates[templateName];
  if (!template) {
    throw new ApiError(400, `Email template '${templateName}' not found`);
  }

  return await sendEmail(to, template.subject, template.text);
};

// ✅ Manual test function for debugging
export const testEmailConnection = async () => {
  console.log("\n🧪 ===== MANUAL EMAIL CONNECTION TEST =====");

  // Save original debug setting
  const originalDebug = process.env.EMAIL_DEBUG;
  process.env.EMAIL_DEBUG = "true";

  const result = await debugConnectivity();

  // Test actual email send if connectivity works
  if (result) {
    console.log("\n🧪 Testing actual email send...");
    try {
      const testResult = await sendEmail(
        process.env.EMAIL_USER, // Send to yourself
        "Test Email from Render",
        "This is a test email to verify SMTP is working correctly.\n\nIf you receive this, email is configured properly!",
      );

      if (testResult.success) {
        console.log("✅ Test email sent successfully!");
      } else {
        console.error("❌ Test email failed:", testResult.error);
      }
    } catch (error) {
      console.error("❌ Test email error:", error.message);
    }
  }

  // Restore debug setting
  process.env.EMAIL_DEBUG = originalDebug;

  return result;
};

// Export a default object with all functions
export default {
  initializeEmail,
  isEmailAvailable,
  getEmailTransporter,
  sendEmail,
  sendTemplateEmail,
  testEmailConnection,
};
