/**
 * Order-Flow Momentum Strategy
 *
 * A self-contained strategy engine, deliberately kept separate from the
 * older signal-generation code in workers/simulation.worker.js rather than
 * patching it - this strategy's accounting (sizing, exit rules) needs to be
 * trustworthy on its own, independent of whatever bugs may or may not exist
 * in the older shared path.
 *
 * Thesis: SOL order-book imbalance carries short-horizon predictive power
 * for near-term price pressure (a well-studied microstructure effect at
 * these timeframes). BTC's own momentum is used only as a veto - if BTC is
 * clearly moving against the imbalance-implied direction, skip the trade
 * rather than fight a macro move with a short-term signal.
 *
 * Reuses the existing evaluate -> propose -> autosign -> execute pipeline
 * unchanged (it already performs the real on-chain settlement this
 * strategy needs) - only signal generation, position sizing, and exit
 * rules are strategy-specific.
 */

const prisma = require("../lib/prisma");
const logger = require("../lib/logger");
const { evaluateSignal } = require("./evaluation.service");
const { autoSignPendingProposals } = require("./autosign.service");
const { closePosition } = require("./exit.service");

const STRATEGY_NAME = "OrderFlowMomentum";

// ── Entry parameters ─────────────────────────────────────────────────────
const IMBALANCE_ENTRY_THRESHOLD = 0.35; // |bid_ask_imbalance| must clear this
const BTC_VETO_PCT              = 0.004; // 0.4% - BTC move opposing the imbalance direction cancels the trade

// ── Exit parameters — short horizon, matching the order-flow thesis ─────
const TAKE_PROFIT_PCT = 0.8;  // close winners at +0.8% notional move
const STOP_LOSS_PCT   = 0.6;  // close losers at -0.6% notional move
const TTL_MS          = 20 * 60 * 1000; // 20 minutes - the thesis decays over minutes, not hours

// ── Sizing parameters ────────────────────────────────────────────────────
const FIXED_SIZE_PCT       = 0.01; // 1% of NAV per trade until enough real outcomes exist
const MIN_TRADES_FOR_KELLY = 20;
const KELLY_MULTIPLIER     = 0.25; // quarter-Kelly - conservative given a still-small sample

// Rolling daily cap - a handful of trades a day (3-5) is the intended
// pace, not a one-time lifetime budget. Counts against a trailing 24h
// window rather than all-time, so it naturally resets day to day instead
// of permanently jamming once the cap is hit once. Existing open
// positions still exit normally via checkOrderFlowMomentumExits
// regardless of this cap.
const MAX_TRADES_CAP = parseInt(process.env.ORDER_FLOW_MAX_TRADES_CAP || "5");
const TRADES_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Compute direction and strength from live features. Returns
 * { skip: true, reason } if no trade should be generated this cycle.
 */
function computeOrderFlowSignal(features, regimeState) {
  if (!features || typeof features.bid_ask_imbalance !== "number") {
    return { skip: true, reason: "NO_FEATURES" };
  }

  if (regimeState?.state === "STRESS") {
    return { skip: true, reason: "STRESS_REGIME" };
  }

  const imbalance = features.bid_ask_imbalance;
  const strength = Math.abs(imbalance);

  if (strength < IMBALANCE_ENTRY_THRESHOLD) {
    return { skip: true, reason: "BELOW_THRESHOLD", strength };
  }

  const direction = imbalance > 0 ? "LONG" : "SHORT";
  const btcMove = features.btc_change_30m || 0;

  // Veto: BTC moving clearly against the imbalance-implied direction
  if (direction === "LONG" && btcMove < -BTC_VETO_PCT) {
    return { skip: true, reason: "BTC_VETO", strength };
  }
  if (direction === "SHORT" && btcMove > BTC_VETO_PCT) {
    return { skip: true, reason: "BTC_VETO", strength };
  }

  return { skip: false, direction, strength };
}

/**
 * TradeProposal has no navigable relation to Signal (only a plain signalId
 * scalar field) - so tracing "trades this SignalConfig generated" has to go
 * through signal IDs explicitly rather than a single nested Prisma filter.
 */
async function getSignalIdsForConfig(signalConfigId) {
  const signals = await prisma.signal.findMany({
    where: { signalConfigId },
    select: { id: true },
  });
  return signals.map(s => s.id);
}

/**
 * Real observed win rate / payout ratio for this strategy's own completed
 * trades - computed from actual Position rows, not assumed. Traces
 * Position -> Fill -> TradeProposal -> signalId to find only trades this
 * strategy itself generated.
 */
async function getRealTradeStats(signalConfigId) {
  const signalIds = await getSignalIdsForConfig(signalConfigId);
  if (signalIds.length === 0) return { count: 0, winRate: 0, payoutRatio: 0 };

  const positions = await prisma.position.findMany({
    where: {
      status: "CLOSED",
      fill: { tradeProposal: { signalId: { in: signalIds } } },
    },
    select: { realizedPnl: true },
  });

  const wins = positions.filter(p => p.realizedPnl > 0);
  const losses = positions.filter(p => p.realizedPnl <= 0);

  if (positions.length === 0) return { count: 0, winRate: 0, payoutRatio: 0 };

  const winRate = wins.length / positions.length;
  const avgWin = wins.length ? wins.reduce((s, p) => s + p.realizedPnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, p) => s + p.realizedPnl, 0) / losses.length) : 0;
  const payoutRatio = avgLoss > 0 ? avgWin / avgLoss : 0;

  return { count: positions.length, winRate, payoutRatio };
}

/**
 * Position size as a fraction of NAV. Fixed and conservative until a real
 * sample of this strategy's own trades exists, then real fractional-Kelly
 * from observed win rate / payout - never an assumed or invented edge.
 */
async function computeSizePct(signalConfigId) {
  const stats = await getRealTradeStats(signalConfigId);

  if (stats.count < MIN_TRADES_FOR_KELLY) {
    return { sizePct: FIXED_SIZE_PCT, basis: "FIXED", sampleSize: stats.count };
  }

  if (stats.payoutRatio <= 0) {
    // No real payout data (e.g. all losses so far) - stay at the fixed floor
    return { sizePct: FIXED_SIZE_PCT, basis: "FIXED_NO_PAYOUT_DATA", sampleSize: stats.count };
  }

  const p = stats.winRate;
  const b = stats.payoutRatio;
  const fullKelly = p - (1 - p) / b;
  const kellySizePct = Math.max(0, fullKelly * KELLY_MULTIPLIER);

  logger.info("[orderFlowMomentum] Kelly sizing applied", {
    signalConfigId, sampleSize: stats.count, winRate: p.toFixed(3), payoutRatio: b.toFixed(3), kellySizePct: kellySizePct.toFixed(4),
  });

  return { sizePct: kellySizePct, basis: "KELLY", sampleSize: stats.count, winRate: p, payoutRatio: b };
}

/**
 * Generate a signal for the OrderFlowMomentum strategy, if conditions are
 * met, and run it through the existing evaluate/propose/autosign pipeline.
 * livePrice is passed through so the resulting proposal is priced off a
 * real current SOL price, not the shared pipeline's hardcoded mock.
 */
async function runOrderFlowMomentumCycle(features, livePrice) {
  try {
    const config = await prisma.signalConfig.findFirst({
      where: { strategy: { name: STRATEGY_NAME }, status: "FROZEN" },
    });
    if (!config) return;

    const existingSignalIds = await getSignalIdsForConfig(config.id);
    const tradesOpened = await prisma.tradeProposal.count({
      where: {
        signalId: { in: existingSignalIds },
        status: { in: ["CONFIRMED", "SUBMITTED", "SIGNED"] },
        proposedAt: { gte: new Date(Date.now() - TRADES_WINDOW_MS) },
      },
    });
    if (tradesOpened >= MAX_TRADES_CAP) {
      logger.debug("[orderFlowMomentum] Daily trade cap reached — no new signals", { tradesOpened, cap: MAX_TRADES_CAP });
      return;
    }

    const regime = await prisma.regimeState.findFirst({
      where: { signalConfigId: config.id, validTo: null },
    });

    const result = computeOrderFlowSignal(features, regime);
    if (result.skip) {
      logger.debug("[orderFlowMomentum] No signal", { reason: result.reason, strength: result.strength });
      return;
    }

    const asset = await prisma.asset.findUnique({ where: { symbol: "SOL" } });
    if (!asset) return;

    const { sizePct, basis, sampleSize } = await computeSizePct(config.id);

    const signal = await prisma.signal.create({
      data: {
        signalConfigId: config.id,
        assetId: asset.id,
        direction: result.direction,
        strength: result.strength,
        featuresSnapshot: features,
        kellySize: sizePct,
        regimeStateId: regime?.id,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min - short horizon thesis
      },
    });

    logger.info("[orderFlowMomentum] Signal created", {
      signalId: signal.id, direction: result.direction, strength: result.strength.toFixed(3),
      sizePct: sizePct.toFixed(4), sizingBasis: basis, sampleSize,
    });

    await evaluateSignal(signal, livePrice);

    const portfolioConfigs = await prisma.portfolioSignalConfig.findMany({
      where: { signalConfigId: config.id, active: true },
    });
    for (const pc of portfolioConfigs) {
      const portfolio = await prisma.portfolio.findUnique({
        where: { id: pc.portfolioId },
        select: { workspaceId: true },
      });
      if (portfolio) {
        await autoSignPendingProposals(pc.portfolioId, portfolio.workspaceId);
      }
    }
  } catch (err) {
    logger.error("[orderFlowMomentum] Signal cycle error", { error: err.message, stack: err.stack });
  }
}

/**
 * Exit check for this strategy's own open positions only - traced via
 * Position -> Fill -> TradeProposal -> signalId, so this never touches
 * positions opened by any other strategy. Applies take-
 * profit, stop-loss, and the 20-minute TTL; no signal-reversal exit here
 * (the older reversal-close logic closes across all portfolios for an
 * asset, which this strategy deliberately avoids relying on).
 */
async function checkOrderFlowMomentumExits() {
  try {
    const config = await prisma.signalConfig.findFirst({
      where: { strategy: { name: STRATEGY_NAME } },
    });
    if (!config) return;

    const signalIds = await getSignalIdsForConfig(config.id);
    if (signalIds.length === 0) return;

    const positions = await prisma.position.findMany({
      where: {
        status: "OPEN",
        fill: { tradeProposal: { signalId: { in: signalIds } } },
      },
    });

    for (const position of positions) {
      const pnlPct = position.entryPrice > 0
        ? (position.unrealizedPnl / (position.entryPrice * position.size)) * 100
        : 0;

      const ageMs = Date.now() - new Date(position.openedAt).getTime();

      if (pnlPct >= TAKE_PROFIT_PCT) {
        logger.info("[orderFlowMomentum] Take profit", { positionId: position.id, pnlPct: pnlPct.toFixed(3) });
        await closePosition(position.id, "TAKE_PROFIT");
      } else if (pnlPct <= -STOP_LOSS_PCT) {
        logger.info("[orderFlowMomentum] Stop loss", { positionId: position.id, pnlPct: pnlPct.toFixed(3) });
        await closePosition(position.id, "STOP_LOSS");
      } else if (ageMs > TTL_MS) {
        logger.info("[orderFlowMomentum] TTL expired", { positionId: position.id, ageMinutes: (ageMs / 60000).toFixed(1) });
        await closePosition(position.id, "TTL_EXPIRED");
      }
    }
  } catch (err) {
    logger.error("[orderFlowMomentum] Exit check error", { error: err.message, stack: err.stack });
  }
}

module.exports = {
  STRATEGY_NAME,
  computeOrderFlowSignal,
  getRealTradeStats,
  computeSizePct,
  runOrderFlowMomentumCycle,
  checkOrderFlowMomentumExits,
};
