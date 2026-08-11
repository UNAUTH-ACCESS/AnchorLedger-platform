/**
 * jwt.js
 * Single place all token signing/verification goes through — previously
 * scattered across middleware/auth.js and auth.routes.js as raw jwt.sign/
 * jwt.verify calls against process.env.JWT_SECRET directly, which meant a
 * future change (like this one) had four call sites to keep in sync
 * instead of one.
 *
 * Supports rotating JWT_SECRET/JWT_REFRESH_SECRET without force-logging out
 * every active session. See docs/JWT_ROTATION.md for the actual procedure.
 *
 * Rule: signing always uses only the current secret (new tokens never
 * depend on the fallback, so everything naturally converges onto the new
 * secret as old tokens expire/refresh). Verification tries current first,
 * and only falls back to *_PREVIOUS if it's set and current fails — if
 * both fail, the original current-secret error is what gets re-thrown, so
 * callers still see the same jsonwebtoken error types
 * (JsonWebTokenError/TokenExpiredError) they always have.
 */
const jwt = require("jsonwebtoken");

function verifyWithFallback(token, currentSecret, previousSecret) {
  try {
    return jwt.verify(token, currentSecret);
  } catch (currentErr) {
    if (previousSecret) {
      try {
        return jwt.verify(token, previousSecret);
      } catch {
        // fall through — surface the current-secret error below, not this one
      }
    }
    throw currentErr;
  }
}

function signAccessToken(payload, opts = {}) {
  return jwt.sign(payload, process.env.JWT_SECRET, opts);
}

function verifyAccessToken(token) {
  return verifyWithFallback(token, process.env.JWT_SECRET, process.env.JWT_SECRET_PREVIOUS);
}

function signRefreshToken(payload, opts = {}) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, opts);
}

function verifyRefreshToken(token) {
  return verifyWithFallback(token, process.env.JWT_REFRESH_SECRET, process.env.JWT_REFRESH_SECRET_PREVIOUS);
}

module.exports = { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken };
