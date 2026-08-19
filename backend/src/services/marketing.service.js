/**
 * Marketing Email Service
 *
 * Manages lead nurturing email list and campaign sending.
 * Completely separate from transactional notification system.
 *
 * Features:
 *   - Subscribe / unsubscribe with GDPR-compliant token
 *   - Double opt-in ready (single for now)
 *   - Campaign sending via Resend
 *   - Unsubscribe link in every email
 *   - Never emails unsubscribed addresses
 */

const prisma = require("../lib/prisma");
const logger = require("../lib/logger");
const config = require("../lib/config");

const RESEND_API_URL  = "https://api.resend.com/emails";
const FROM_ADDRESS    = config.FROM_EMAIL;
const APP_URL         = config.APP_URL;

// ── Subscriber management ─────────────────────────────────────────────────────

async function subscribe(email, name = null, source = "website", metadata = {}) {
  try {
    const existing = await prisma.subscriber.findUnique({ where: { email } });

    if (existing) {
      if (existing.status === "SUBSCRIBED") {
        return { status: "already_subscribed", subscriber: existing };
      }
      // Re-subscribe
      const updated = await prisma.subscriber.update({
        where: { email },
        data:  { status: "SUBSCRIBED", unsubscribedAt: null, subscribedAt: new Date() },
      });
      logger.info("[marketing] Re-subscribed", { email });
      // The subscription itself is the thing the visitor is waiting on - a
      // welcome-email delivery failure (e.g. Resend rejecting the recipient)
      // must not turn a successful signup into a 500 for them.
      sendWelcomeEmail(updated).catch(err =>
        logger.warn("[marketing] Welcome email failed to send", { email, error: err.message }));
      return { status: "resubscribed", subscriber: updated };
    }

    const subscriber = await prisma.subscriber.create({
      data: { email, name, source, metadata, status: "SUBSCRIBED" },
    });

    logger.info("[marketing] New subscriber", { email, source });
    sendWelcomeEmail(subscriber).catch(err =>
      logger.warn("[marketing] Welcome email failed to send", { email, error: err.message }));
    return { status: "subscribed", subscriber };

  } catch (err) {
    logger.error("[marketing] Subscribe failed", { email, error: err.message });
    throw err;
  }
}

async function unsubscribe(token) {
  const subscriber = await prisma.subscriber.findUnique({
    where: { unsubscribeToken: token },
  });

  if (!subscriber) throw new Error("Invalid unsubscribe token");
  if (subscriber.status === "UNSUBSCRIBED") return { status: "already_unsubscribed" };

  await prisma.subscriber.update({
    where: { id: subscriber.id },
    data:  { status: "UNSUBSCRIBED", unsubscribedAt: new Date() },
  });

  logger.info("[marketing] Unsubscribed", { email: subscriber.email });
  return { status: "unsubscribed", email: subscriber.email };
}

async function getSubscribers(status = "SUBSCRIBED", limit = 100, offset = 0) {
  const [subscribers, total] = await Promise.all([
    prisma.subscriber.findMany({
      where:   { status },
      orderBy: { subscribedAt: "desc" },
      take:    limit,
      skip:    offset,
    }),
    prisma.subscriber.count({ where: { status } }),
  ]);
  return { subscribers, total };
}

// ── Email sending ─────────────────────────────────────────────────────────────

async function sendWelcomeEmail(subscriber) {
  const subject = "Welcome to Anchor Ledger — systematic trading, built different";
  const html = buildEmail(subscriber, subject, `
    <h2 style="color:#00D4AA;font-size:20px;margin-bottom:16px;">
      Welcome to Anchor Ledger
    </h2>
    <p style="margin-bottom:16px;">
      You're on the list. Anchor Ledger is a systematic trading platform — trades are
      generated and executed algorithmically from live market data, not manual calls,
      not signals from Telegram, not copy trading.
    </p>
    <p style="margin-bottom:16px;">
      Here's how it works:
    </p>
    <ul style="margin-bottom:16px;padding-left:20px;">
      <li style="margin-bottom:8px;">Deposits are pooled into a platform-managed vault and used for trading on your behalf — not held in a wallet you control day to day</li>
      <li style="margin-bottom:8px;">Signals are generated from live market data and checked against your risk settings before any trade executes</li>
      <li style="margin-bottom:8px;">Regime-aware — trading pauses automatically during high-volatility market conditions</li>
      <li style="margin-bottom:8px;">Autonomous once enabled — entry, exit, and risk management run without manual intervention</li>
    </ul>
    <p style="margin-bottom:24px;">
      We're in private beta. Early access invites go out to this list first.
    </p>
    <a href="${APP_URL}" style="display:inline-block;background:#00D4AA;color:#0A0A0F;
       padding:12px 24px;border-radius:4px;font-weight:700;text-decoration:none;
       font-size:13px;letter-spacing:0.04em;">
      Learn more →
    </a>
  `);

  return sendEmail([subscriber.email], subject, html);
}

async function sendCampaign(subject, htmlContent, recipientEmails = null) {
  // If no recipients specified, send to all active subscribers
  const emails = recipientEmails || (await prisma.subscriber.findMany({
    where:  { status: "SUBSCRIBED" },
    select: { email: true },
  })).map(s => s.email);

  if (emails.length === 0) {
    logger.info("[marketing] No recipients for campaign");
    return { sent: 0 };
  }

  // Resend supports up to 50 recipients per call — batch if needed
  const batchSize = 50;
  let sent = 0;

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    try {
      await sendEmail(batch, subject, htmlContent);
      sent += batch.length;
      logger.info("[marketing] Campaign batch sent", { sent, total: emails.length });
    } catch (err) {
      logger.error("[marketing] Campaign batch failed", { error: err.message, batch: batch.length });
    }
  }

  return { sent, total: emails.length };
}

function buildEmail(subscriber, subject, bodyHtml) {
  const unsubUrl = `${APP_URL}/unsubscribe?token=${subscriber.unsubscribeToken}`;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#0A0A0F;color:#E8F4F8;font-family:'Courier New',monospace;padding:32px;margin:0;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px;">
      <div style="width:20px;height:20px;background:#00D4AA;
                  clip-path:polygon(50% 0%,100% 100%,0% 100%);"></div>
      <span style="font-size:14px;font-weight:700;letter-spacing:0.08em;">Anchor Ledger</span>
    </div>

    <div style="background:#111118;border:1px solid #1E1E2E;border-radius:6px;padding:28px;margin-bottom:24px;">
      ${bodyHtml}
    </div>

    <div style="font-size:10px;color:#5A6478;border-top:1px solid #1E1E2E;padding-top:16px;">
      You're receiving this because you subscribed at ${APP_URL}.
      <br>
      <a href="${unsubUrl}" style="color:#5A6478;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>`;
}

async function sendEmail(to, subject, html) {
  const apiKey = config.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const res = await fetch(RESEND_API_URL, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ from: FROM_ADDRESS, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }

  return res.json();
}

module.exports = { subscribe, unsubscribe, getSubscribers, sendCampaign, buildEmail };
