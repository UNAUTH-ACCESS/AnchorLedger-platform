/**
 * withdrawals.routes.js
 * Client-facing withdrawal requests. Debits PortfolioSnapshot.cash
 * optimistically at request time (not at payout time) so two overlapping
 * requests can't both succeed against the same starting balance - see the
 * row lock in POST /. Real payout is manual and happens entirely outside
 * this codebase (admin sends from SOLANA_DEPOSIT_VAULT themselves); see
 * ../admin/withdrawals.routes.js for the review/payout side.
 */
const express = require("express");
const { PublicKey } = require("@solana/web3.js");
const prisma = require("../../../lib/prisma");
const logger = require("../../../lib/logger");
const { authenticate, requireWorkspace } = require("../../../middleware/auth");
const { assertPortfolioAccess } = require("../../../middleware/ownership");
const { AppError } = require("../../../middleware/error");
const { creditPendingDeposits } = require("../../../services/position.service");

const router = express.Router();

function isValidSolanaAddress(address) {
  try {
    // on-curve check excludes obviously-wrong input (wrong length, bad
    // base58, a PDA typo'd in) without needing a live RPC call here
    return PublicKey.isOnCurve(new PublicKey(address).toBytes());
  } catch {
    return false;
  }
}

// GET /withdrawals?portfolioId=X — current available balance + history
router.get("/", authenticate, requireWorkspace, async (req, res, next) => {
  try {
    const { portfolioId } = req.query;
    if (!portfolioId) throw new AppError("portfolioId is required", 400, "BAD_REQUEST");

    const portfolio = await assertPortfolioAccess(portfolioId, req.user.id);
    if (portfolio.workspaceId !== req.workspace.id) throw new AppError("Not found", 404, "NOT_FOUND");

    const lastSnapshot = await prisma.portfolioSnapshot.findFirst({
      where: { portfolioId },
      orderBy: { snappedAt: "desc" },
    });

    const withdrawals = await prisma.withdrawal.findMany({
      where: { portfolioId },
      orderBy: { requestedAt: "desc" },
    });

    res.json({
      success: true,
      data: { availableBalance: lastSnapshot?.cash ?? 0, withdrawals },
    });
  } catch (err) { next(err); }
});

// POST /withdrawals — { portfolioId, amount, destinationAddress }
router.post("/", authenticate, requireWorkspace, async (req, res, next) => {
  try {
    const { portfolioId, amount, destinationAddress } = req.body || {};

    if (!portfolioId) throw new AppError("portfolioId is required", 400, "BAD_REQUEST");
    if (typeof amount !== "number" || !(amount > 0)) {
      throw new AppError("amount must be a positive number", 400, "VALIDATION_ERROR");
    }
    if (!destinationAddress || !isValidSolanaAddress(destinationAddress)) {
      throw new AppError("destinationAddress is not a valid Solana address", 400, "VALIDATION_ERROR");
    }

    const portfolio = await assertPortfolioAccess(portfolioId, req.user.id);
    if (portfolio.workspaceId !== req.workspace.id) throw new AppError("Not found", 404, "NOT_FOUND");

    const withdrawal = await prisma.$transaction(async (tx) => {
      // Row-lock the portfolio for the duration of this transaction so a
      // second, concurrent withdrawal request for the SAME portfolio can't
      // read the same pre-debit balance and also succeed - it blocks here
      // until this transaction commits, then re-reads the now-debited state.
      await tx.$queryRaw`SELECT id FROM portfolios WHERE id = ${portfolioId} FOR UPDATE`;

      const positions = await tx.position.findMany({ where: { portfolioId, status: "OPEN" } });
      const unrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
      const invested = positions.reduce((sum, p) => sum + p.size * p.entryPrice, 0);

      const lastSnapshot = await tx.portfolioSnapshot.findFirst({
        where: { portfolioId },
        orderBy: { snappedAt: "desc" },
      });
      const realizedPnl = lastSnapshot?.realizedPnl || 0;
      const previousCash = lastSnapshot ? lastSnapshot.cash : 0;

      // Credit anything that completed since the last snapshot first, so
      // the balance check below reflects the truly current state, not a
      // stale one that's missing a deposit that finished seconds ago.
      const newlyCredited = await creditPendingDeposits(tx, portfolio.workspaceId);
      const availableBeforeDebit = previousCash + newlyCredited;

      if (amount > availableBeforeDebit) {
        throw new AppError(
          `Requested amount ($${amount.toFixed(2)}) exceeds available balance ($${availableBeforeDebit.toFixed(2)})`,
          400, "INSUFFICIENT_BALANCE"
        );
      }

      const w = await tx.withdrawal.create({
        data: {
          workspaceId: req.workspace.id,
          userId: req.user.id,
          portfolioId,
          amount,
          destinationAddress,
          status: "PENDING",
        },
      });

      const nav = availableBeforeDebit - amount + unrealizedPnl + realizedPnl;
      await tx.portfolioSnapshot.create({
        data: { portfolioId, nav, invested, unrealizedPnl, realizedPnl, cash: nav - invested },
      });

      return w;
    });

    logger.info("[withdrawals] Withdrawal requested", {
      withdrawalId: withdrawal.id, workspaceId: req.workspace.id, portfolioId, amount,
    });

    res.status(201).json({ success: true, data: withdrawal });
  } catch (err) { next(err); }
});

module.exports = router;
