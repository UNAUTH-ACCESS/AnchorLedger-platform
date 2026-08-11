/**
 * system.routes.js
 *
 * Admin → Operations → System health. Everything here proxies to
 * delegate-server's /system-status and /restart (added alongside this) —
 * quantedge_api runs in a container with no pm2 binary and no docker
 * socket, while delegate-server runs directly on the host under pm2 with
 * full OS access. Same delegate HTTP client pattern used in
 * execution.service.js / depositWatcher.service.js.
 */
const express = require("express");
const router = express.Router();

const prisma = require("../../../lib/prisma");
const config = require("../../../lib/config");
const { authenticate, requirePlatformAdmin, requirePlatformPermission } = require("../../../middleware/auth");
const logger = require("../../../lib/logger");

async function delegatePost(endpoint, body = {}) {
  const res = await fetch(`${config.DELEGATE_SERVER_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-delegate-secret": config.DELEGATE_SHARED_SECRET,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || `Delegate error at ${endpoint}`);
  return data;
}

// GET /admin/system/health
router.get("/system/health", authenticate, requirePlatformAdmin, requirePlatformPermission("view_all"), async (req, res, next) => {
  try {
    const status = await delegatePost("/system-status");
    res.json({ success: true, data: status });
  } catch (err) { next(err); }
});

// POST /admin/system/restart-delegate — real production action, explicit
// confirm required client-side, logged to PlatformAuditEvent (no workspace
// context for a platform-level infra action).
router.post("/system/restart-delegate", authenticate, requirePlatformAdmin, requirePlatformPermission("manage_platform"), async (req, res, next) => {
  try {
    const result = await delegatePost("/restart");

    await prisma.platformAuditEvent.create({
      data: {
        actorUserId: req.user.id,
        action: "RESTART_DELEGATE_SERVER",
        payload: { result },
        ipAddress: req.ip,
      },
    }).catch((err) => {
      logger.error("Platform audit log (restart-delegate) failed", { error: err.message });
    });

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
