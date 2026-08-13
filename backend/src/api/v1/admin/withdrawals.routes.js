/**
 * admin/withdrawals.routes.js
 *
 * Admin → Operations → Withdrawals. List embeds everything an admin needs
 * to action a request (amount, destination, requester, workspace) in one
 * response — same "no DB query to action" convention as clients.routes.js:
 * bulk-fetch related rows in parallel, stitch by id in JS, rather than a
 * deep nested include per row.
 *
 * "Mark as paid" never trusts the admin's word on its own — it calls
 * delegate-server's /verify-payout, which inspects the real on-chain
 * balance change for the given signature (see DelegateService.verifyPayout).
 * The real payout itself happens entirely outside this codebase — an admin
 * sends the USDC from SOLANA_DEPOSIT_VAULT using their own wallet, since
 * that key deliberately isn't on this server.
 */
const express = require("express");
const router = express.Router();

const prisma = require("../../../lib/prisma");
const logger = require("../../../lib/logger");
const { authenticate, requirePlatformAdmin, requirePlatformPermission } = require("../../../middleware/auth");
const { AppError } = require("../../../middleware/error");
const DelegateService = require("../../../lib/delegate/delegate.service");

// GET /admin/withdrawals — every request, newest first, full detail inline.
router.get("/withdrawals", authenticate, requirePlatformAdmin, requirePlatformPermission("manage_withdrawals"), async (req, res, next) => {
  try {
    const withdrawals = await prisma.withdrawal.findMany({
      orderBy: { requestedAt: "desc" },
    });

    const userIds = [...new Set(withdrawals.map(w => w.userId))];
    const workspaceIds = [...new Set(withdrawals.map(w => w.workspaceId))];
    const portfolioIds = [...new Set(withdrawals.map(w => w.portfolioId))];

    const [users, workspaces, portfolios] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } }),
      prisma.workspace.findMany({ where: { id: { in: workspaceIds } }, select: { id: true, name: true, slug: true } }),
      prisma.portfolio.findMany({ where: { id: { in: portfolioIds } }, select: { id: true, name: true } }),
    ]);

    const userById = Object.fromEntries(users.map(u => [u.id, u]));
    const workspaceById = Object.fromEntries(workspaces.map(w => [w.id, w]));
    const portfolioById = Object.fromEntries(portfolios.map(p => [p.id, p]));

    const data = withdrawals.map(w => ({
      ...w,
      requester: userById[w.userId] || null,
      workspace: workspaceById[w.workspaceId] || null,
      portfolio: portfolioById[w.portfolioId] || null,
    }));

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /admin/withdrawals/:id/mark-paid — { payoutTxHash }
router.post("/withdrawals/:id/mark-paid", authenticate, requirePlatformAdmin, requirePlatformPermission("manage_withdrawals"), async (req, res, next) => {
  try {
    const { payoutTxHash } = req.body || {};
    if (!payoutTxHash || typeof payoutTxHash !== "string") {
      throw new AppError("payoutTxHash is required", 400, "VALIDATION_ERROR");
    }

    const withdrawal = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
    if (!withdrawal) throw new AppError("Not found", 404, "NOT_FOUND");
    if (withdrawal.status !== "PENDING") {
      throw new AppError(`Withdrawal is already ${withdrawal.status}, not PENDING`, 409, "INVALID_STATE");
    }

    const verification = await DelegateService.verifyPayout(
      payoutTxHash, withdrawal.amount, withdrawal.destinationAddress
    );

    if (!verification.verified) {
      throw new AppError(
        `On-chain verification failed: ${verification.reason || "unknown reason"}`,
        422, "PAYOUT_NOT_VERIFIED"
      );
    }

    // Guard on status = 'PENDING' so this can't double-apply even if two
    // mark-paid requests for the same withdrawal race each other.
    const result = await prisma.withdrawal.updateMany({
      where: { id: withdrawal.id, status: "PENDING" },
      data: {
        status: "PAID",
        payoutTxHash,
        reviewedAt: new Date(),
        reviewedByAdminId: req.user.id,
        completedAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new AppError("Withdrawal was already reviewed by someone else — refresh and check its current status", 409, "INVALID_STATE");
    }

    await prisma.platformAuditEvent.create({
      data: {
        actorUserId: req.user.id,
        action: "WITHDRAWAL_MARKED_PAID",
        targetWorkspace: withdrawal.workspaceId,
        payload: { withdrawalId: withdrawal.id, amount: withdrawal.amount, payoutTxHash, verification: verification.details },
        ipAddress: req.ip,
      },
    }).catch((err) => {
      logger.error("Platform audit log (withdrawal mark-paid) failed", { error: err.message });
    });

    const updated = await prisma.withdrawal.findUnique({ where: { id: withdrawal.id } });
    logger.info("[admin/withdrawals] Marked paid, on-chain verified", {
      withdrawalId: withdrawal.id, payoutTxHash, adminId: req.user.id,
    });

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// POST /admin/withdrawals/:id/reject — { reason }
// Reverses the optimistic debit made at request time by crediting the
// amount back via a new snapshot — the withdrawal is undone, not just
// marked closed.
router.post("/withdrawals/:id/reject", authenticate, requirePlatformAdmin, requirePlatformPermission("manage_withdrawals"), async (req, res, next) => {
  try {
    const { reason } = req.body || {};

    const withdrawal = await prisma.withdrawal.findUnique({ where: { id: req.params.id } });
    if (!withdrawal) throw new AppError("Not found", 404, "NOT_FOUND");
    if (withdrawal.status !== "PENDING") {
      throw new AppError(`Withdrawal is already ${withdrawal.status}, not PENDING`, 409, "INVALID_STATE");
    }

    await prisma.$transaction(async (tx) => {
      // Row-lock the portfolio, same as the original debit, so this
      // reversal can't race a concurrent new withdrawal request or another
      // reject/mark-paid attempt on the same portfolio.
      await tx.$queryRaw`SELECT id FROM portfolios WHERE id = ${withdrawal.portfolioId} FOR UPDATE`;

      // Guard on status = 'PENDING' inside the transaction too — if two
      // reject calls raced past the earlier findUnique check, only one can
      // win this update, so the reversal itself can only ever apply once.
      const claim = await tx.withdrawal.updateMany({
        where: { id: withdrawal.id, status: "PENDING" },
        data: {
          status: "REJECTED",
          rejectionReason: reason || null,
          reviewedAt: new Date(),
          reviewedByAdminId: req.user.id,
        },
      });
      if (claim.count === 0) {
        throw new AppError("Withdrawal was already reviewed by someone else — refresh and check its current status", 409, "INVALID_STATE");
      }

      const positions = await tx.position.findMany({ where: { portfolioId: withdrawal.portfolioId, status: "OPEN" } });
      const unrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
      const invested = positions.reduce((sum, p) => sum + p.size * p.entryPrice, 0);

      const lastSnapshot = await tx.portfolioSnapshot.findFirst({
        where: { portfolioId: withdrawal.portfolioId },
        orderBy: { snappedAt: "desc" },
      });
      const realizedPnl = lastSnapshot?.realizedPnl || 0;
      const previousCash = lastSnapshot ? lastSnapshot.cash : 0;

      // The reversal: add the withdrawn amount back. No deposit-crediting
      // here — this snapshot's only job is undoing the earlier debit.
      const nav = previousCash + withdrawal.amount + unrealizedPnl + realizedPnl;
      await tx.portfolioSnapshot.create({
        data: { portfolioId: withdrawal.portfolioId, nav, invested, unrealizedPnl, realizedPnl, cash: nav - invested },
      });
    });

    await prisma.platformAuditEvent.create({
      data: {
        actorUserId: req.user.id,
        action: "WITHDRAWAL_REJECTED",
        targetWorkspace: withdrawal.workspaceId,
        payload: { withdrawalId: withdrawal.id, amount: withdrawal.amount, reason: reason || null },
        ipAddress: req.ip,
      },
    }).catch((err) => {
      logger.error("Platform audit log (withdrawal reject) failed", { error: err.message });
    });

    const updated = await prisma.withdrawal.findUnique({ where: { id: withdrawal.id } });
    logger.info("[admin/withdrawals] Rejected, debit reversed", {
      withdrawalId: withdrawal.id, adminId: req.user.id, reason,
    });

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

module.exports = router;
