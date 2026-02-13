export const createPayloadValidator = (logger, maxSize) => {
  return (payload, customMaxSize = maxSize) => {
    const size = JSON.stringify(payload).length;
    if (size > customMaxSize) {
      logger.warn("Payload exceeds max size", { size, maxSize: customMaxSize });
      return false;
    }
    return true;
  };
};

export const createCallRateLimiter = (windowMs, maxCalls) => {
  const callLimiters = new Map();
  return (userType, userId) => {
    const key = `${userType}:${userId}`;
    const now = Date.now();
    const limiter = callLimiters.get(key) || {
      count: 0,
      resetTime: now + windowMs,
    };

    if (now > limiter.resetTime) {
      limiter.count = 0;
      limiter.resetTime = now + windowMs;
    }

    limiter.count += 1;
    callLimiters.set(key, limiter);

    return limiter.count <= maxCalls;
  };
};

export const createTypingThrottle = (throttleMs) => {
  const typingThrottle = new Map();
  return (key) => {
    const now = Date.now();
    const last = typingThrottle.get(key) || 0;
    if (now - last < throttleMs) return false;
    typingThrottle.set(key, now);
    return true;
  };
};

export const isValidIceCandidate = (candidate) => {
  if (!candidate || typeof candidate !== "object") return false;
  const candidateString =
    typeof candidate.candidate === "string" ? candidate.candidate : null;

  if (!candidateString) return false;
  if (candidateString.length > 1024) return false;

  if (
    candidate.sdpMLineIndex != null &&
    typeof candidate.sdpMLineIndex !== "number"
  ) {
    return false;
  }

  if (candidate.sdpMid != null && typeof candidate.sdpMid !== "string") {
    return false;
  }

  return true;
};
