/**
 * Mock Email Service
 * Logs emails to the console in development.
 * Replace with Nodemailer/SendGrid in production.
 */
const sendEmail = async (options) => {
  console.log("================ MOCK EMAIL SERVICE ================");
  console.log(`TO: ${options.email}`);
  console.log(`SUBJECT: ${options.subject}`);
  console.log(`MESSAGE: \n${options.message}`);
  console.log("====================================================");
  
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));
};

export default sendEmail;
