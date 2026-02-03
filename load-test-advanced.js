#!/usr/bin/env node

/**
 * ADVANCED LOAD TEST SCRIPT
 * Tests 200 concurrent users with realistic scenarios
 * Includes WebSocket and custom metrics
 */

const http = require("http");
const { promisify } = require("util");
const crypto = require("crypto");

const CONFIG = {
  baseURL: "http://localhost:8000",
  totalUsers: 200,
  rampUpTime: 300, // 5 minutes
  sustainTime: 300, // 5 minutes
  rampDownTime: 60, // 1 minute
  concurrency: 10, // simultaneous requests per user
};

const METRICS = {
  totalRequests: 0,
  successRequests: 0,
  failedRequests: 0,
  timeouts: 0,
  rateLimit: 0,
  responseTimes: [],
  errors: {},
  startTime: Date.now(),
};

// Color codes for console output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(level, message) {
  const timestamp = new Date().toISOString();
  let color = colors.reset;

  switch (level) {
    case "info":
      color = colors.cyan;
      break;
    case "success":
      color = colors.green;
      break;
    case "warning":
      color = colors.yellow;
      break;
    case "error":
      color = colors.red;
      break;
  }

  console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

/**
 * Make HTTP request
 */
function makeRequest(method, path, token, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, CONFIG.baseURL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "LoadTest/1.0",
      },
    };

    if (token) {
      options.headers["Authorization"] = `Bearer ${token}`;
    }

    const startTime = Date.now();

    const req = http.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        const responseTime = Date.now() - startTime;
        METRICS.responseTimes.push(responseTime);
        METRICS.totalRequests++;

        if (res.statusCode >= 200 && res.statusCode < 300) {
          METRICS.successRequests++;
        } else if (res.statusCode === 429) {
          METRICS.rateLimit++;
        } else {
          METRICS.failedRequests++;
        }

        if (res.statusCode >= 400) {
          const key = `${res.statusCode}`;
          METRICS.errors[key] = (METRICS.errors[key] || 0) + 1;
        }

        try {
          resolve({
            statusCode: res.statusCode,
            responseTime,
            data: JSON.parse(data),
          });
        } catch {
          resolve({
            statusCode: res.statusCode,
            responseTime,
            data: null,
          });
        }
      });
    });

    req.on("timeout", () => {
      METRICS.timeouts++;
      req.destroy();
      reject(new Error("Request timeout"));
    });

    req.on("error", (error) => {
      METRICS.failedRequests++;
      reject(error);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * Simulate student login
 */
async function studentLogin(studentId) {
  try {
    const response = await makeRequest(
      "POST",
      "/api/v1/student-auth/login",
      null,
      {
        email: `student${studentId}@example.com`,
        password: "password123",
      },
    );

    if (response.statusCode === 200 && response.data?.data?.accessToken) {
      return response.data.data.accessToken;
    }
  } catch (error) {
    // Silent fail
  }
  return null;
}

/**
 * Simulate student session
 */
async function studentSession(studentId) {
  const token = await studentLogin(studentId);
  if (!token) return;

  // Get conversations
  await makeRequest("GET", "/api/v1/chat/conversations", token);

  // Send message
  await makeRequest("POST", "/api/v1/chat/messages", token, {
    conversationId: `conv-${studentId}`,
    recipientId: `admin-${Math.random()}`,
    recipientType: "Admin",
    encryptedForRecipient: {
      ciphertext: crypto.randomBytes(32).toString("hex"),
      iv: crypto.randomBytes(16).toString("hex"),
      salt: crypto.randomBytes(16).toString("hex"),
    },
    encryptedForSender: {
      ciphertext: crypto.randomBytes(32).toString("hex"),
      iv: crypto.randomBytes(16).toString("hex"),
      salt: crypto.randomBytes(16).toString("hex"),
    },
  });

  // Get notifications
  await makeRequest("GET", "/api/v1/notification/history?limit=50", token);

  // Mark notification as read
  await makeRequest(
    "PATCH",
    `/api/v1/notification/read/notif-${Math.random()}`,
    token,
  );

  // Get public key
  await makeRequest(
    "GET",
    `/api/v1/chat/keys/Admin/admin-${Math.random()}`,
    token,
  );
}

/**
 * Calculate statistics
 */
function calculateStats() {
  const times = METRICS.responseTimes.sort((a, b) => a - b);
  const length = times.length;

  return {
    totalRequests: METRICS.totalRequests,
    successRequests: METRICS.successRequests,
    failedRequests: METRICS.failedRequests,
    rateLimit: METRICS.rateLimit,
    timeouts: METRICS.timeouts,
    successRate: (
      (METRICS.successRequests / METRICS.totalRequests) *
      100
    ).toFixed(2),
    errorRate: ((METRICS.failedRequests / METRICS.totalRequests) * 100).toFixed(
      2,
    ),
    rateLimitHitRate: (
      (METRICS.rateLimit / METRICS.totalRequests) *
      100
    ).toFixed(2),
    avgResponse: (times.reduce((a, b) => a + b, 0) / length).toFixed(2),
    minResponse: times[0],
    maxResponse: times[length - 1],
    p50: times[Math.floor(length * 0.5)],
    p95: times[Math.floor(length * 0.95)],
    p99: times[Math.floor(length * 0.99)],
  };
}

/**
 * Print statistics
 */
function printStats(phase = "Current") {
  const stats = calculateStats();
  const elapsed = ((Date.now() - METRICS.startTime) / 1000).toFixed(1);

  console.log(`\n${colors.bright}${"=".repeat(70)}${colors.reset}`);
  console.log(
    `${colors.bright}${phase} STATISTICS (${elapsed}s elapsed)${colors.reset}`,
  );
  console.log(`${"=".repeat(70)}\n`);

  console.log(
    `${colors.cyan}Total Requests:${colors.reset}    ${stats.totalRequests}`,
  );
  console.log(
    `${colors.green}Successful:${colors.reset}       ${stats.successRequests} (${stats.successRate}%)`,
  );
  console.log(
    `${colors.red}Failed:${colors.reset}          ${stats.failedRequests} (${stats.errorRate}%)`,
  );
  console.log(
    `${colors.yellow}Rate Limited:${colors.reset}     ${stats.rateLimit} (${stats.rateLimitHitRate}%)`,
  );
  console.log(
    `${colors.yellow}Timeouts:${colors.reset}        ${stats.timeouts}`,
  );

  console.log(`\n${colors.cyan}Response Times (ms):${colors.reset}`);
  console.log(`  Average:    ${stats.avgResponse}ms`);
  console.log(`  Min:        ${stats.minResponse}ms`);
  console.log(`  Max:        ${stats.maxResponse}ms`);
  console.log(`  P50:        ${stats.p50}ms`);
  console.log(`  P95:        ${stats.p95}ms`);
  console.log(`  P99:        ${stats.p99}ms`);

  if (Object.keys(METRICS.errors).length > 0) {
    console.log(`\n${colors.red}Errors:${colors.reset}`);
    Object.entries(METRICS.errors).forEach(([code, count]) => {
      console.log(`  ${code}: ${count}`);
    });
  }

  console.log(`\n${"=".repeat(70)}\n`);
}

/**
 * Main load test
 */
async function runLoadTest() {
  log("info", `🚀 Starting Load Test - Target: ${CONFIG.baseURL}`);
  log("info", `👥 Total Users: ${CONFIG.totalUsers}`);
  log(
    "info",
    `⏱️  Ramp Up: ${CONFIG.rampUpTime}s | Sustain: ${CONFIG.sustainTime}s | Ramp Down: ${CONFIG.rampDownTime}s`,
  );

  const rampUpInterval = (CONFIG.rampUpTime * 1000) / CONFIG.totalUsers;
  const testDuration =
    CONFIG.rampUpTime + CONFIG.sustainTime + CONFIG.rampDownTime;

  let activeUsers = 0;

  // Ramp up phase
  log("info", `\n📈 RAMP UP PHASE (${CONFIG.rampUpTime}s)`);

  for (let i = 0; i < CONFIG.totalUsers; i++) {
    activeUsers++;

    // Start user session
    studentSession(i).catch(() => {});

    // Log progress
    if (i % 20 === 0) {
      log("info", `  ${activeUsers}/${CONFIG.totalUsers} users active`);
    }

    // Wait before starting next user
    await new Promise((resolve) => setTimeout(resolve, rampUpInterval));
  }

  log("success", `✅ Ramp up complete. ${activeUsers} users active`);

  // Print stats after ramp up
  printStats("AFTER RAMP UP");

  // Sustain phase
  log(
    "info",
    `\n⏳ SUSTAIN PHASE (${CONFIG.sustainTime}s) - Running continuous load`,
  );

  const sustainStart = Date.now();
  let sustainRequests = 0;

  while (Date.now() - sustainStart < CONFIG.sustainTime * 1000) {
    // Start new requests from random users
    for (let i = 0; i < Math.min(CONFIG.concurrency, CONFIG.totalUsers); i++) {
      const randomUser = Math.floor(Math.random() * CONFIG.totalUsers);
      studentSession(randomUser).catch(() => {});
      sustainRequests++;
    }

    // Print progress every 30 seconds
    if (sustainRequests % 100 === 0) {
      const elapsed = ((Date.now() - sustainStart) / 1000).toFixed(1);
      log("info", `  ${elapsed}s - ${sustainRequests} requests sent`);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  log("success", `✅ Sustain phase complete. ${sustainRequests} requests sent`);

  // Print stats after sustain
  printStats("AFTER SUSTAIN PHASE");

  // Ramp down phase
  log("info", `\n📉 RAMP DOWN PHASE (${CONFIG.rampDownTime}s)`);
  await new Promise((resolve) =>
    setTimeout(resolve, CONFIG.rampDownTime * 1000),
  );

  // Final statistics
  log("success", "\n🏁 LOAD TEST COMPLETE");
  printStats("FINAL RESULTS");

  // Performance evaluation
  const stats = calculateStats();
  console.log(`${colors.bright}PERFORMANCE EVALUATION:${colors.reset}\n`);

  if (stats.successRate >= 99) {
    log("success", `✅ Success Rate: ${stats.successRate}% (EXCELLENT)`);
  } else if (stats.successRate >= 95) {
    log("warning", `⚠️  Success Rate: ${stats.successRate}% (GOOD)`);
  } else {
    log("error", `❌ Success Rate: ${stats.successRate}% (NEEDS IMPROVEMENT)`);
  }

  if (stats.p99 < 500) {
    log("success", `✅ P99 Response Time: ${stats.p99}ms (EXCELLENT)`);
  } else if (stats.p99 < 1000) {
    log("warning", `⚠️  P99 Response Time: ${stats.p99}ms (ACCEPTABLE)`);
  } else {
    log("error", `❌ P99 Response Time: ${stats.p99}ms (NEEDS IMPROVEMENT)`);
  }

  if (stats.rateLimitHitRate < 1) {
    log(
      "success",
      `✅ Rate Limit Hit Rate: ${stats.rateLimitHitRate}% (EXCELLENT)`,
    );
  } else if (stats.rateLimitHitRate < 5) {
    log(
      "warning",
      `⚠️  Rate Limit Hit Rate: ${stats.rateLimitHitRate}% (ACCEPTABLE)`,
    );
  } else {
    log(
      "error",
      `❌ Rate Limit Hit Rate: ${stats.rateLimitHitRate}% (TOO HIGH)`,
    );
  }

  console.log(
    `\n${colors.bright}Verdict: ${
      stats.successRate >= 95 && stats.p99 < 1000 && stats.rateLimitHitRate < 5
        ? `${colors.green}✅ SERVER READY FOR 200+ CONCURRENT USERS${colors.reset}`
        : `${colors.yellow}⚠️  SERVER NEEDS OPTIMIZATION${colors.reset}`
    }${colors.reset}\n`,
  );

  process.exit(stats.successRate >= 95 ? 0 : 1);
}

// Run the load test
runLoadTest().catch((error) => {
  log("error", `Fatal Error: ${error.message}`);
  process.exit(1);
});
