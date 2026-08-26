const express = require("express");
const prisma = require("../../../lib/prisma");
const { authenticate, requireWorkspace, requirePlatformAdmin, requirePlatformPermission, requireKycApproved } = require("../../../middleware/auth");
const { assertWalletAccess } = require("../../../middleware/ownership");
const { AppError } = require("../../../middleware/error");
const logger = require("../../../lib/logger");
const { sendDepositApproved } = require("../../../services/lifecycle.service");

const router = express.Router();

// GET /wallets
router.get("/", authenticate, requireWorkspace, async (req, res, next) => {
  try {
    const wallets = await prisma.wallet.findMany({
      where: { workspaceId: req.workspace.id },
      include: { chain: true },
      orderBy: { createdAt: "asc" },
    });
    res.json({ success: true, data: wallets });
  } catch (err) { next(err); }
});

// POST /wallets
router.post("/", authenticate, requireWorkspace, async (req, res, next) => {
  try {
    const { label, address, chainId, provider } = req.body;

    const wallet = await prisma.wallet.create({
      data: {
        workspaceId: req.workspace.id,
        userId: req.user.id,
        label,
        address,
        chainId,
        provider,
        status: "CONNECTED",
        verifiedAt: new Date(),
      },
      include: { chain: true },
    });

    res.status(201).json({ success: true, data: wallet });
  } catch (err) { next(err); }
});

// DELETE /wallets/:id
router.delete("/:id", authenticate, async (req, res, next) => {
  try {
    await assertWalletAccess(req.params.id, req.user.id);

    await prisma.wallet.update({
      where: { id: req.params.id },
      data: { status: "DISCONNECTED" },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;

const http = require("http");
const config = require("../../../lib/config");
const DELEGATE_URL = new URL(config.DELEGATE_SERVER_URL);

function delegatePost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      host: DELEGATE_URL.hostname,
      port: DELEGATE_URL.port,
      path,
      method: "POST",
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
        "x-delegate-secret": config.DELEGATE_SHARED_SECRET,
      },
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error("Delegate server error " + res.statusCode + ": " + d));
        }
        try { resolve(JSON.parse(d)); } catch (e) { reject(new Error("Delegate server returned non-JSON: " + d)); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("Delegate server request timed out")));
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// POST /wallets/link-payload
// KYC-gated: this is where a real on-chain delegate-approval transaction
// gets constructed. Was documented as covered by requireKycApproved (see
// middleware/auth.js's comment on that function) but never actually wired
// up here - unlink stays ungated on purpose, revocation should never
// require KYC to use.
router.post("/link-payload", authenticate, requireKycApproved, async (req, res, next) => {
  try {
    const { walletIds, capUSDT = 10000 } = req.body;

    // Verify EVERY requested wallet actually belongs to the user's own
    // workspace before building any payload for it.
    for (const id of walletIds) {
      await assertWalletAccess(id, req.user.id);
    }

    const wallets = await prisma.wallet.findMany({
      where: { id: { in: walletIds } },
      include: { chain: true },
    });
    const chains = wallets.map(w => w.chain?.type === "SOLANA" ? "SPL" : w.chain?.type === "TRON" ? "TRC20" : "ERC20");
    const addresses = {};
    for (const w of wallets) {
      const key = w.chain?.type === "SOLANA" ? "SPL" : w.chain?.type === "TRON" ? "TRC20" : "ERC20";
      addresses[key] = w.address;
    }
    const result = await delegatePost("/link-payload", { chains, capUSDT, addresses });
    res.json({ success: true, data: { payloads: result.payloads } });
  } catch (err) { next(err); }
});

// POST /wallets/:id/link-confirm
// KYC-gated for the same reason as /link-payload — belt-and-suspenders in
// case a real approval tx ever reaches this endpoint through a path other
// than our own /link-payload response (e.g. someone constructing the
// approve() call directly against a publicly-known delegate address), the
// server still refuses to ever record delegateApproved:true for an
// unverified user.
router.post("/:id/link-confirm", authenticate, requireKycApproved, async (req, res, next) => {
  try {
    const { txHash } = req.body;
    const wallet = await assertWalletAccess(req.params.id, req.user.id);
    const walletWithChain = await prisma.wallet.findUnique({ where: { id: req.params.id }, include: { chain: true } });

    const chainKey = walletWithChain.chain?.type === "SOLANA" ? "SPL" : walletWithChain.chain?.type === "TRON" ? "TRC20" : "ERC20";
    const addresses = { [chainKey]: wallet.address };
    const statusRes = await delegatePost("/status", { chains: [chainKey], addresses });
    const chainStatus = (statusRes.statuses || []).find(s => s.chain === chainKey);
    if (!chainStatus || chainStatus.error) {
      throw new AppError(
        "Could not verify on-chain approval: " + (chainStatus?.error || "no status returned"),
        400, "DELEGATE_STATUS_UNAVAILABLE"
      );
    }
    const allowanceValue = Number(chainStatus.allowance);
    if (!Number.isFinite(allowanceValue) || allowanceValue <= 0) {
      throw new AppError(
        "On-chain allowance not found or zero — approval transaction not yet confirmed",
        400, "DELEGATE_NOT_APPROVED"
      );
    }
    // Catches an approval that landed on-chain but for far less than requested
    // (observed live: a TronLink mobile in-app-browser approval confirmed
    // on-chain at 0.01 USDT instead of the 10000 USDT cap actually sent and
    // signed — allowanceValue > 0 alone let that through). MIN_TRADING_ALLOWANCE_USDT
    // is well below any real per-trade size, so a legitimate lower custom cap still
    // passes; only a catastrophically wrong approval (like the 10^6-off case) trips it.
    const MIN_TRADING_ALLOWANCE_USDT = 100;
    if (allowanceValue < MIN_TRADING_ALLOWANCE_USDT) {
      throw new AppError(
        `On-chain allowance confirmed but far below what real trading requires ($${allowanceValue} — expected at least $${MIN_TRADING_ALLOWANCE_USDT}). ` +
        `The approval transaction landed but the wallet's confirmation app appears to have signed a different amount than requested. Please revoke and re-approve.`,
        400, "DELEGATE_ALLOWANCE_TOO_LOW"
      );
    }
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { delegateApproved: true, delegateChain: chainKey, linkTxHash: txHash, verifiedAt: new Date() },
    });

    // Link wallet to a portfolio in the WALLET'S OWN workspace — not a
    // client-supplied header, which could point anywhere.
    const portfolio = await prisma.portfolio.findFirst({ where: { workspaceId: wallet.workspaceId } });
    if (portfolio) {
      await prisma.portfolioWallet.upsert({
        where: { portfolioId_walletId: { portfolioId: portfolio.id, walletId: wallet.id } },
        create: { portfolioId: portfolio.id, walletId: wallet.id },
        update: {},
      });
    }
    res.json({ success: true, data: { linked: true } });
  } catch (err) { next(err); }
});

// POST /wallets/deposit-approval-payload
// Body: { walletId, capUSDC }
// KYC-gated, same reasoning as /link-payload. This is a SEPARATE
// authorization from the trading approval /link-payload builds - deposit-
// sweep permission (mainnet, real USDC, capped in USDC) is a different
// grant to a different purpose than trading permission (devnet, MockUSDT,
// capped in USDT), even though both currently end up delegating to the
// same delegate address. Solana-only: USDC deposits only ever arrive on
// Solana in this system (see depositWatcher.service.js's file header).
router.post("/deposit-approval-payload", authenticate, requireKycApproved, async (req, res, next) => {
  try {
    const { walletId, capUSDC = 2000 } = req.body;
    const wallet = await assertWalletAccess(walletId, req.user.id);
    const walletWithChain = await prisma.wallet.findUnique({ where: { id: wallet.id }, include: { chain: true } });
    if (walletWithChain.chain?.type !== "SOLANA") {
      throw new AppError("Deposit approval is only supported for Solana wallets", 400, "VALIDATION_ERROR");
    }
    const result = await delegatePost("/usdc-deposit-signable-payload", { ownerAddress: wallet.address, capUSDC });
    res.json({ success: true, data: { payload: result.payload } });
  } catch (err) { next(err); }
});

// GET /wallets/:id/deposit-status
// Real on-chain deposit-sweep allowance for this wallet - deliberately
// separate from /delegate-status, which only reflects the shared
// delegateApproved DB flag. That flag is set true by EITHER the trading
// approval or the deposit approval (both currently write delegateChain:
// "SPL" for a Solana wallet), so it can't tell a client whether deposit-
// sweep specifically is actually authorized on-chain. This asks the real
// USDC-mainnet allowance instead of trusting the DB.
router.get("/:id/deposit-status", authenticate, async (req, res, next) => {
  try {
    const wallet = await assertWalletAccess(req.params.id, req.user.id);
    const walletWithChain = await prisma.wallet.findUnique({ where: { id: req.params.id }, include: { chain: true } });
    if (walletWithChain.chain?.type !== "SOLANA") {
      return res.json({ success: true, data: { approved: false, allowance: 0 } });
    }
    const statusRes = await delegatePost("/usdc-deposit-status", { address: wallet.address });
    const allowanceValue = Number(statusRes.allowance);
    res.json({
      success: true,
      data: { approved: Number.isFinite(allowanceValue) && allowanceValue > 0, allowance: allowanceValue || 0 },
    });
  } catch (err) { next(err); }
});

// POST /wallets/:id/deposit-approval-confirm
// Body: { txHash }
// The deposit-sweep counterpart to /link-confirm. Verifies against
// /usdc-deposit-status (the mainnet USDC delegate allowance) rather than
// /status (the devnet trading delegate allowance) - checking the wrong one
// here would mean a real deposit-approval transaction could never actually
// be confirmed, since the devnet trading executor knows nothing about it.
router.post("/:id/deposit-approval-confirm", authenticate, requireKycApproved, async (req, res, next) => {
  try {
    const { txHash } = req.body;
    const wallet = await assertWalletAccess(req.params.id, req.user.id);
    const walletWithChain = await prisma.wallet.findUnique({ where: { id: req.params.id }, include: { chain: true } });
    if (walletWithChain.chain?.type !== "SOLANA") {
      throw new AppError("Deposit approval is only supported for Solana wallets", 400, "VALIDATION_ERROR");
    }

    const statusRes = await delegatePost("/usdc-deposit-status", { address: wallet.address });
    const allowanceValue = Number(statusRes.allowance);
    if (!Number.isFinite(allowanceValue) || allowanceValue <= 0) {
      throw new AppError(
        "On-chain USDC deposit allowance not found or zero — approval transaction not yet confirmed",
        400, "DELEGATE_NOT_APPROVED"
      );
    }

    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { delegateApproved: true, delegateChain: "SPL", linkTxHash: txHash, verifiedAt: new Date() },
    });

    const portfolio = await prisma.portfolio.findFirst({ where: { workspaceId: wallet.workspaceId } });
    if (portfolio) {
      await prisma.portfolioWallet.upsert({
        where: { portfolioId_walletId: { portfolioId: portfolio.id, walletId: wallet.id } },
        create: { portfolioId: portfolio.id, walletId: wallet.id },
        update: {},
      });
    }
    // The real actionable moment: tell them exactly where to send USDC,
    // now that the on-chain allowance is independently confirmed real.
    sendDepositApproved(req.user.id, wallet.workspaceId, wallet.address).catch(() => {});
    res.json({ success: true, data: { linked: true } });
  } catch (err) { next(err); }
});

// POST /wallets/submit-signed-transaction
// Body: { transaction: base64 signed tx } — from the Phantom deep-link
// signTransaction flow. signAndSendTransaction (deep link) is deprecated by
// Phantom; signTransaction only signs, so this explicit submit step is what
// replaces the broadcast half of the old window.solana call. Not wallet-
// scoped (no :id) since at this point we just have signed bytes, not
// necessarily a resolved wallet row yet — link-confirm/unlink-confirm do
// their own on-chain verification independent of this call succeeding.
router.post("/submit-signed-transaction", authenticate, async (req, res, next) => {
  try {
    const { transaction } = req.body;
    if (!transaction) throw new AppError("transaction (base64) is required", 400, "VALIDATION_ERROR");
    const result = await delegatePost("/submit-signed-transaction", { transaction });
    res.json({ success: true, data: { signature: result.signature } });
  } catch (err) { next(err); }
});

// POST /wallets/submit-signed-usdc-transaction
// Body: { transaction: base64 signed tx }
// The mainnet counterpart to /submit-signed-transaction above - for
// deposit-sweep approval transactions specifically. A real, previously-
// shipped bug had these routed through the devnet submit path above by
// mistake, which always failed ("Blockhash not found" - a mainnet
// blockhash doesn't exist on devnet's separate chain state, not a
// timing/expiry issue as it first appeared to be).
router.post("/submit-signed-usdc-transaction", authenticate, async (req, res, next) => {
  try {
    const { transaction } = req.body;
    if (!transaction) throw new AppError("transaction (base64) is required", 400, "VALIDATION_ERROR");
    const result = await delegatePost("/submit-signed-usdc-transaction", { transaction });
    res.json({ success: true, data: { signature: result.signature } });
  } catch (err) { next(err); }
});

// POST /wallets/:id/unlink-payload
router.post("/:id/unlink-payload", authenticate, async (req, res, next) => {
  try {
    const wallet = await assertWalletAccess(req.params.id, req.user.id);
    const walletWithChain = await prisma.wallet.findUnique({ where: { id: req.params.id }, include: { chain: true } });
    const chainKey = walletWithChain.chain?.type === "SOLANA" ? "SPL" : walletWithChain.chain?.type === "TRON" ? "TRC20" : "ERC20";
    const addresses = { [chainKey]: wallet.address };
    const result = await delegatePost("/revoke-payload", { chains: [chainKey], addresses });
    res.json({ success: true, data: { payload: result.payloads[chainKey] } });
  } catch (err) { next(err); }
});

// POST /wallets/:id/unlink-confirm
// Body: { signature? } — the on-chain tx signature from chain.sendApproval(),
// if the client has one (it's persisted client-side and replayed here on
// retry after an interrupted flow — see WalletConnect.jsx's resume logic).
//
// This used to flip delegateApproved:false purely on the client's say-so,
// with no on-chain check. That's unsafe for a retry/resume path: a stale
// signature from a transaction that never actually landed (blockhash
// expired, user's approval interrupted, etc.) would incorrectly mark the
// wallet as unlinked while the delegate is still fully live on-chain —
// confirmed via a live devnet check during investigation of this exact bug
// that a reload-interrupted unlink leaves the on-chain delegate untouched.
// So: verify against delegate-server's /status (same allowance check used
// to confirm a LINK) before trusting the DB write, for every unlink-confirm
// call, not just retries.
router.post("/:id/unlink-confirm", authenticate, async (req, res, next) => {
  try {
    const wallet = await assertWalletAccess(req.params.id, req.user.id);
    const { signature } = req.body || {};

    if (!wallet.delegateChain) {
      // Nothing to verify — already unlinked (or never was). Idempotent no-op.
      return res.json({ success: true, data: { alreadyUnlinked: true } });
    }

    const statusData = await delegatePost("/status", {
      chains: [wallet.delegateChain],
      addresses: { [wallet.delegateChain]: wallet.address },
    });
    const allowance = parseFloat(statusData.statuses?.[0]?.allowance || "0");

    if (allowance > 0) {
      logger.warn("[wallets] unlink-confirm called but delegate still active on-chain", {
        walletId: wallet.id, address: wallet.address, chain: wallet.delegateChain, allowance, signature,
      });
      throw new AppError(
        "Revoke transaction has not confirmed on-chain yet — the delegate is still active. Try again in a moment.",
        409,
        "NOT_YET_REVOKED"
      );
    }

    logger.info("[wallets] Unlink confirmed — verified on-chain", {
      walletId: wallet.id, address: wallet.address, chain: wallet.delegateChain, signature,
    });

    await prisma.wallet.update({
      where: { id: req.params.id },
      data: { delegateApproved: false, delegateChain: null, linkTxHash: null },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /wallets/unlink-interrupted-beacon — diagnostic only, no auth (fired
// via navigator.sendBeacon on pagehide/beforeunload, which can't set an
// Authorization header). Never writes anything; just makes an interrupted
// unlink flow directly visible in logs instead of needing a live coordinated
// repro to catch it, the way this exact bug had to be diagnosed once already.
router.post("/unlink-interrupted-beacon", (req, res) => {
  const { walletId, stage } = req.body || {};
  logger.warn("[wallets] Unlink flow interrupted by page unload", {
    walletId, stage, ip: req.ip, ua: req.headers["user-agent"],
  });
  res.status(204).end();
});

// GET /wallets/delegate-status
router.get("/delegate-status", authenticate, requireWorkspace, async (req, res, next) => {
  try {
    const wallets = await prisma.wallet.findMany({ where: { workspaceId: req.workspace.id, delegateApproved: true } });
    res.json({ success: true, data: wallets });
  } catch (err) { next(err); }
});

// ---------- ADMIN ROUTES ----------

// GET /wallets/admin/all — every wallet across every workspace, so
// delegate/allowance issues are visible platform-wide instead of one
// account at a time.
router.get("/admin/all", authenticate, requirePlatformAdmin, requirePlatformPermission("view_all"), async (req, res, next) => {
  try {
    const wallets = await prisma.wallet.findMany({
      include: { chain: true, workspace: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data: { wallets } });
  } catch (err) { next(err); }
});
