/**
 * Deposit Watcher Service
 *
 * Detects SPL USDC deposits arriving in users' connected, delegate-approved
 * Solana wallets. USDC is the deposit asset only — it is swept to
 * SOLANA_DEPOSIT_VAULT, then converted 1:1 into USDT and allocated
 * proportionally across the user's delegated trading wallets (1, 2, or 3
 * chains depending on what they've connected). All trading continues
 * exclusively in USDT — USDC never touches the trading path.
 *
 * Flow per detected deposit:
 *   DETECTED → VAULTED → MINTED → ALLOCATED → COMPLETE
 *
 * Called by the worker on an interval (DEPOSIT_INTERVAL_MS).
 */

const { Client } = require("pg");
const prisma  = require("../lib/prisma");
const logger  = require("../lib/logger");
const config  = require("../lib/config");
const { sendDepositComplete, sendDepositFailed } = require("./lifecycle.service");

const SOLANA_DEPOSIT_VAULT = process.env.SOLANA_DEPOSIT_VAULT;

// Minimum USDC balance worth acting on — avoids dust-triggered cycles
const MIN_DEPOSIT_USDC = parseFloat(process.env.MIN_DEPOSIT_USDC || "1");

async function pgNotify(channel, payload) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query("SELECT pg_notify($1, $2)", [channel, JSON.stringify(payload)]);
  } catch (err) {
    logger.warn("[depositWatcher] pg_notify failed", { channel, error: err.message });
  } finally {
    await client.end().catch(() => {});
  }
}

async function delegatePost(endpoint, body) {
  // Node's fetch has no default timeout — a hung RPC call on the delegate
  // side would otherwise stall this whole deposit cycle indefinitely.
  let res;
  try {
    res = await fetch(`${config.DELEGATE_SERVER_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-delegate-secret": config.DELEGATE_SHARED_SECRET,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      throw new Error(`Delegate server timed out at ${endpoint}`);
    }
    throw err;
  }
  const data = await res.json();
  if (!data.success) throw new Error(data.error || `Delegate error at ${endpoint}`);
  return data;
}

// SPL is deliberately excluded. wallet.delegateChain = "SPL" no longer
// means "approved for trading" - it exclusively means "approved for USDC
// deposit-sweep" now that Solana trading approval has been removed from
// onboarding (see wallets.routes.js's /deposit-approval-confirm comment,
// which sets the identical delegateChain:"SPL" + delegateApproved:true
// fields trading approval used to set). Without this allowlist, every
// real depositing user's Phantom deposit-sweep wallet gets miscounted as
// an "active SPL trading chain" here, and allocateDeposit silently routes
// a share of their real deposited value to the broken/removed SPL trading
// executor - swept to the vault for real, then never actually minted into
// anything the user can trade or reclaim. TRC20 is the only real trading
// chain today; add ERC20 back here only if/when it's genuinely re-enabled
// for trading (it's currently paused in onboarding too).
const TRADING_CHAINS = ["TRC20"];

/**
 * Find a user's active trading chains — distinct delegateChain values,
 * restricted to TRADING_CHAINS, across their delegate-approved wallets
 * that are joined to at least one portfolio.
 */
async function getActiveChainsForUser(userId, workspaceId) {
  const wallets = await prisma.wallet.findMany({
    where: {
      userId,
      workspaceId,
      delegateApproved: true,
      delegateChain: { in: TRADING_CHAINS },
      status: "CONNECTED",
      portfolioWallets: { some: {} }
    },
    select: { id: true, address: true, delegateChain: true }
  });

  const byChain = {};
  for (const w of wallets) {
    if (w.delegateChain && !byChain[w.delegateChain]) {
      byChain[w.delegateChain] = w.address;
    }
  }
  return byChain; // e.g. { TRC20: "T..." }
}

// Statuses that mean "there is already a deposit for this wallet that must
// resolve before another one is created". DETECTED/VAULTED/MINTED = actively
// mid-flow; ALLOC_FAILED/PARTIAL = the USDC is already in the vault and the
// user is owed an allocation — a second balance-poll must never stack a
// duplicate on top of that. (SWEEP_FAILED is deliberately not here: the
// money never moved, so a fresh attempt next cycle is correct — but see the
// short back-off below so it isn't retried every single tick.)
const BLOCKING_STATUSES = ["DETECTED", "VAULTED", "MINTED", "ALLOC_FAILED", "PARTIAL"];
const ORPHAN_AGE_MS = 10 * 60 * 1000;
const SWEEP_RETRY_BACKOFF_MS = 5 * 60 * 1000;

/**
 * Guard against creating a duplicate/phantom deposit. The only thing that
 * previously stopped double-processing was "on-chain balance is ~0 after a
 * successful sweep" — which does nothing for a deposit orphaned mid-flow, a
 * stale balance read, or a sweep whose HTTP response was lost.
 *
 * Returns a string reason to skip, or null to proceed.
 */
async function blockingDepositReason(walletId) {
  const latest = await prisma.deposit.findFirst({
    where: { walletId },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) return null;

  const ageMs = Date.now() - new Date(latest.createdAt).getTime();

  if (BLOCKING_STATUSES.includes(latest.status)) {
    if (ageMs > ORPHAN_AGE_MS) {
      // Orphaned — the process handling it almost certainly crashed. Loud,
      // but still skip: resolving it (retry the allocation vs refund) is a
      // money decision for an admin, and vaultReconciliation.job.js already
      // alerts on the resulting ledger/vault discrepancy.
      logger.error("[depositWatcher] Deposit orphaned mid-flow — needs manual resolution", {
        depositId: latest.id, walletId, status: latest.status,
        ageMinutes: Math.round(ageMs / 60000),
      });
    }
    return `existing ${latest.status} deposit ${latest.id}`;
  }

  // A recent failed attempt (sweep never landed, or a legacy FAILED row):
  // safe to retry, but not every 60s. Without this back-off the pre-
  // re-entrancy loop once created 10 FAILED rows for one wallet in 10
  // minutes.
  if (["SWEEP_FAILED", "FAILED"].includes(latest.status) && ageMs < SWEEP_RETRY_BACKOFF_MS) {
    return `recent ${latest.status} deposit ${latest.id} — backing off`;
  }

  return null;
}

/**
 * Process a single detected deposit through the full sweep + allocate flow.
 */
async function processDeposit(wallet) {
  const usdcBalanceStr = (await delegatePost("/usdc-balance", { address: wallet.address })).balance;
  const usdcBalance = parseFloat(usdcBalanceStr);

  if (!usdcBalance || usdcBalance < MIN_DEPOSIT_USDC) {
    return null; // nothing to do
  }

  const skipReason = await blockingDepositReason(wallet.id);
  if (skipReason) {
    logger.warn("[depositWatcher] Skipping deposit cycle for wallet", {
      walletId: wallet.id, reason: skipReason,
    });
    return null;
  }

  logger.info("[depositWatcher] USDC deposit detected", {
    walletId: wallet.id, address: wallet.address, usdcBalance
  });

  // Create the deposit record up front (DETECTED)
  const deposit = await prisma.deposit.create({
    data: {
      workspaceId: wallet.workspaceId,
      userId: wallet.userId,
      walletId: wallet.id,
      chain: "SPL",
      depositAmount: usdcBalance,
      vaultAddress: SOLANA_DEPOSIT_VAULT,
      status: "DETECTED"
    }
  });

  let vaulted = false;
  try {
    // 1. Sweep USDC → vault
    const sweep = await delegatePost("/sweep-usdc-deposit", {
      fromAddress: wallet.address,
      amountUSDC: usdcBalance
    });
    vaulted = true;

    await prisma.deposit.update({
      where: { id: deposit.id },
      data: { status: "VAULTED", sweepTxHash: sweep.txHash }
    });

    // 2. Determine the user's active trading chains and proportional split
    const activeChains = await getActiveChainsForUser(wallet.userId, wallet.workspaceId);
    const chainKeys = Object.keys(activeChains);

    if (chainKeys.length === 0) {
      throw new Error("No active delegate-approved trading wallets found for user — cannot allocate");
    }

    const perChainAmount = Math.floor((usdcBalance / chainKeys.length) * 1e6) / 1e6;
    const amounts = {};
    for (const chain of chainKeys) amounts[chain] = perChainAmount;

    await prisma.deposit.update({
      where: { id: deposit.id },
      data: { status: "MINTED" }
    });

    // 3. Mint USDT 1:1 and allocate proportionally across active chains
    const allocation = await delegatePost("/allocate-deposit", {
      chains: chainKeys,
      toAddress: activeChains,
      amounts
    });

    // The USDC is in the vault at this point (VAULTED above). Allocation is
    // the mint-and-send of MockUSDT to the user's trading wallets:
    //   all succeeded        -> COMPLETE
    //   some succeeded        -> PARTIAL  (user under-allocated; needs a top-up)
    //   none succeeded        -> ALLOC_FAILED (money vaulted, nothing allocated)
    // PARTIAL used to be silently marked COMPLETE.
    const { succeeded, failed } = allocation.summary;
    const failedChains = (allocation.summary.chains?.failed || [])
      .map(f => `${f.chain}: ${f.error}`).join("; ");

    let status, errorMessage = null;
    if (succeeded === 0) {
      status = "ALLOC_FAILED";
      errorMessage = `All chain allocations failed${failedChains ? ` (${failedChains})` : ""}`;
    } else if (failed > 0) {
      status = "PARTIAL";
      errorMessage = `Allocated ${succeeded}/${succeeded + failed} chains; failed: ${failedChains}`;
    } else {
      status = "COMPLETE";
    }

    await prisma.deposit.update({
      where: { id: deposit.id },
      data: {
        status,
        allocations: allocation.results,
        completedAt: status === "COMPLETE" ? new Date() : null,
        errorMessage,
      }
    });

    await pgNotify("deposit_completed", {
      depositId: deposit.id,
      userId: wallet.userId,
      walletId: wallet.id,
      usdcAmount: usdcBalance,
      status,
      allocations: allocation.results
    });

    logger.info("[depositWatcher] Deposit allocation finished", {
      depositId: deposit.id, status, succeeded: allocation.summary.succeeded, failed: allocation.summary.failed
    });

    // COMPLETE and PARTIAL both mean the user received funds — a "failed"
    // email would be wrong. ALLOC_FAILED means the USDC is vaulted but
    // nothing reached them.
    if (status === "ALLOC_FAILED") {
      sendDepositFailed(wallet.userId, wallet.workspaceId, { usdcAmount: usdcBalance, vaulted: true }).catch(() => {});
    } else {
      sendDepositComplete(wallet.userId, wallet.workspaceId, { usdcAmount: usdcBalance }).catch(() => {});
    }

    return deposit;

  } catch (err) {
    // vaulted === false  -> the sweep itself failed/was never confirmed; the
    //   USDC never left the user's wallet, so a fresh attempt next cycle is
    //   safe (SWEEP_RETRY_BACKOFF_MS throttles it).
    // vaulted === true   -> USDC is in the vault but allocation threw; this
    //   is a money-owed state, not a plain failure — vaultReconciliation
    //   will flag the discrepancy for an admin.
    const failStatus = vaulted ? "ALLOC_FAILED" : "SWEEP_FAILED";
    logger.error("[depositWatcher] Deposit processing failed", {
      depositId: deposit.id, status: failStatus, vaulted, error: err.message,
    });
    await prisma.deposit.update({
      where: { id: deposit.id },
      data: { status: failStatus, errorMessage: err.message }
    });
    sendDepositFailed(wallet.userId, wallet.workspaceId, { usdcAmount: usdcBalance, vaulted }).catch(() => {});
    return deposit;
  }
}

/**
 * Main loop — checks all delegate-approved SPL wallets for USDC deposits.
 * Called on an interval by the worker.
 */
async function watchForDeposits() {
  if (!SOLANA_DEPOSIT_VAULT) {
    logger.warn("[depositWatcher] SOLANA_DEPOSIT_VAULT not configured — skipping cycle");
    return;
  }

  const splWallets = await prisma.wallet.findMany({
    where: {
      delegateChain: "SPL",
      delegateApproved: true,
      status: "CONNECTED"
    }
  });

  for (const wallet of splWallets) {
    try {
      await processDeposit(wallet);
    } catch (err) {
      logger.error("[depositWatcher] Unhandled error for wallet", {
        walletId: wallet.id, error: err.message
      });
    }
  }
}

module.exports = { watchForDeposits, getActiveChainsForUser };
