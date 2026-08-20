/**
 * Lifecycle Email Service
 *
 * Sends triggered emails based on user actions and system events.
 * Separate from marketing (subscribers) and notifications (alerts).
 *
 * Triggers:
 *   welcome          — workspace created
 *   first_trade      — first confirmed fill
 *   drawdown_alert   — max drawdown breached
 *   weekly_summary   — every Monday 00:00 UTC
 *   inactivity       — no login in 14 days
 */

const prisma = require("../lib/prisma");
const logger = require("../lib/logger");
const config = require("../lib/config");

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS   = config.FROM_EMAIL;
const APP_URL        = config.APP_URL;

// ── Triggers ──────────────────────────────────────────────────────────────────

async function sendVerificationEmail(userId, token) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const verifyUrl = `${APP_URL}/verify-email?token=${token}`;
    await send(user.email, "Verify your Anchor Ledger email", buildVerification(user, verifyUrl));
    logger.info("[lifecycle] Verification email sent", { userId, email: user.email });
  } catch (err) {
    logger.warn("[lifecycle] Verification email failed", { userId, error: err.message });
  }
}

async function sendNewDeviceAlert(userId, userAgent) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    await send(user.email, "New sign-in to your Anchor Ledger account", buildNewDeviceAlert(user, userAgent));
    logger.info("[lifecycle] New device alert sent", { userId });
  } catch (err) {
    logger.warn("[lifecycle] New device alert failed", { userId, error: err.message });
  }
}

async function sendWelcome(userId, workspaceId) {
  try {
    const user      = await prisma.user.findUnique({ where: { id: userId } });
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!user || !workspace) return;

    await send(user.email, `Welcome to Anchor Ledger, ${user.name}`, buildWelcome(user, workspace));
    logger.info("[lifecycle] Welcome email sent", { userId, email: user.email });
  } catch (err) {
    logger.warn("[lifecycle] Welcome email failed", { userId, error: err.message });
  }
}

async function sendFirstTrade(userId, workspaceId, tradeData) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    await send(user.email, "Your first trade on Anchor Ledger", buildFirstTrade(user, tradeData));
    logger.info("[lifecycle] First trade email sent", { userId });
  } catch (err) {
    logger.warn("[lifecycle] First trade email failed", { userId, error: err.message });
  }
}

async function sendOnboardingComplete(userId, workspaceId) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    await send(user.email, "You're onboarded — one step left before you can trade", buildOnboardingComplete(user));
    logger.info("[lifecycle] Onboarding complete email sent", { userId });
  } catch (err) {
    logger.warn("[lifecycle] Onboarding complete email failed", { userId, error: err.message });
  }
}

async function sendDepositApproved(userId, workspaceId, walletAddress) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    await send(user.email, "Deposit permission granted — send USDC to fund your account", buildDepositApproved(user, walletAddress));
    logger.info("[lifecycle] Deposit approved email sent", { userId });
  } catch (err) {
    logger.warn("[lifecycle] Deposit approved email failed", { userId, error: err.message });
  }
}

async function sendDepositComplete(userId, workspaceId, depositData) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    await send(user.email, `Deposit confirmed — $${depositData.usdcAmount?.toFixed(2)} is now live`, buildDepositComplete(user, depositData));
    logger.info("[lifecycle] Deposit complete email sent", { userId, usdcAmount: depositData.usdcAmount });
  } catch (err) {
    logger.warn("[lifecycle] Deposit complete email failed", { userId, error: err.message });
  }
}

async function sendDepositFailed(userId, workspaceId, depositData) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    await send(user.email, "We hit an issue completing your deposit", buildDepositFailed(user, depositData));
    logger.info("[lifecycle] Deposit failed email sent", { userId });
  } catch (err) {
    logger.warn("[lifecycle] Deposit failed email failed", { userId, error: err.message });
  }
}

async function sendDrawdownAlert(userId, workspaceId, portfolioName, drawdownPct, threshold) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    await send(
      user.email,
      `⚠️ Drawdown alert: ${portfolioName} is down ${drawdownPct.toFixed(1)}%`,
      buildDrawdownAlert(user, portfolioName, drawdownPct, threshold)
    );
    logger.info("[lifecycle] Drawdown alert sent", { userId, drawdownPct });
  } catch (err) {
    logger.warn("[lifecycle] Drawdown alert failed", { userId, error: err.message });
  }
}

async function sendWeeklySummary(userId, workspaceId, report) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    await send(user.email, `Anchor Ledger weekly summary — ${formatDate(new Date())}`, buildWeeklySummary(user, report));
    logger.info("[lifecycle] Weekly summary sent", { userId });
  } catch (err) {
    logger.warn("[lifecycle] Weekly summary failed", { userId, error: err.message });
  }
}

// ── Scheduled jobs (called from worker) ──────────────────────────────────────

async function runWeeklySummaries() {
  const { generateReport } = require("./reporting.service");

  const workspaces = await prisma.workspace.findMany({
    where:   { status: "ACTIVE" },
    include: { portfolios: true, owner: true },
  });

  for (const workspace of workspaces) {
    for (const portfolio of workspace.portfolios) {
      try {
        const report = await generateReport(portfolio.id, "weekly");
        await sendWeeklySummary(workspace.ownerId, workspace.id, report);
      } catch (err) {
        logger.warn("[lifecycle] Weekly summary job failed", { workspaceId: workspace.id, error: err.message });
      }
    }
  }
}

// ── Templates ─────────────────────────────────────────────────────────────────

function buildVerification(user, verifyUrl) {
  return layout(`
    <p style="font-size:18px;font-weight:600;margin-bottom:16px;color:#E8F4F8;">
      Verify your email, ${user.name}
    </p>
    <p style="margin-bottom:20px;color:#9BA8B4;">
      One more step before you can start trading — confirm this is really your email address.
      This link expires in 24 hours.
    </p>
    <a href="${verifyUrl}" style="display:inline-block;background:#00D4AA;color:#0A0A0F;
       padding:12px 24px;border-radius:4px;font-weight:700;text-decoration:none;font-size:13px;">
      Verify Email →
    </a>
    <p style="margin-top:24px;font-size:11px;color:#5A6478;">
      If you didn't create an Anchor Ledger account, you can safely ignore this email.
    </p>
  `);
}

function buildNewDeviceAlert(user, userAgent) {
  return layout(`
    <p style="font-size:18px;font-weight:600;margin-bottom:16px;color:#E8F4F8;">
      New sign-in detected
    </p>
    <p style="margin-bottom:16px;color:#9BA8B4;">
      Your Anchor Ledger account was just accessed from a device we haven't seen before.
    </p>
    <div style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:6px;padding:16px;margin-bottom:20px;">
      ${tradeRow("Time", new Date().toUTCString())}
      ${tradeRow("Device", userAgent || "Unknown")}
    </div>
    <p style="margin-bottom:20px;color:#9BA8B4;">
      If this was you, no action is needed. If you don't recognize this, change your
      password immediately and enable two-factor authentication in Settings.
    </p>
    <a href="${APP_URL}/settings" style="display:inline-block;background:#00D4AA;color:#0A0A0F;
       padding:12px 24px;border-radius:4px;font-weight:700;text-decoration:none;font-size:13px;">
      Review Account Security →
    </a>
  `);
}

function buildWelcome(user, workspace) {
  return layout(`
    <p style="font-size:18px;font-weight:600;margin-bottom:16px;color:#E8F4F8;">
      Welcome, ${user.name}
    </p>
    <p style="margin-bottom:16px;color:#9BA8B4;">
      Your workspace <strong style="color:#E8F4F8;">${workspace.name}</strong> is created.
      Here's the full path from here to your first automated trade:
    </p>
    <ol style="margin-bottom:20px;padding-left:20px;color:#9BA8B4;">
      <li style="margin-bottom:8px;">Verify this email address</li>
      <li style="margin-bottom:8px;">Complete onboarding — risk profile, capital allocation, and your account agreement</li>
      <li style="margin-bottom:8px;">Verify your identity — we'll email you the moment it's approved</li>
      <li style="margin-bottom:8px;">Connect TronLink (trading authority) and Phantom (USDC deposits/withdrawals) — two separate approvals</li>
      <li style="margin-bottom:8px;">Send USDC — we'll confirm by email once it's live in your trading balance</li>
      <li style="margin-bottom:8px;">Trading runs automatically from there — you'll be notified on every fill</li>
    </ol>
    <a href="${APP_URL}/dashboard" style="display:inline-block;background:#00D4AA;color:#0A0A0F;
       padding:12px 24px;border-radius:4px;font-weight:700;text-decoration:none;font-size:13px;">
      Continue →
    </a>
  `);
}

function buildOnboardingComplete(user) {
  return layout(`
    <p style="font-size:18px;font-weight:600;margin-bottom:16px;color:#E8F4F8;">
      Onboarding complete, ${user.name}
    </p>
    <p style="margin-bottom:16px;color:#9BA8B4;">
      One step stands between you and connecting a real wallet: identity verification.
      It's required before any wallet approval or deposit — required by regulation, not optional.
    </p>
    <div style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:6px;padding:16px;margin-bottom:20px;">
      <div style="font-size:11px;color:#5A6478;margin-bottom:6px;">You'll need</div>
      <div style="color:#9BA8B4;font-size:13px;line-height:1.7;">
        A government-issued photo ID and a selfie. Review is manual — we'll email you
        the moment a decision is made, whether that's approval or a request to resubmit.
      </div>
    </div>
    <a href="${APP_URL}/kyc" style="display:inline-block;background:#00D4AA;color:#0A0A0F;
       padding:12px 24px;border-radius:4px;font-weight:700;text-decoration:none;font-size:13px;">
      Verify Identity →
    </a>
  `);
}

function buildDepositApproved(user, walletAddress) {
  return layout(`
    <p style="font-size:18px;font-weight:600;margin-bottom:16px;color:#E8F4F8;">
      Deposit permission granted
    </p>
    <p style="margin-bottom:16px;color:#9BA8B4;">
      Anchor Ledger can now sweep USDC from your connected Solana wallet into your
      trading balance. There's no separate deposit address — send USDC directly to
      your own wallet, the same one you just approved:
    </p>
    <div style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:6px;padding:16px;margin-bottom:20px;word-break:break-all;">
      <div style="font-size:11px;color:#5A6478;margin-bottom:6px;">Your wallet address</div>
      <div style="color:#00D4AA;font-size:13px;font-family:'Courier New',monospace;">${walletAddress}</div>
    </div>
    <p style="margin-bottom:16px;color:#9BA8B4;">
      Once USDC lands there, we typically detect and sweep it within a couple of
      minutes — no action needed on your part. You'll get an email the moment it's
      confirmed and live in your trading balance.
    </p>
    <p style="margin-bottom:20px;font-size:11px;color:#5A6478;">
      Send USDC (Solana) only. Sending any other asset or network to this address
      may result in permanent loss.
    </p>
    <a href="${APP_URL}/wallets" style="display:inline-block;background:#00D4AA;color:#0A0A0F;
       padding:12px 24px;border-radius:4px;font-weight:700;text-decoration:none;font-size:13px;">
      View Wallets →
    </a>
  `);
}

function buildDepositComplete(user, depositData) {
  return layout(`
    <p style="font-size:18px;font-weight:600;margin-bottom:16px;color:#00D4AA;">
      ✅ $${depositData.usdcAmount?.toFixed(2)} is now live
    </p>
    <p style="margin-bottom:16px;color:#9BA8B4;">
      Your deposit has been swept and allocated to your connected trading wallet.
      Trading is now active — the system checks for a signal every 60 seconds and
      executes automatically once one clears your risk settings.
    </p>
    <div style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:6px;padding:16px;margin-bottom:20px;">
      ${tradeRow("Amount deposited", `$${depositData.usdcAmount?.toFixed(2)}`)}
      ${tradeRow("Status", "Live in trading balance")}
    </div>
    <p style="margin-bottom:20px;color:#9BA8B4;">
      You'll get an email the moment your first trade fills. No further action needed.
    </p>
    <a href="${APP_URL}/positions" style="display:inline-block;background:#00D4AA;color:#0A0A0F;
       padding:12px 24px;border-radius:4px;font-weight:700;text-decoration:none;font-size:13px;">
      View Portfolio →
    </a>
  `);
}

function buildDepositFailed(user, depositData) {
  const amountPhrase = depositData.usdcAmount ? `$${depositData.usdcAmount.toFixed(2)} in ` : "";
  // Wording depends on how far the deposit actually got before failing -
  // never claim funds reached the vault unless the sweep step genuinely
  // confirmed on-chain. Overstating this would be a real, damaging false
  // reassurance about the location of someone's real money.
  const explanation = depositData.vaulted
    ? `We detected ${amountPhrase}USDC from your wallet and moved it into our custody
       vault, but ran into an error finishing the transfer into your trading balance.
       Your funds are safe — they moved from your wallet into our vault, not lost or
       sent elsewhere.`
    : `We detected ${amountPhrase}USDC from your wallet but ran into an error before
       it could be moved into our custody vault. Your funds have not left your wallet
       — nothing has moved. It's still sitting where you sent it.`;

  return layout(`
    <p style="font-size:16px;font-weight:600;margin-bottom:16px;color:#FF8C00;">
      We hit an issue completing your deposit
    </p>
    <p style="margin-bottom:16px;color:#9BA8B4;">
      ${explanation}
    </p>
    <div style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:6px;padding:16px;margin-bottom:20px;">
      <div style="font-size:11px;color:#5A6478;margin-bottom:6px;">What happens now</div>
      <div style="color:#9BA8B4;font-size:13px;line-height:1.7;">
        Our team has been alerted and this will be retried without any action needed
        from you. If it isn't resolved within 24 hours, reply to this email and we'll
        look into it directly.
      </div>
    </div>
    <a href="${APP_URL}/wallets" style="display:inline-block;background:#FF8C00;color:#0A0A0F;
       padding:12px 24px;border-radius:4px;font-weight:700;text-decoration:none;font-size:13px;">
      View Wallets →
    </a>
  `);
}

function buildFirstTrade(user, trade) {
  const pnlSign = (trade.realizedPnl || 0) >= 0 ? "+" : "";
  return layout(`
    <p style="font-size:16px;font-weight:600;margin-bottom:16px;color:#E8F4F8;">
      ✅ Your first trade is confirmed
    </p>
    <div style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:6px;padding:16px;margin-bottom:20px;">
      ${tradeRow("Asset",      `${trade.asset} ${trade.direction}`)}
      ${tradeRow("Venue",      trade.venue)}
      ${tradeRow("Fill Price", `$${trade.fillPrice?.toFixed(2)}`)}
      ${tradeRow("Size",       trade.size?.toFixed(4))}
      ${tradeRow("Fee Paid",   `$${trade.feePaid?.toFixed(2)}`)}
    </div>
    <a href="${APP_URL}/positions" style="display:inline-block;background:#00D4AA;color:#0A0A0F;
       padding:12px 24px;border-radius:4px;font-weight:700;text-decoration:none;font-size:13px;">
      View Position →
    </a>
  `);
}

function buildDrawdownAlert(user, portfolioName, drawdownPct, threshold) {
  return layout(`
    <p style="font-size:16px;font-weight:600;margin-bottom:16px;color:#FF4D6D;">
      ⚠️ Drawdown alert
    </p>
    <p style="margin-bottom:16px;color:#9BA8B4;">
      <strong style="color:#E8F4F8;">${portfolioName}</strong> has reached a drawdown of
      <strong style="color:#FF4D6D;">${drawdownPct.toFixed(2)}%</strong>,
      which exceeds your configured threshold of ${threshold}%.
    </p>
    <p style="margin-bottom:20px;color:#9BA8B4;">
      The strategy has been automatically paused. All open positions are being monitored.
      Review your portfolio and adjust risk parameters if needed.
    </p>
    <a href="${APP_URL}/portfolio" style="display:inline-block;background:#FF4D6D;color:white;
       padding:12px 24px;border-radius:4px;font-weight:700;text-decoration:none;font-size:13px;">
      Review Portfolio →
    </a>
  `);
}

function buildWeeklySummary(user, report) {
  const s = report.summary;
  const n = report.nav;
  const pnlColor = s.totalPnl >= 0 ? "#00D4AA" : "#FF4D6D";

  return layout(`
    <p style="font-size:16px;font-weight:600;margin-bottom:16px;color:#E8F4F8;">
      Weekly Summary — ${report.portfolioName}
    </p>
    <div style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:6px;padding:16px;margin-bottom:16px;">
      <div style="font-size:24px;font-weight:700;color:${pnlColor};margin-bottom:4px;">
        ${s.totalPnl >= 0 ? "+" : ""}$${(s.totalPnl || 0).toFixed(2)}
      </div>
      <div style="font-size:11px;color:#5A6478;">Realized P&L this week</div>
    </div>
    <div style="background:#0A0A0F;border:1px solid #1E1E2E;border-radius:6px;padding:16px;margin-bottom:20px;">
      ${tradeRow("Trades",       s.totalTrades)}
      ${tradeRow("Win Rate",     `${(s.winRate || 0).toFixed(1)}%`)}
      ${tradeRow("Profit Factor", s.profitFactor ? s.profitFactor.toFixed(2) : "—")}
      ${tradeRow("Max Drawdown", `${(n.maxDrawdown || 0).toFixed(2)}%`)}
      ${tradeRow("Sharpe Ratio", (n.sharpe || 0).toFixed(3))}
      ${tradeRow("NAV",          `$${(n.end || 0).toFixed(2)}`)}
    </div>
    <a href="${APP_URL}/portfolio" style="display:inline-block;background:#00D4AA;color:#0A0A0F;
       padding:12px 24px;border-radius:4px;font-weight:700;text-decoration:none;font-size:13px;">
      Full Report →
    </a>
  `);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function layout(body) {
  return `
<!DOCTYPE html><html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0A0A0F;color:#E8F4F8;font-family:'Courier New',monospace;padding:32px;margin:0;">
  <div style="max-width:540px;margin:0 auto;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px;">
      <div style="width:18px;height:18px;background:#00D4AA;
                  clip-path:polygon(50% 0%,100% 100%,0% 100%);"></div>
      <span style="font-size:13px;font-weight:700;letter-spacing:0.08em;">Anchor Ledger</span>
    </div>
    <div style="background:#111118;border:1px solid #1E1E2E;border-radius:6px;padding:24px;margin-bottom:20px;">
      ${body}
    </div>
    <div style="font-size:10px;color:#5A6478;">
      Anchor Ledger · ${APP_URL}
    </div>
  </div>
</body></html>`;
}

function tradeRow(label, value) {
  return `
    <div style="display:flex;justify-content:space-between;padding:6px 0;
                border-bottom:1px solid #1E1E2E;font-size:12px;">
      <span style="color:#5A6478;">${label}</span>
      <span style="color:#E8F4F8;font-weight:500;">${value ?? "—"}</span>
    </div>`;
}

function formatDate(d) {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

async function send(to, subject, html) {
  const apiKey = config.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch(RESEND_API_URL, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body}`);
  }
  return res.json();
}

module.exports = {
  sendWelcome, sendFirstTrade, sendDrawdownAlert,
  sendWeeklySummary, runWeeklySummaries, sendVerificationEmail, sendNewDeviceAlert,
  sendOnboardingComplete, sendDepositApproved, sendDepositComplete, sendDepositFailed,
};
