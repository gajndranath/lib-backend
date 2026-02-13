import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import { initializeEmail, sendEmail } from "./src/config/email.config.js";

(async () => {
  console.log("🧪 Testing OTP email sending...\n");

  console.log("📧 Email Configuration:");
  console.log(`  HOST: ${process.env.EMAIL_HOST}`);
  console.log(`  PORT: ${process.env.EMAIL_PORT}`);
  console.log(`  USER: ${process.env.EMAIL_USER}`);
  console.log(
    `  PASS: ${process.env.EMAIL_PASSWORD ? "***" + process.env.EMAIL_PASSWORD.slice(-4) : "NOT SET"}`,
  );
  console.log(`  FROM: ${process.env.EMAIL_FROM}`);
  console.log("");

  // Initialize email service
  await initializeEmail();

  // Send test OTP email
  console.log("\n📤 Sending test OTP email...");
  const result = await sendEmail(
    "gajendra.tripathi.me@gmail.com",
    "Your verification code",
    "Your email verification OTP is: 123456\n\nThis code will expire in 10 minutes.",
  );

  console.log("\n📊 Email Send Result:", result);

  if (result.success) {
    console.log("✅ Email sent successfully! Check your inbox.");
  } else {
    console.log("❌ Email failed:", result.error);
  }

  process.exit(0);
})();
