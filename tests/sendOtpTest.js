import dotenv from "dotenv";
dotenv.config();
import { sendOtpEmail } from "../src/controllers/studentAuth.controller.js";

const testEmail = "gajendra.tripathi.me@gmail.com";
const otp = Math.floor(100000 + Math.random() * 900000).toString();
const purpose = "VERIFY";

(async () => {
  console.log("\n--- OTP EMAIL TEST ---");
  console.log("Sending OTP:", { testEmail, otp, purpose });
  const response = await sendOtpEmail(testEmail, otp, purpose);
  console.log("SendOtpEmail Response:", response);
})();
