/**
 * vaultReconciliation.job.js
 *
 * Compares what the internal ledger thinks is owed against what's actually
 * sitting in SOLANA_DEPOSIT_VAULT on-chain. Nothing else in this codebase
 * does this - deposit crediting, withdrawal debiting, and payout
 * verification are each individually correct, but nothing checks that
 * their combined effect still matches on-chain reality. This is the check
 * that catches a bug (or a manual DB edit, or a missed sweep) before a
 * client notices their balance is wrong.
 *
 * expectedVaultBalance = sum(COMPLETE deposits) - sum(PAID withdrawals)
 * actualVaultBalance   = real on-chain USDC balance of the vault
 *
 * A mismatch beyond TOLERANCE_USDC is logged at error level - loud enough
 * to alert on, not wired to email/Resend here since that'd duplicate
 * DELEGATE_SHARED_SECRET-style plumbing for a first pass. Also exposed
 * live via GET /admin/vault-reconciliation so an admin can check current
 * status on demand, not just wait for a log line.
 */
const prisma = require("../lib/prisma");
const logger = require("../lib/logger");
const DelegateService = require("../lib/delegate/delegate.service");

const TOLERANCE_USDC = 0.01; // rounding-only slack, not a real allowance

// Same operational alert inbox delegate-watchdog.sh uses - one inbox to
// watch, not two. Previously defaulted to iheartefe@gmail.com because
// Resend's account was sandboxed (unverified domain only delivers to the
// account owner); anchorledger.space is now verified, so this can point
// back at the real operational address.
const ALERT_EMAIL = process.env.RECONCILIATION_ALERT_EMAIL || "appointments.douglaseze@gmail.com";

async function sendMismatchAlert(result) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.error("[vaultReconciliation] Cannot send alert email - RESEND_API_KEY not configured");
    return;
  }
  const fromAddress = process.env.FROM_EMAIL || "Anchor Ledger <onboarding@resend.dev>";

  const body = result.error
    ? `Could not read the vault's on-chain balance: ${result.error}\n\nChecked at ${result.checkedAt}.`
    : `Internal ledger and on-chain vault balance disagree.\n\n` +
      `Total deposited (COMPLETE):  $${result.totalDeposited}\n` +
      `Total withdrawn (PAID):      $${result.totalWithdrawn}\n` +
      `Expected vault balance:      $${result.expectedVaultBalance}\n` +
      `Actual on-chain balance:     $${result.actualVaultBalance}\n` +
      `Discrepancy:                 $${result.discrepancy}\n\n` +
      `Checked at ${result.checkedAt}. See Admin -> Operations -> System Health for live detail.`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddress,
        to: [ALERT_EMAIL],
        subject: `[Anchor Ledger] Vault reconciliation ${result.error ? "check failed" : "MISMATCH"}`,
        text: body,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      logger.error("[vaultReconciliation] Alert email failed to send", { status: res.status, body: errBody });
      return;
    }
    logger.info("[vaultReconciliation] Alert email sent", { to: ALERT_EMAIL });
  } catch (err) {
    logger.error("[vaultReconciliation] Alert email failed to send", { error: err.message });
  }
}

// In-memory only (resets on restart, acceptable for a first pass) - avoids
// re-sending the identical alert every 30 minutes forever for one ongoing,
// already-known issue, while still re-alerting immediately if the specific
// problem changes, and reminding periodically so it can't be silently
// ignored indefinitely either.
const REMINDER_INTERVAL_MS = 12 * 60 * 60 * 1000;
let lastAlert = { discrepancy: undefined, error: undefined, alertedAt: 0 };

function shouldAlert(result) {
  const changed = result.error !== lastAlert.error || result.discrepancy !== lastAlert.discrepancy;
  const dueForReminder = Date.now() - lastAlert.alertedAt > REMINDER_INTERVAL_MS;
  return changed || dueForReminder;
}

async function checkVaultReconciliation() {
  const [depositAgg, withdrawalAgg] = await Promise.all([
    prisma.deposit.aggregate({ where: { status: "COMPLETE" }, _sum: { depositAmount: true } }),
    prisma.withdrawal.aggregate({ where: { status: "PAID" }, _sum: { amount: true } }),
  ]);

  const totalDeposited = depositAgg._sum.depositAmount || 0;
  const totalWithdrawn = withdrawalAgg._sum.amount || 0;
  const expectedVaultBalance = totalDeposited - totalWithdrawn;

  let actualVaultBalance = null;
  let error = null;
  try {
    actualVaultBalance = await DelegateService.getVaultUsdcBalance();
  } catch (err) {
    error = err.message;
  }

  const discrepancy = actualVaultBalance !== null ? actualVaultBalance - expectedVaultBalance : null;
  const ok = error === null && Math.abs(discrepancy) <= TOLERANCE_USDC;

  const result = {
    checkedAt: new Date().toISOString(),
    totalDeposited,
    totalWithdrawn,
    expectedVaultBalance,
    actualVaultBalance,
    discrepancy,
    ok,
    error,
  };

  if (error) {
    logger.error("[vaultReconciliation] Could not read on-chain vault balance", result);
  } else if (!ok) {
    logger.error("[vaultReconciliation] MISMATCH between internal ledger and real vault balance", result);
  } else {
    logger.info("[vaultReconciliation] OK", result);
  }

  if (!ok && shouldAlert(result)) {
    lastAlert = { discrepancy, error, alertedAt: Date.now() };
    await sendMismatchAlert(result);
  }

  return result;
}

module.exports = { checkVaultReconciliation };
