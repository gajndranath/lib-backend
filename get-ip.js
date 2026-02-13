import https from "https";

// Get your public IP
https.get("https://api.ipify.org?format=json", (res) => {
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => {
    const ip = JSON.parse(data).ip;
    console.log("\n📍 Your Public IP Address:", ip);
    console.log("\n✅ Add this to Render Valkey Inbound IP Rules:");
    console.log(`   Source: ${ip}/32`);
    console.log("   Description: Development Machine");
    console.log("\nOr for testing, allow all IPs:");
    console.log("   Source: 0.0.0.0/0");
    console.log("   Description: Allow All (Development Only)");
  });
});
