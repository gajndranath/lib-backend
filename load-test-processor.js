/**
 * LOAD TEST PROCESSOR
 * Custom functions for Artillery load testing
 */

// Generate random string
function randomString(length) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate random number
function randomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Before request hook
function beforeRequest(requestParams, context, ee, next) {
  // Add request ID for tracking
  requestParams.headers = requestParams.headers || {};
  requestParams.headers["X-Request-ID"] =
    `load-test-${Date.now()}-${Math.random()}`;

  // Log high-level requests
  if (Math.random() < 0.1) {
    console.log(
      `📤 [${new Date().toISOString()}] ${requestParams.method} ${requestParams.path}`,
    );
  }

  return next();
}

// After response hook
function afterResponse(requestParams, response, context, ee, next) {
  // Track response time
  const responseTime = response.responseTime || 0;

  // Log slow requests
  if (responseTime > 1000) {
    console.log(
      `⚠️  SLOW REQUEST: ${response.statusCode} ${requestParams.method} ${requestParams.path} - ${responseTime}ms`,
    );
  }

  // Log errors
  if (response.statusCode >= 400) {
    console.log(
      `❌ ERROR: ${response.statusCode} ${requestParams.method} ${requestParams.path}`,
    );
  }

  // Custom metrics event
  if (responseTime < 100) {
    ee.emit("customStat", { stat: "fast_response", value: 1 });
  } else if (responseTime < 500) {
    ee.emit("customStat", { stat: "medium_response", value: 1 });
  } else if (responseTime < 1000) {
    ee.emit("customStat", { stat: "slow_response", value: 1 });
  } else {
    ee.emit("customStat", { stat: "very_slow_response", value: 1 });
  }

  return next();
}

// On error hook
function onError(error, requestParams, context, ee, next) {
  console.log(`🔴 CONNECTION ERROR: ${error.message}`);
  ee.emit("customStat", { stat: "connection_error", value: 1 });
  return next();
}

// Export hooks
export { beforeRequest, afterResponse, onError };
