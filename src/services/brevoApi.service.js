// Correct imports based on actual exports
import { Brevo, BrevoClient, BrevoError } from "@getbrevo/brevo";

let apiInstance = null;
let emailAvailable = false;

class BrevoApiService {
  /**
   * Initialize Brevo API client for v4.x
   */
  static async initialize() {
    try {
      console.log("\n📧 ===== BREVO API INITIALIZATION (v4.x) =====");

      // Check for API key
      if (!process.env.BREVO_API_KEY) {
        console.warn("⚠️ BREVO_API_KEY not found in environment");
        emailAvailable = false;
        return null;
      }

      // Create Brevo client
      const client = new BrevoClient({
        apiKey: process.env.BREVO_API_KEY,
      });

      // Get transactional emails API
      apiInstance = client.transactionalEmails;

      // Test the connection by fetching account info
      try {
        const account = await client.account.get();
        console.log(`✅ Connected to Brevo as: ${account.email || "Unknown"}`);
      } catch (testErr) {
        console.log("⚠️ Account info fetch skipped (non-critical)");
      }

      console.log("✅ Brevo API initialized successfully (v4.x)");
      emailAvailable = true;
      return apiInstance;
    } catch (error) {
      console.error("❌ Brevo API initialization failed:", error.message);
      emailAvailable = false;
      return null;
    }
  }

  /**
   * Send email using Brevo API v4.x
   */
  static async sendEmail(to, subject, text, html = null) {
    try {
      if (!apiInstance || !emailAvailable) {
        console.warn("📧 Brevo API not available, skipping send");
        return {
          success: false,
          error: "Email service not initialized",
          skipped: true,
        };
      }

      // Prepare email data
      const emailData = {
        sender: {
          name: process.env.EMAIL_FROM_NAME || "Library System",
          email: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        },
        to: Array.isArray(to)
          ? to.map((email) => ({ email }))
          : [{ email: to }],
        subject: subject,
        htmlContent: html || this.#generateHtmlContent(text),
        textContent: text,
      };

      console.log(`📧 Sending via Brevo API v4.x to ${to}...`);

      // Send email using the API
      const result = await apiInstance.send(emailData);

      console.log(`✅ Email sent successfully via Brevo API v4.x to ${to}`);
      console.log(`   Message ID: ${result.messageId}`);

      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      console.error("❌ Brevo API error:", {
        message: error.message,
        details: error.response?.data || error,
      });

      return {
        success: false,
        error: error.message,
        skipped: true,
      };
    }
  }

  /**
   * Send OTP email
   */
  static async sendOTP(email, otp, purpose = "verification") {
    const purposeText =
      purpose === "reset" ? "Password Reset" : "Email Verification";
    const subject = `Your OTP for ${purposeText} - Gurukal Library`;
    const text = `Your OTP for ${purposeText} is: ${otp}. This code will expire in 10 minutes.`;
    const html = this.#generateOTPHtml(otp, purposeText);

    return this.sendEmail(email, subject, text, html);
  }

  /**
   * Generate HTML content for regular emails
   */
  static #generateHtmlContent(text) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { 
            font-family: 'Segoe UI', Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
            background-color: #f4f4f4;
          }
          .container { 
            max-width: 600px; 
            margin: 20px auto; 
            background: #ffffff; 
            border-radius: 12px; 
            overflow: hidden; 
            box-shadow: 0 4px 15px rgba(0,0,0,0.1); 
          }
          .header { 
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); 
            color: white; 
            padding: 30px 20px; 
            text-align: center; 
          }
          .header h1 { 
            margin: 0; 
            font-size: 28px; 
            font-weight: 600; 
          }
          .content { 
            background: #f9fafb; 
            padding: 30px; 
          }
          .footer { 
            text-align: center; 
            padding: 20px; 
            background: #f3f4f6; 
            color: #666; 
            font-size: 13px; 
            border-top: 1px solid #e5e7eb; 
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
            <p>This is an automated message from Gurukal Library Management System</p>
            <p>© ${new Date().getFullYear()} Gurukal Library. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate HTML for OTP emails
   */
  static #generateOTPHtml(otp, purposeText) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { 
            font-family: 'Segoe UI', Arial, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            margin: 0; 
            padding: 0; 
            background-color: #f4f4f4;
          }
          .container { 
            max-width: 600px; 
            margin: 20px auto; 
            background: #ffffff; 
            border-radius: 12px; 
            overflow: hidden; 
            box-shadow: 0 4px 15px rgba(0,0,0,0.1); 
          }
          .header { 
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); 
            color: white; 
            padding: 30px 20px; 
            text-align: center; 
          }
          .header h1 { 
            margin: 0; 
            font-size: 28px; 
            font-weight: 600; 
          }
          .content { 
            background: #f9fafb; 
            padding: 40px 30px; 
            text-align: center; 
          }
          .otp-container { 
            background: white; 
            border: 2px solid #4f46e5; 
            border-radius: 12px; 
            padding: 30px; 
            margin: 20px 0; 
          }
          .otp-label { 
            color: #666; 
            font-size: 14px; 
            text-transform: uppercase; 
            letter-spacing: 2px; 
            margin-bottom: 10px; 
          }
          .otp-code { 
            font-size: 48px; 
            font-weight: 800; 
            color: #4f46e5; 
            letter-spacing: 12px; 
            font-family: 'Courier New', monospace; 
            margin: 20px 0; 
          }
          .expiry { 
            color: #dc2626; 
            font-size: 16px; 
            font-weight: 500; 
            margin: 20px 0; 
          }
          .footer { 
            text-align: center; 
            padding: 20px; 
            background: #f3f4f6; 
            color: #666; 
            font-size: 13px; 
            border-top: 1px solid #e5e7eb; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📚 Gurukal Library</h1>
          </div>
          <div class="content">
            <h2 style="color: #1f2937;">${purposeText}</h2>
            <div class="otp-container">
              <div class="otp-label">Your One-Time Password</div>
              <div class="otp-code">${otp}</div>
              <div class="expiry">⏰ Expires in 10 minutes</div>
            </div>
            <p style="color: #6b7280;">If you didn't request this, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Gurukal Library Management System</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Check if Brevo API is available
   */
  static isAvailable() {
    return emailAvailable;
  }
}

export default BrevoApiService;
