/**
 * processSafety.js
 * Last-resort process-level error handlers.
 *
 * Before this, an un-awaited promise rejection or a synchronous throw
 * outside a request handler took the process down with nothing in the logs
 * — the worker and delegate-server both did this repeatedly, leaving only
 * docker/PM2's "restarted" counter as evidence. These handlers do NOT try
 * to keep a broken process alive (that hides real corruption); they make
 * sure the reason is always logged first, then exit non-zero so the
 * supervisor (docker `restart: unless-stopped` / PM2) restarts cleanly.
 */

const logger = require("./logger");

function install(serviceName = "process") {
  let shuttingDown = false;

  const fatal = (kind, err) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const e = err instanceof Error ? err : new Error(String(err));
    logger.error(`[${serviceName}] ${kind} — exiting for a clean restart`, {
      error: e.message,
      stack: e.stack,
    });
    // Give winston's console transport a tick to flush before the process dies.
    setTimeout(() => process.exit(1), 100).unref();
  };

  process.on("unhandledRejection", (reason) => fatal("Unhandled promise rejection", reason));
  process.on("uncaughtException", (err) => fatal("Uncaught exception", err));
}

module.exports = { install };
