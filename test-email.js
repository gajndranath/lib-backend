import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

async function testEmail() {
  console.log("📧 Testing Email Configuration...\n");
  console.log("Email Host:", process.env.EMAIL_HOST);
  console.log("Email Port:", process.env.EMAIL_PORT);
  console.log("Email User:", process.env.EMAIL_USER);
  console.log(
    "Email Password:",
    process.env.EMAIL_PASSWORD ? "✅ Set" : "❌ Not Set",
  );
  console.log();

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || "587"),
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    console.log("🔍 Verifying SMTP connection...");
    await transporter.verify();
    console.log("✅ SMTP connection verified successfully!\n");

    // Send test email
    console.log("📨 Sending test OTP email...");
    const testOTP = "123456";
    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER, // Send to self for testing
      subject: "Test OTP - Gurukul Library",
      text: `Your verification OTP is: ${testOTP}\n\nThis is a test email. OTP will expire in 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Email Verification</h2>
          <p>Your verification OTP is:</p>
          <h1 style="color: #4f46e5; font-size: 32px;">${testOTP}</h1>
          <p>This is a test email. OTP will expire in 10 minutes.</p>
        </div>
      `,
    });

    console.log("✅ Test email sent successfully!");
    console.log("Message ID:", info.messageId);
    console.log("Preview URL:", nodemailer.getTestMessageUrl(info));
    console.log("\n✅ Email service is working correctly!");
    console.log(`📧 Check your inbox: ${process.env.EMAIL_USER}`);
  } catch (error) {
    console.error("❌ Email test failed:", error.message);
    if (error.code) {
      console.error("Error code:", error.code);
    }
    process.exit(1);
  }
}

testEmail();
