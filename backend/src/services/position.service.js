const prisma = require("../lib/prisma");
const logger = require("../lib/logger");

// Called after a Fill is recorded — creates or updates Position
async function upsertPositionFromFill(fill, proposal) {
  const side =
    fill.direction === "LONG" ? "LONG" :
    fill.direction === "SHORT" ? "SHORT" : "SPOT";

  const existingPosition = await prisma.position.findFirst({
    where: {
      portfolioId: proposal.portfolioId,
      assetId: fill.assetId,
      venueId: fill.venueId,
      status: "OPEN",
    },
  });

  if (existingPosition) {
    // Average into existing position
    const totalSize = existingPosition.size + fill.fillSize;
    const avgEntry =
      (existingPosition.entryPrice * existingPosition.size + fill.fillPrice * fill.fillSize) / totalSize;

    const updated = await prisma.position.update({
      where: { id: existingPosition.id },
      data: {
        size: totalSize,
        entryPrice: avgEntry,
        currentPrice: fill.fillPrice,
        unrealizedPnl: calculateUnrealizedPnl(side, totalSize, avgEntry, fill.fillPrice),
      },
      include: { asset: true, venue: true },
    });

    logger.info("Position averaged into", { positionId: updated.id, size: totalSize });
    return updated;
  }

  // Create new position
  const position = await prisma.position.create({
    data: {
      portfolioId: proposal.portfolioId,
      assetId: fill.assetId,
      venueId: fill.venueId,
      chainId: proposal.wallet.chainId,
      fillId: fill.id,
      side,
      size: fill.fillSize,
      entryPrice: fill.fillPrice,
      currentPrice: fill.fillPrice,
      unrealizedPnl: 0,
      realizedPnl: 0,
      status: "OPEN",
    },
    include: { asset: true, venue: true, chain: true },
  });

  logger.info("Position created", { positionId: position.id, asset: fill.assetId });
  return position;
}

// Called by market feed on price updates
async function updatePositionPrices(priceMap) {
  // priceMap = { SOL: 145.20, BTC: 68100, ETH: 3510 }
  const openPositions = await prisma.position.findMany({
    where: { status: "OPEN" },
    include: { asset: true },
  });

  for (const position of openPositions) {
    const newPrice = priceMap[position.asset.symbol];
    if (!newPrice) continue;

    const unrealizedPnl = calculateUnrealizedPnl(
      position.side, position.size, position.entryPrice, newPrice
    );

    await prisma.position.update({
      where: { id: position.id },
      data: { currentPrice: newPrice, unrealizedPnl },
    });
  }
}

function calculateUnrealizedPnl(side, size, entryPrice, currentPrice) {
  if (side === "SHORT") {
    return (entryPrice - currentPrice) * size;
  }
  return (currentPrice - entryPrice) * size;
}

// Atomically claims every COMPLETE, not-yet-credited deposit for a
// workspace and returns their total. Uses a single UPDATE...RETURNING
// statement (not a separate SELECT-then-UPDATE) so this is safe under
// concurrent callers: Postgres row-locks the matched rows for the
// duration of the UPDATE, so a second concurrent call for the same
// workspace can only see rows this call hasn't already claimed - a
// deposit is credited exactly once, ever, by construction, not by
// convention. Callers MUST run this inside the same transaction (`tx`)
// that persists whatever consumes the returned amount (e.g. a new
// PortfolioSnapshot), so a crash between the two can't lose or duplicate
// the credit.
async function creditPendingDeposits(tx, workspaceId) {
  const rows = await tx.$queryRaw`
    UPDATE deposits SET credited = true
    WHERE "workspaceId" = ${workspaceId} AND status = 'COMPLETE' AND credited = false
    RETURNING "depositAmount"
  `;
  return rows.reduce((sum, r) => sum + r.depositAmount, 0);
}

// Update portfolio snapshot with current NAV. Runs inside a transaction so
// that "claim pending deposits" and "persist the snapshot that reflects
// them" happen atomically - a crash or concurrent call can't credit a
// deposit without a snapshot recording it, or vice versa.
async function snapshotPortfolio(portfolioId) {
  return prisma.$transaction(async (tx) => {
    const positions = await tx.position.findMany({
      where: { portfolioId, status: "OPEN" },
    });

    const unrealizedPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
    const invested = positions.reduce((sum, p) => sum + p.size * p.entryPrice, 0);

    const portfolio = await tx.portfolio.findUnique({
      where: { id: portfolioId },
      select: { workspaceId: true },
    });

    const lastSnapshot = await tx.portfolioSnapshot.findFirst({
      where: { portfolioId },
      orderBy: { snappedAt: "desc" },
    });

    const realizedPnl = lastSnapshot?.realizedPnl || 0;
    // No more "only on the first-ever snapshot" branch: every snapshot
    // (first or not) carries forward whatever cash existed, then tops it
    // up with any deposits that completed since the last one - a repeat
    // deposit now actually reaches the tradeable balance instead of
    // silently vanishing.
    const previousCash = lastSnapshot ? lastSnapshot.cash : 0;
    const newlyCredited = portfolio ? await creditPendingDeposits(tx, portfolio.workspaceId) : 0;
    const startingCash = previousCash + newlyCredited;

    const nav = startingCash + unrealizedPnl + realizedPnl;

    return tx.portfolioSnapshot.create({
      data: { portfolioId, nav, invested, unrealizedPnl, realizedPnl, cash: nav - invested },
    });
  });
}

module.exports = { upsertPositionFromFill, updatePositionPrices, snapshotPortfolio, creditPendingDeposits };
