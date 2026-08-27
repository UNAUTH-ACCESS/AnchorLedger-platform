#!/usr/bin/env node
/**
 * Post-build SEO prerender.
 *
 * This is a client-rendered SPA — a single index.html for every route.
 * That's fine for Googlebot (it executes JS), but social/chat link-unfurl
 * bots (Slack, Twitter/X, Discord, iMessage) and most other crawlers do
 * NOT execute JS - they only read the static HTML <head> they're served.
 * Setting title/meta via React (react-helmet etc.) is invisible to them.
 *
 * Fix: after `vite build`, write a real per-route index.html with correct
 * title/description/canonical/OG/Twitter/JSON-LD baked in as static HTML.
 * The app's <div id="root"> and script tag are preserved untouched, so
 * once a real browser loads it, React Router takes over exactly as before
 * - this only changes what a non-JS crawler sees on first fetch.
 *
 * Works with nginx's existing `try_files $uri $uri/ /index.html;` with no
 * config change: a request for /architecture resolves to the directory
 * dist/architecture/ and its index.html is served via the `index` directive
 * - the same mechanism every static-site generator (Hugo, Gatsby, etc.)
 * relies on for clean URLs.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "..", "dist");
const SITE_URL = "https://anchorledger.space";
const OG_IMAGE = `${SITE_URL}/og-image.png`;

const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Anchor Ledger",
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
};

// Verbatim from HomePage.jsx's FAQ section - keep in sync with that file,
// not a paraphrase, since this becomes a Google rich-result verbatim quote.
const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    ["Which chains are supported?", "Solana handles deposits and withdrawals; Tron is where trade execution actually happens — both live today. Ethereum support is planned next, see the roadmap below."],
    ["What does identity verification actually involve?", "A real review, not a checkbox: your legal name, a government ID, and a selfie, checked by an actual reviewer before certain features unlock."],
    ["Is there a minimum deposit?", "No large minimum to worry about — start with whatever amount you're comfortable with."],
    ["How do I withdraw funds?", "You submit a request, it's reviewed, and the payout is sent on-chain — with the transaction verified before your request is marked complete. Nothing is automated blindly; every withdrawal has a real, checkable transaction behind it."],
    ["What if I change my mind?", "Revoke your permission at any time. It's an on-chain transaction you sign yourself — once it confirms, Anchor Ledger's authority over your wallet ends immediately."],
  ].map(([q, a]) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

const SOFTWARE_JSONLD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Anchor Ledger",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  description: "Non-custodial, multi-chain algorithmic trading. Grant a capped, revocable on-chain permission instead of depositing funds.",
  url: SITE_URL,
};

const ROUTES = [
  {
    path: "/",
    title: "Anchor Ledger — Non-Custodial Multi-Chain Algorithmic Trading",
    description: "Anchor Ledger doesn't hold your money. Grant a capped, revocable on-chain permission and let a validated signal engine trade within it — non-custodial, multi-chain, fully auditable.",
    jsonld: [ORG_JSONLD, SOFTWARE_JSONLD, FAQ_JSONLD],
  },
  {
    path: "/home",
    title: "Anchor Ledger — Non-Custodial Multi-Chain Algorithmic Trading",
    description: "Anchor Ledger doesn't hold your money. Grant a capped, revocable on-chain permission and let a validated signal engine trade within it — non-custodial, multi-chain, fully auditable.",
    jsonld: [ORG_JSONLD, SOFTWARE_JSONLD, FAQ_JSONLD],
  },
  {
    path: "/architecture",
    title: "Architecture — How Anchor Ledger's Permission Model Works",
    description: "Per-chain approval mechanics, on-chain verification instead of trusting a wallet app's word, and the two-cluster isolation rule behind Anchor Ledger's non-custodial trading permissions.",
    jsonld: [ORG_JSONLD],
  },
  {
    path: "/security",
    title: "Security & Audit — Anchor Ledger",
    description: "2FA, known-device alerts, encrypted identity documents, manual key-off-server withdrawals, and a full audit trail — the real controls protecting your Anchor Ledger account.",
    jsonld: [ORG_JSONLD],
  },
  {
    path: "/terms",
    title: "Terms of Service — Anchor Ledger",
    description: "The terms governing use of Anchor Ledger's non-custodial trading platform.",
    jsonld: [ORG_JSONLD],
  },
  {
    path: "/privacy",
    title: "Privacy Policy — Anchor Ledger",
    description: "How Anchor Ledger collects, uses, and protects your data.",
    jsonld: [ORG_JSONLD],
  },
];

function buildHead(template, route) {
  let html = template;

  html = html.replace(/<title>.*?<\/title>/s, `<title>${route.title}</title>`);
  html = html.replace(
    /<meta name="description" content=".*?"\s*\/?>/s,
    `<meta name="description" content="${route.description}" />`
  );

  const canonical = `${SITE_URL}${route.path}`;
  const robots = route.noindex ? "noindex, nofollow" : "index, follow";

  const tags = [
    `<link rel="canonical" href="${canonical}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Anchor Ledger" />`,
    `<meta property="og:title" content="${route.title}" />`,
    `<meta property="og:description" content="${route.description}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${route.title}" />`,
    `<meta name="twitter:description" content="${route.description}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />`,
    `<link rel="apple-touch-icon" href="/icon-192.png" />`,
    `<link rel="manifest" href="/manifest.json" />`,
    ...route.jsonld.map(obj => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`),
  ].join("\n    ");

  return html.replace("</head>", `    ${tags}\n  </head>`);
}

function main() {
  const templatePath = path.join(DIST, "index.html");
  if (!fs.existsSync(templatePath)) {
    console.error("prerender-seo: dist/index.html not found — run `vite build` first");
    process.exit(1);
  }
  const template = fs.readFileSync(templatePath, "utf8");

  for (const route of ROUTES) {
    const html = buildHead(template, route);
    const outPath = route.path === "/"
      ? templatePath
      : path.join(DIST, route.path.replace(/^\//, ""), "index.html");

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
    console.log(`prerender-seo: wrote ${path.relative(DIST, outPath) || "index.html"}`);
  }
}

main();
