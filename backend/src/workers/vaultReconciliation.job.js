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

  return result;
}

module.exports = { checkVaultReconciliation };
