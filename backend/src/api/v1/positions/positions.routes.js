const express = require("express");
const prisma = require("../../../lib/prisma");
const { authenticate, requireWorkspace, requirePlatformAdmin, requirePlatformPermission } = require("../../../middleware/auth");
const { assertPositionAccess } = require("../../../middleware/ownership");
const { AppError } = require("../../../middleware/error");

const router = express.Router();

// GET /positions — all open positions across workspace portfolios
router.get("/", authenticate, requireWorkspace, async (req, res, next) => {
  try {
    const { status = "OPEN" } = req.query;

    const portfolios = await prisma.portfolio.findMany({
      where: { workspaceId: req.workspace.id },
      select: { id: true },
    });
    const portfolioIds = portfolios.map(p => p.id);

    const positions = await prisma.position.findMany({
      where: { portfolioId: { in: portfolioIds }, status },
      // fill.tradeProposal.transaction is included so the entry txHash is
      // available here too, not just on the single-position GET - needed
      // to show a real, clickable on-chain link per position in the list
      // view, not just a per-record lookup.
      include: {
        asset: true, venue: true, chain: true, portfolio: true,
        fill: { include: { tradeProposal: { include: { transaction: true } } } },
      },
      orderBy: { openedAt: "desc" },
    });

    res.json({ success: true, data: positions });
  } catch (err) { next(err); }
});

// GET /positions/settlement-issues — admin visibility into stuck/failed
// settlements (H4). Real user funds can be sitting unresolved here.
router.get("/settlement-issues", authenticate, requireWorkspace, async (req, res, next) => {
  try {
    const portfolios = await prisma.portfolio.findMany({
      where: { workspaceId: req.workspace.id },
      select: { id: true },
    });
    const portfolioIds = portfolios.map(p => p.id);

    const positions = await prisma.position.findMany({
      where: {
        portfolioId: { in: portfolioIds },
        settlementStatus: { in: ["SETTLEMENT_FAILED", "SETTLEMENT_PENDING"] },
      },
      include: { asset: true, venue: true, chain: true, portfolio: { select: { id: true, name: true } } },
      orderBy: { lastSettlementAt: "asc" },
    });

    res.json({ success: true, data: positions });
  } catch (err) { next(err); }
});

// GET /positions/:id
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    await assertPositionAccess(req.params.id, req.user.id);

    const position = await prisma.position.findUnique({
      where: { id: req.params.id },
      include: { asset: true, venue: true, chain: true, fill: { include: { venue: true } }, portfolio: true },
    });
    res.json({ success: true, data: position });
  } catch (err) { next(err); }
});

// ---------- ADMIN ROUTES ----------

// Same threshold settlementReconciliation.job.js uses to treat a
// SETTLEMENT_PENDING position as orphaned rather than still in-flight.
const ORPHAN_THRESHOLD_MS = 2 * 60 * 1000;

// GET /positions/admin/settlement-issues — platform-wide version of
// /settlement-issues above (that one is scoped to req.workspace.id).
router.get("/admin/settlement-issues", authenticate, requirePlatformAdmin, requirePlatformPermission("view_all"), async (req, res, next) => {
  try {
    const orphanCutoff = new Date(Date.now() - ORPHAN_THRESHOLD_MS);

    const positions = await prisma.position.findMany({
      where: {
        OR: [
          { settlementStatus: "SETTLEMENT_FAILED" },
          { settlementStatus: "SETTLEMENT_PENDING", lastSettlementAt: { lt: orphanCutoff } },
        ],
      },
      include: {
        asset: true, venue: true, chain: true,
        portfolio: { select: { id: true, name: true, workspaceId: true, workspace: { select: { name: true } } } },
      },
      orderBy: { lastSettlementAt: "asc" },
    });

    res.json({ success: true, data: { positions } });
  } catch (err) { next(err); }
});

module.exports = router;
