import { Resend } from "resend";

class ResendApiService {
  /**
   * Send email using Resend API
   */
  static async sendEmail(to, subject, text, html = null) {
    try {
      // Create Resend instance here to ensure env is loaded
      const apiKey = process.env.RESEND_API_KEY;
      const maskedKey = apiKey
        ? apiKey.slice(0, 6) + "..." + apiKey.slice(-4)
        : "undefined";
      console.log(
        `\n🚀 [RESEND] Initializing Resend with API key: ${maskedKey}`,
      );
      const resend = new Resend(apiKey);
      const emailData = {
        from: process.env.EMAIL_FROM || "onboarding@resend.dev",
        to,
        subject,
        text,
        html: html || undefined,
      };
      console.log("\n📧 [RESEND] Sending email:", emailData);
      const result = await resend.emails.send(emailData);
      console.log("✅ [RESEND] Email sent response:", result);
      return {
        success: !result.error,
        id: result.id,
        resendResponse: result,
      };
    } catch (error) {
      console.error("❌ [RESEND] API error:", error);
      return {
        success: false,
        error: error.message,
        resendError: error,
      };
    }
  }
}
export default ResendApiService;
