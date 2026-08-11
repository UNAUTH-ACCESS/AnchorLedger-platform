/**
 * clients.routes.js
 *
 * Admin → Operations → Clients. One row per workspace, ranked by risk
 * signal rather than alphabetically — the goal is "who needs attention
 * right now," not a roster. See investigation notes below for what's
 * genuinely trackable vs assumed.
 *
 * Two things worth knowing before touching this file:
 *
 * 1. RiskEvent is an append-only log, not a ticket system — there is no
 *    resolved/unresolved field (`actionTaken` is a free-text note set once
 *    at creation, never updated). "Unresolved" isn't literally trackable,
 *    so RISK_EVENT_LOOKBACK_MS below is a recency proxy instead: an event
 *    inside the window counts toward the red tier, anything older is still
 *    shown in the client's history but doesn't by itself flag them.
 *
 * 2. SETTLEMENT_FAILED is NOT a RiskEventType — it only lives on
 *    Position.settlementStatus (same field the Stuck Settlements tab
 *    reads), and unlike RiskEvent that field IS mutable current state, so
 *    it has a clean resolved/unresolved meaning on its own.
 */
const express = require("express");
const router = express.Router();

const prisma = require("../../../lib/prisma");
const { authenticate, requirePlatformAdmin, requirePlatformPermission } = require("../../../middleware/auth");

// Same as settlementReconciliation.job.js — a SETTLEMENT_PENDING position
// with no update in this long is orphaned, not still in-flight.
const ORPHAN_THRESHOLD_MS = 2 * 60 * 1000;

// Recency window for counting a RiskEvent toward the red tier. There's no
// resolved/unresolved field to key off (see file header), so this is a
// judgment call: a drawdown breach or liquidation from 2 months ago
// probably isn't "needs attention right now" on a live trading platform.
const RISK_EVENT_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

router.get("/clients", authenticate, requirePlatformAdmin, requirePlatformPermission("view_all"), async (req, res, next) => {
  try {
    const workspaces = await prisma.workspace.findMany({
      include: {
        owner: { select: { id: true, email: true, name: true, kycStatus: true, emailVerified: true, twoFactorEnabled: true, createdAt: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    const wsIds = workspaces.map(w => w.id);

    const portfolios = await prisma.portfolio.findMany({
      where: { workspaceId: { in: wsIds } },
      select: { id: true, workspaceId: true },
    });
    const portfolioIds = portfolios.map(p => p.id);
    const portfolioToWs = new Map(portfolios.map(p => [p.id, p.workspaceId]));
    const wsToPortfolios = new Map(wsIds.map(id => [id, portfolios.filter(p => p.workspaceId === id).map(p => p.id)]));

    const [latestSnapshots, proposals, positions, riskEvents, wallets, deposits, deliveries, eSigEvents, memberships] = await Promise.all([
      Promise.all(portfolioIds.map(pid =>
        prisma.portfolioSnapshot.findFirst({ where: { portfolioId: pid }, orderBy: { snappedAt: "desc" }, select: { portfolioId: true, nav: true } })
      )),
      prisma.tradeProposal.findMany({
        where: { portfolioId: { in: portfolioIds } },
        select: { portfolioId: true, status: true, proposedAt: true },
      }),
      prisma.position.findMany({
        where: { portfolioId: { in: portfolioIds } },
        select: { portfolioId: true, status: true, realizedPnl: true, openedAt: true, settlementStatus: true, lastSettlementAt: true },
      }),
      prisma.riskEvent.findMany({
        where: { portfolioId: { in: portfolioIds } },
        orderBy: { triggeredAt: "desc" },
        select: { portfolioId: true, type: true, value: true, threshold: true, triggeredAt: true },
      }),
      prisma.wallet.findMany({
        where: { workspaceId: { in: wsIds } },
        include: { chain: { select: { type: true } } },
      }),
      prisma.deposit.findMany({
        where: { workspaceId: { in: wsIds } },
        select: { workspaceId: true, status: true, depositAmount: true },
      }),
      prisma.notificationDelivery.findMany({
        where: { status: "FAILED", notification: { workspaceId: { in: wsIds } } },
        select: { notification: { select: { workspaceId: true } } },
      }),
      prisma.auditEvent.findMany({
        where: { workspaceId: { in: wsIds }, action: "E_SIGNATURE" },
        orderBy: { ts: "desc" },
        select: { workspaceId: true, ts: true },
      }),
      prisma.membership.findMany({
        where: { workspaceId: { in: wsIds }, status: "ACTIVE" },
        select: { workspaceId: true, userId: true },
      }),
    ]);

    // Wallet.userId has no Prisma relation to User (raw FK only), so the
    // compliance-gap check needs a separate lookup for each wallet owner's
    // kycStatus rather than an include.
    const walletUserIds = [...new Set(wallets.map(w => w.userId))];
    const walletUsers = await prisma.user.findMany({ where: { id: { in: walletUserIds } }, select: { id: true, kycStatus: true } });
    const kycByUserId = new Map(walletUsers.map(u => [u.id, u.kycStatus]));

    const memberUserIds = [...new Set(memberships.map(m => m.userId))];
    const knownDevices = await prisma.knownDevice.findMany({
      where: { userId: { in: memberUserIds } },
      select: { userId: true, lastSeenAt: true },
    });
    const lastSeenByUserId = new Map();
    for (const d of knownDevices) {
      const prev = lastSeenByUserId.get(d.userId);
      if (!prev || d.lastSeenAt > prev) lastSeenByUserId.set(d.userId, d.lastSeenAt);
    }

    const orphanCutoff = new Date(Date.now() - ORPHAN_THRESHOLD_MS);
    const riskCutoff = new Date(Date.now() - RISK_EVENT_LOOKBACK_MS);

    const clients = workspaces.map((ws) => {
      const pIds = wsToPortfolios.get(ws.id) || [];

      const navRows = latestSnapshots.filter(s => s && pIds.includes(s.portfolioId));
      const nav = navRows.length ? navRows.reduce((sum, s) => sum + s.nav, 0) : null;

      const wsProposals = proposals.filter(p => pIds.includes(p.portfolioId));
      const byStatus = {};
      let lastTradeAt = null;
      for (const p of wsProposals) {
        byStatus[p.status] = (byStatus[p.status] || 0) + 1;
        if (!lastTradeAt || p.proposedAt > lastTradeAt) lastTradeAt = p.proposedAt;
      }

      const wsPositions = positions.filter(p => pIds.includes(p.portfolioId));
      const open = wsPositions.filter(p => p.status === "OPEN").length;
      const closed = wsPositions.filter(p => p.status === "CLOSED").length;
      const realizedPnl = wsPositions.reduce((sum, p) => sum + p.realizedPnl, 0);
      const stuckSettlements = wsPositions.filter(p =>
        p.settlementStatus === "SETTLEMENT_FAILED" ||
        (p.settlementStatus === "SETTLEMENT_PENDING" && p.lastSettlementAt && p.lastSettlementAt < orphanCutoff)
      ).length;

      const wsRiskEvents = riskEvents.filter(e => pIds.includes(e.portfolioId));
      const recentRiskEvents = wsRiskEvents.filter(e => e.triggeredAt > riskCutoff);

      const wsWallets = wallets.filter(w => w.workspaceId === ws.id);
      const complianceGap = wsWallets.some(w => w.delegateApproved && kycByUserId.get(w.userId) !== "APPROVED");

      const wsDeposits = deposits.filter(d => d.workspaceId === ws.id);
      const mintedDeposits = wsDeposits.filter(d => d.status === "MINTED");
      const totalDeposited = mintedDeposits.reduce((sum, d) => sum + d.depositAmount, 0);

      const deliveryFailureCount = deliveries.filter(d => d.notification.workspaceId === ws.id).length;

      const eSig = eSigEvents.find(e => e.workspaceId === ws.id) || null;

      const wsMemberIds = memberships.filter(m => m.workspaceId === ws.id).map(m => m.userId);
      let lastActiveAt = null;
      for (const uid of wsMemberIds) {
        const seen = lastSeenByUserId.get(uid);
        if (seen && (!lastActiveAt || seen > lastActiveAt)) lastActiveAt = seen;
      }

      const flags = {
        riskEvents: recentRiskEvents.length > 0,
        stuckSettlement: stuckSettlements > 0,
        complianceGap,
        deliveryFailures: deliveryFailureCount > 0,
      };

      const tier = (flags.riskEvents || flags.stuckSettlement || flags.complianceGap)
        ? "red"
        : (flags.deliveryFailures ? "yellow" : "green");

      const mostRecentSignalAt = [
        ...(flags.riskEvents ? [recentRiskEvents[0].triggeredAt] : []),
        ...(flags.stuckSettlement ? wsPositions.filter(p => p.settlementStatus === "SETTLEMENT_FAILED").map(p => p.lastSettlementAt).filter(Boolean) : []),
      ].sort((a, b) => b - a)[0] || null;

      const onboarding = ws.settings?.onboarding || { stage: 3, complete: false, data: {} };

      return {
        workspaceId: ws.id,
        name: ws.name,
        status: ws.status,
        createdAt: ws.createdAt,
        owner: ws.owner,
        onboarding: { stage: onboarding.stage, complete: onboarding.complete },
        eSignature: { completed: !!eSig, agreedAt: eSig?.ts || null },
        wallets: wsWallets.map(w => ({ chain: w.chain?.type, delegateApproved: w.delegateApproved })),
        deposits: { hasDeposited: mintedDeposits.length > 0, totalDeposited },
        portfolio: { exists: pIds.length > 0, nav },
        trades: { total: wsProposals.length, byStatus, lastTradeAt },
        positions: { open, closed, realizedPnl },
        riskEvents: wsRiskEvents.slice(0, 5),
        stuckSettlements,
        deliveryFailureCount,
        lastActiveAt,
        tier,
        flags,
        mostRecentSignalAt,
      };
    });

    const tierRank = { red: 0, yellow: 1, green: 2 };
    clients.sort((a, b) => {
      if (tierRank[a.tier] !== tierRank[b.tier]) return tierRank[a.tier] - tierRank[b.tier];
      if (a.tier === "red") return (b.mostRecentSignalAt || 0) - (a.mostRecentSignalAt || 0);
      return a.name.localeCompare(b.name);
    });

    res.json({ success: true, data: { clients } });
  } catch (err) { next(err); }
});

module.exports = router;
