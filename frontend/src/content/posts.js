// Plain data, not JSX - prerender-seo.js (a Node script, not React) imports
// this same array to generate correct per-post title/description/OG tags,
// so post metadata can't live inside a component it can't execute.
// `blocks` are rendered generically by BlogPost.jsx.

export const posts = [
  {
    slug: "why-anchor-ledger-doesnt-custody-your-funds",
    title: "Why Anchor Ledger Doesn't Custody Your Funds",
    description: "A capped, revocable on-chain permission instead of a deposit — what that actually means, and why it's a real legal and technical distinction, not just wording.",
    date: "2026-08-27",
    blocks: [
      { type: "p", text: "Most trading platforms ask you to deposit funds into an account they control. Anchor Ledger doesn't do that. Instead, you sign a real on-chain transaction granting a capped, revocable spending permission — your assets never move to us, never sit in an account we control." },
      { type: "h2", text: "What \"capped\" actually means" },
      { type: "p", text: "When you link a wallet, you set a maximum amount — the Approval Cap. That number isn't a suggestion or a soft limit enforced by our servers; it's written into the on-chain approval itself. The delegate address we control literally cannot move more than that amount, because the chain itself won't let it." },
      { type: "h2", text: "What \"revocable\" actually means" },
      { type: "p", text: "Revoking is a transaction you sign yourself, submitted on-chain. It's not a support ticket, not \"3-5 business days,\" not a setting that quietly does nothing. The moment that transaction confirms, our authority over your wallet ends — verifiably, on a public ledger, not because we say so." },
      { type: "h2", text: "We verify the chain. We don't trust a wallet app's word." },
      { type: "p", text: "Before we ever mark a wallet as linked, our server queries the chain directly for the real, current on-chain allowance. A wallet app reporting \"success\" isn't proof of anything by itself — we've seen mobile wallet confirmations report the wrong amount before. If what's on-chain doesn't match what should be there, linking fails rather than silently trusting a client-reported success." },
      { type: "h2", text: "This is why deposits and trading run on separate chains" },
      { type: "p", text: "Solana handles deposits and withdrawals; Tron is where trade execution happens. That's not an arbitrary split — a single transaction can't reference two different blockchain clusters at once, so any feature touching two chains gets two fully separate code paths and connections, structurally, not as an afterthought." },
      { type: "p", text: "Read more on how this works chain by chain on our Architecture page, or see the exact security controls protecting your account." },
    ],
  },
  {
    slug: "the-real-security-controls-on-your-account",
    title: "The Real Security Controls Protecting Your Account",
    description: "2FA, known-device alerts, encrypted identity documents, and withdrawals designed so no code path can automate one — the actual controls, not shield icons.",
    date: "2026-08-27",
    blocks: [
      { type: "p", text: "No \"bank-grade encryption\" claims, no badges that don't mean anything — here's exactly what protects your Anchor Ledger account, in plain terms." },
      { type: "h2", text: "Identity verification is a real human review" },
      { type: "p", text: "You submit your legal name, a government ID, and a selfie. An actual reviewer checks it before certain features unlock — this isn't an automated rubber stamp. Submitted documents are encrypted at rest and never stored in the clear." },
      { type: "h2", text: "Two-factor authentication, the standard way" },
      { type: "p", text: "Enable 2FA in Settings with any standard authenticator app — no proprietary app required. Once enabled, it's a required second step at login, not an optional extra that quietly does nothing." },
      { type: "h2", text: "Known-device tracking" },
      { type: "p", text: "We keep track of which devices have signed into your account before. A sign-in from a new device triggers an email alert to you, so a login you didn't make doesn't go unnoticed." },
      { type: "h2", text: "Withdrawals are manual by design — not an automation gap" },
      { type: "p", text: "You submit a withdrawal request, it's reviewed, and the payout is sent as a real on-chain transaction, verified before your request is marked complete. The private key that could move funds out of the deposit vault intentionally never touches any server — there's no code path that could automate an outbound payout, because the one thing that could do it was never put somewhere automation could reach it." },
      { type: "h2", text: "Every action, logged and yours to see" },
      { type: "p", text: "Every signal, proposal, execution, and settlement tied to your account is logged, timestamped, and scoped to you specifically. Once you're signed in, your full history is available under Audit Log — nothing about what happened to your account is hidden from you." },
      { type: "p", text: "Full detail on all of this, plus the on-chain permission model these controls sit alongside, is on our Security page." },
    ],
  },
  {
    slug: "what-actually-happens-between-a-signal-and-a-trade",
    title: "What Actually Happens Between a Signal and a Trade",
    description: "Not every signal becomes a trade. Four named checks — signal strength, drawdown, regime-based stress exposure, and Kelly-criterion position sizing — decide before anything is proposed.",
    date: "2026-08-27",
    blocks: [
      { type: "p", text: "A signal firing doesn't mean a trade happens. Before anything becomes a Trade Proposal, it passes through four checks, in this order, against your own portfolio's risk configuration — not a generic one-size-fits-all filter." },
      { type: "h2", text: "1. Signal strength threshold" },
      { type: "p", text: "Every signal carries a strength score. If it's below your configured threshold, evaluation stops immediately — the signal is recorded, but nothing is proposed." },
      { type: "h2", text: "2. Drawdown check" },
      { type: "p", text: "Your current NAV is compared against your portfolio's inception NAV. If the drawdown from that starting point has already breached your configured maximum, new positions stop being proposed — the check runs before sizing, not after." },
      { type: "h2", text: "3. Stress-regime exposure cap" },
      { type: "p", text: "When the system's regime detection is currently reading \"STRESS,\" your total open-position exposure as a percentage of NAV is checked against a separate, tighter cap than normal conditions allow. Above that cap, further exposure is blocked until the regime changes or existing positions close." },
      { type: "h2", text: "4. Position sizing via Kelly criterion" },
      { type: "p", text: "If a signal clears the first three checks, its size isn't fixed — it's computed using a Kelly-criterion fraction (capped by your own configured maximum), applied against your current NAV and max-position-percent setting. If that computation resolves to zero or a balance too small to act on, the signal is blocked as insufficient balance rather than proposing a trade of nothing." },
      { type: "h2", text: "Only what survives all four becomes a proposal" },
      { type: "p", text: "A signal that's blocked at any step is still recorded, with the specific reason attached — drawdown breach, stress cap, below threshold, or insufficient balance — visible in your account's history, not silently dropped. Only a signal that clears every check becomes an actual Trade Proposal tied to a real wallet and venue." },
    ],
  },
];
