const express = require("express");
const { authenticate, requirePlatformAdmin } = require("../../../middleware/auth");
const { AppError } = require("../../../middleware/error");
const { subscribe, unsubscribe, getSubscribers, sendCampaign } = require("../../../services/marketing.service");
const prisma = require("../../../lib/prisma");

const router = express.Router();

// Single declared source of truth for what's actually live, per chain -
// the public landing page had drifted from this (showed Tron as "planned"
// when it's the only live trading venue, Solana as the trading chain when
// it's deposit/withdrawal-only) because the same facts were hand-copied
// into page JSX with no link back to reality. Pulling this from the API
// instead means the page can't silently go stale again the way it just did.
const CHAIN_STATUS = {
  SPL:   { label: "Solana",   role: "Deposits & withdrawals", live: true  },
  TRC20: { label: "Tron",     role: "Trade execution",        live: true  },
  ERC20: { label: "Ethereum", role: "Trade execution",        live: false },
};

// GET /marketing/stats — public, no auth. Real, currently-true numbers only -
// no vanity metrics that aren't backed by an actual query.
router.get("/stats", async (req, res, next) => {
  try {
    const [totalSignals, regime] = await Promise.all([
      prisma.signal.count(),
      prisma.regimeState.findFirst({
        where: { validTo: null },
        orderBy: { validFrom: "desc" },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalSignals,
        currentRegime: regime ? { state: regime.state, confidence: regime.confidence } : null,
        chains: CHAIN_STATUS,
      },
    });
  } catch (err) { next(err); }
});

// POST /marketing/subscribe — public endpoint
router.post("/subscribe", async (req, res, next) => {
  try {
    const { email, name, source = "website" } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError("Valid email required", 400, "VALIDATION_ERROR");
    }
    const result = await subscribe(email, name, source);
    res.json({ success: true, data: { status: result.status } });
  } catch (err) { next(err); }
});

// GET /marketing/unsubscribe — handles unsubscribe link click
router.get("/unsubscribe", async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) throw new AppError("Token required", 400, "BAD_REQUEST");
    const result = await unsubscribe(token);
    // Return a simple HTML page
    res.send(`
      <!DOCTYPE html><html>
      <head><meta charset="utf-8"><title>Unsubscribed — Anchor Ledger</title></head>
      <body style="background:#0A0A0F;color:#E8F4F8;font-family:monospace;
                   display:flex;align-items:center;justify-content:center;
                   min-height:100vh;margin:0;">
        <div style="text-align:center;">
          <div style="font-size:24px;margin-bottom:12px;">✓</div>
          <div style="font-size:16px;margin-bottom:8px;">Unsubscribed</div>
          <div style="font-size:12px;color:#5A6478;">${result.email || "Your email"} has been removed.</div>
        </div>
      </body></html>
    `);
  } catch (err) { next(err); }
});

// POST /marketing/unsubscribe — API version
router.post("/unsubscribe", async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) throw new AppError("Token required", 400, "BAD_REQUEST");
    const result = await unsubscribe(token);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /marketing/subscribers — platform admin only
router.get("/subscribers", authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    const { status = "SUBSCRIBED", limit = 100, offset = 0 } = req.query;
    const result = await getSubscribers(status, parseInt(limit), parseInt(offset));
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /marketing/campaign — platform admin only, send to all subscribers
router.post("/campaign", authenticate, requirePlatformAdmin, async (req, res, next) => {
  try {
    const { subject, html } = req.body;
    if (!subject || !html) throw new AppError("subject and html required", 400, "BAD_REQUEST");
    const result = await sendCampaign(subject, html);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
