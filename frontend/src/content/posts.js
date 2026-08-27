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
    slug: "why-were-upfront-about-simulated-trading",
    title: "Why We're Upfront About Running Simulated Trades",
    description: "Real signals, real market data, real settlement math — but no order currently placed on a live exchange. Here's exactly what that means and why we're not hiding it.",
    date: "2026-08-27",
    blocks: [
      { type: "p", text: "Anchor Ledger currently operates in a simulated, paper-trading mode. Signals are generated from live market data, and gains and losses are calculated and settled as if trades executed at real market prices — but no order is currently placed on any external exchange or venue. We say this plainly, on the homepage, in the Terms of Service, and here, because we'd rather you know exactly where things stand than find out later." },
      { type: "h2", text: "Why simulate at all?" },
      { type: "p", text: "Because the parts of the system that matter most — signal generation, risk evaluation, position sizing, the revocable permission model, settlement — need to be proven correct before real orders start hitting a live exchange with real money on the line. Simulation lets every one of those pieces run against real market conditions and be verified end-to-end, without the failure mode of a bug in any of them costing a real user real money." },
      { type: "h2", text: "What's real right now, even though trading is simulated" },
      { type: "p", text: "The permission model is real. If you link a wallet, the on-chain approval is a real signed transaction, verified on-chain, revocable on-chain — none of that is simulated. Deposits, when made, sit in a real deposit vault, isolated from the simulated engine by design: real funds and simulated trade outcomes never touch. See our Architecture page for exactly how that isolation is enforced in code, not just in policy." },
      { type: "h2", text: "How you'll know when that changes" },
      { type: "p", text: "The Architecture page reflects live chain-by-chain status and updates the moment execution status changes — it's not a static claim we update manually when we remember to. If you're evaluating whether to trust a platform that says it does real trading, the actual test is whether it tells you when it doesn't, before you have to ask." },
    ],
  },
];
