#!/usr/bin/env node
/**
 * Post-build SEO prerender.
 *
 * This is a client-rendered SPA — a single index.html for every route.
 * Googlebot executes JS, but it renders on a delay and on a budget, and
 * link-unfurl bots (Slack, X, Discord, iMessage) plus most other crawlers
 * do NOT execute JS at all — they only read the static HTML they're served.
 * Setting title/meta/content via React is invisible to them.
 *
 * Fix: after `vite build`, write a real per-route index.html with
 *   - correct <title>/description/canonical/OG/Twitter/JSON-LD in <head>, and
 *   - real, human-readable body content inside <div id="root">.
 * When a real browser loads the page, React's createRoot() clears #root and
 * takes over exactly as before — the prerendered body only changes what a
 * non-JS (or not-yet-rendered) crawler sees on first fetch. The content is a
 * faithful summary of what the app renders, not different content, so this
 * is plain prerendering, not cloaking.
 *
 * Works with nginx's existing `try_files $uri $uri/ /index.html;` with no
 * config change: a request for /architecture resolves to dist/architecture/
 * and its index.html is served via the `index` directive — the same
 * mechanism every static-site generator relies on for clean URLs.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { posts } from "../src/content/posts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "..", "dist");
const SITE_URL = "https://anchorledger.space";
const OG_IMAGE = `${SITE_URL}/og-image.png`;
const BUILD_DATE = new Date().toISOString().slice(0, 10);

// Newest post date — used as <lastmod> for the hub pages that link to posts.
const LATEST_POST_DATE = posts
  .map(p => p.date)
  .sort()
  .slice(-1)[0] || BUILD_DATE;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Anchor Ledger",
  url: SITE_URL,
  logo: `${SITE_URL}/icon-512.png`,
};

// Verbatim from HomePage.jsx's FAQ section - keep in sync with that file,
// not a paraphrase, since this becomes a Google rich-result verbatim quote.
const FAQ_QA = [
  ["Which chains are supported?", "Solana handles deposits and withdrawals; Tron is where trade execution actually happens — both live today. Ethereum support is planned next, see the roadmap below."],
  ["What does identity verification actually involve?", "A real review, not a checkbox: your legal name, a government ID, and a selfie, checked by an actual reviewer before certain features unlock."],
  ["Is there a minimum deposit?", "No large minimum to worry about — start with whatever amount you're comfortable with."],
  ["How do I withdraw funds?", "You submit a request, it's reviewed, and the payout is sent on-chain — with the transaction verified before your request is marked complete. Nothing is automated blindly; every withdrawal has a real, checkable transaction behind it."],
  ["What if I change my mind?", "Revoke your permission at any time. It's an on-chain transaction you sign yourself — once it confirms, Anchor Ledger's authority over your wallet ends immediately."],
];

const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_QA.map(([q, a]) => ({
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

// ── Body content, as plain blocks (same shape as content/posts.js) ──────────
// Faithful summaries of what each page renders. h1 is set separately.

const HOME_BLOCKS = [
  { type: "p", text: "Not custody. Not a deposit. A scoped, revocable authority — visible on-chain, limited to an amount you set, gone the moment you say so. Anchor Ledger runs a validated algorithmic trading strategy within that permission and never holds your funds." },
  { type: "h2", text: "The four things you actually need to know" },
  { type: "h3", text: "Where are my funds?" },
  { type: "p", text: "In your own wallet. Anchor Ledger never takes custody — your assets never move to us and never sit in an account we control." },
  { type: "h3", text: "What can Anchor Ledger actually do?" },
  { type: "p", text: "Execute trades, up to a cap you set, and nothing else. The permission cannot move more than that cap, cannot withdraw funds to itself, and cannot act outside the trading strategy you signed up for." },
  { type: "h3", text: "What happens if I change my mind?" },
  { type: "p", text: "You revoke it — one transaction, signed by you, submitted on-chain. The moment it confirms, Anchor Ledger's authority over your wallet ends. No \"pending cancellation,\" no 3–5 business days." },
  { type: "h3", text: "What happens when the permission expires?" },
  { type: "p", text: "It doesn't on its own — that's deliberate. There's no hidden countdown and no auto-renewal to catch. It stays active until you revoke it." },
  { type: "h2", text: "How it works, chain by chain" },
  { type: "p", text: "Solana handles deposits and withdrawals; Tron is where trade execution happens; Ethereum is next on the roadmap. Deposits and trading run on separate chains and separate code paths because a single transaction cannot reference two blockchain clusters at once. Full detail is on the Architecture and Security pages." },
  { type: "h2", text: "FAQ" },
  ...FAQ_QA.flatMap(([q, a]) => [{ type: "h3", text: q }, { type: "p", text: a }]),
  { type: "p", text: "Read more: Architecture · Security · Blog. Ready to try it? Get early access." },
];

const ARCHITECTURE_BLOCKS = [
  { type: "p", text: "How Anchor Ledger's permission model actually works: per-chain approval mechanics, on-chain verification instead of trusting a wallet app's word, and the two-cluster isolation rule behind non-custodial trading permissions." },
  { type: "h2", text: "A capped, revocable on-chain approval" },
  { type: "p", text: "When you link a wallet you set an Approval Cap. That number is written into the on-chain approval itself — the delegate address Anchor Ledger controls literally cannot move more than that amount, because the chain won't allow it. Revoking is a transaction you sign yourself; once it confirms, the authority is gone." },
  { type: "h2", text: "We verify the chain, not the wallet app's word" },
  { type: "p", text: "Before a wallet is marked linked, the server queries the chain directly for the real current allowance. A wallet app reporting \"success\" is not proof — mobile wallet confirmations have reported the wrong amount before. If on-chain state doesn't match, linking fails rather than silently trusting a client-reported success." },
  { type: "h2", text: "Two clusters never share a transaction" },
  { type: "p", text: "Solana handles deposits and withdrawals; Tron is where trade execution happens. A single transaction can't reference two different blockchain clusters at once, so any feature touching two chains gets two fully separate code paths and connections — structurally, not as an afterthought." },
  { type: "p", text: "Related: Security · Why Anchor Ledger doesn't custody your funds." },
];

const SECURITY_BLOCKS = [
  { type: "p", text: "The real controls protecting your Anchor Ledger account — the actual mechanisms, not badges." },
  { type: "h2", text: "Identity verification is a real human review" },
  { type: "p", text: "You submit your legal name, a government ID, and a selfie. An actual reviewer checks it before certain features unlock. Documents are encrypted at rest and never stored in the clear." },
  { type: "h2", text: "Two-factor authentication" },
  { type: "p", text: "Enable 2FA in Settings with any standard authenticator app. Once on, it's a required second step at login." },
  { type: "h2", text: "Known-device alerts" },
  { type: "p", text: "Anchor Ledger tracks which devices have signed in before. A sign-in from a new device triggers an email alert, so a login you didn't make doesn't go unnoticed." },
  { type: "h2", text: "Withdrawals are manual by design" },
  { type: "p", text: "You submit a request, it's reviewed, and the payout is sent as a real on-chain transaction, verified before the request is marked complete. The key that could move funds out of the deposit vault intentionally never touches any server — there is no code path that could automate an outbound payout." },
  { type: "h2", text: "Every action logged and yours to see" },
  { type: "p", text: "Every signal, proposal, execution, and settlement tied to your account is logged, timestamped, and scoped to you, visible under Audit Log once you're signed in." },
  { type: "p", text: "Related: Architecture · The real security controls protecting your account." },
];

const TERMS_BLOCKS = [
  { type: "p", text: "These are the terms governing use of Anchor Ledger's non-custodial trading platform. Anchor Ledger operates a scoped, revocable on-chain permission model and does not take custody of user funds. Trading is currently simulated against real market data — no order is placed on a live venue — as disclosed here. The full, authoritative text is rendered on this page in the app; this summary does not replace it." },
];

const PRIVACY_BLOCKS = [
  { type: "p", text: "How Anchor Ledger collects, uses, and protects your data. Identity-verification documents are encrypted at rest. Account activity is scoped to you and visible to you. The full, authoritative policy is rendered on this page in the app; this summary does not replace it." },
];

function blogIndexBlocks() {
  return [
    { type: "p", text: "Notes on how Anchor Ledger actually works — architecture, security, and honest updates on what's shipped." },
    ...posts.flatMap(p => [
      { type: "h2", text: p.title },
      { type: "p", text: p.description },
    ]),
  ];
}

// ── Routes ─────────────────────────────────────────────────────────────────

const ROUTES = [
  {
    path: "/",
    title: "Anchor Ledger — Non-Custodial Multi-Chain Algorithmic Trading",
    description: "Anchor Ledger doesn't hold your money. Grant a capped, revocable on-chain permission and let a validated signal engine trade within it — non-custodial, multi-chain, fully auditable.",
    h1: "Anchor Ledger doesn't hold your money. It's given a permission slip.",
    blocks: HOME_BLOCKS,
    jsonld: [ORG_JSONLD, SOFTWARE_JSONLD, FAQ_JSONLD],
    lastmod: LATEST_POST_DATE,
    changefreq: "weekly",
    priority: "1.0",
  },
  {
    // Same landing page, reachable at /home so an authenticated session (which
    // gets redirected off "/") can still view the marketing home. It is a
    // deliberate duplicate of "/", so it points its canonical at "/" and stays
    // out of the sitemap — otherwise Google flags it "duplicate, Google chose
    // a different canonical than the user."
    path: "/home",
    title: "Anchor Ledger — Non-Custodial Multi-Chain Algorithmic Trading",
    description: "Anchor Ledger doesn't hold your money. Grant a capped, revocable on-chain permission and let a validated signal engine trade within it — non-custodial, multi-chain, fully auditable.",
    h1: "Anchor Ledger doesn't hold your money. It's given a permission slip.",
    blocks: HOME_BLOCKS,
    jsonld: [ORG_JSONLD, SOFTWARE_JSONLD, FAQ_JSONLD],
    canonical: "/",
    excludeFromSitemap: true,
  },
  {
    path: "/architecture",
    title: "Architecture — How Anchor Ledger's Permission Model Works",
    description: "Per-chain approval mechanics, on-chain verification instead of trusting a wallet app's word, and the two-cluster isolation rule behind Anchor Ledger's non-custodial trading permissions.",
    h1: "How Anchor Ledger's permission model works",
    blocks: ARCHITECTURE_BLOCKS,
    jsonld: [ORG_JSONLD],
    lastmod: BUILD_DATE,
    priority: "0.8",
  },
  {
    path: "/security",
    title: "Security & Audit — Anchor Ledger",
    description: "2FA, known-device alerts, encrypted identity documents, manual key-off-server withdrawals, and a full audit trail — the real controls protecting your Anchor Ledger account.",
    h1: "The real security controls on your account",
    blocks: SECURITY_BLOCKS,
    jsonld: [ORG_JSONLD],
    lastmod: BUILD_DATE,
    priority: "0.8",
  },
  {
    path: "/terms",
    title: "Terms of Service — Anchor Ledger",
    description: "The terms governing use of Anchor Ledger's non-custodial trading platform.",
    h1: "Terms of Service",
    blocks: TERMS_BLOCKS,
    jsonld: [ORG_JSONLD],
    lastmod: BUILD_DATE,
    priority: "0.3",
  },
  {
    path: "/privacy",
    title: "Privacy Policy — Anchor Ledger",
    description: "How Anchor Ledger collects, uses, and protects your data.",
    h1: "Privacy Policy",
    blocks: PRIVACY_BLOCKS,
    jsonld: [ORG_JSONLD],
    lastmod: BUILD_DATE,
    priority: "0.3",
  },
  {
    path: "/blog",
    title: "Blog — Anchor Ledger",
    description: "Notes on how Anchor Ledger actually works — architecture, security, and honest updates on what's shipped.",
    h1: "Blog",
    blocks: blogIndexBlocks(),
    jsonld: [ORG_JSONLD],
    lastmod: LATEST_POST_DATE,
    priority: "0.7",
  },
  // One route per post, generated from the same data BlogPost.jsx renders -
  // adding a post to content/posts.js is enough for it to get its own
  // correct title/description/OG/Article JSON-LD and prerendered body with
  // no other change.
  ...posts.map(post => ({
    path: `/blog/${post.slug}`,
    title: `${post.title} — Anchor Ledger`,
    description: post.description,
    h1: post.title,
    blocks: post.blocks,
    dateLine: post.date,
    ogType: "article",
    publishedTime: post.date,
    lastmod: post.date,
    priority: "0.6",
    jsonld: [ORG_JSONLD, {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      dateModified: post.date,
      author: { "@type": "Organization", name: "Anchor Ledger" },
      publisher: {
        "@type": "Organization",
        name: "Anchor Ledger",
        logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png` },
      },
      mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
      url: `${SITE_URL}/blog/${post.slug}`,
    }],
  })),
];

function resolveCanonical(route) {
  const target = route.canonical || route.path;
  if (/^https?:\/\//.test(target)) return target;
  return target === "/" ? `${SITE_URL}/` : `${SITE_URL}${target}`;
}

function renderBlocks(blocks) {
  const P = 'style="font-size:15px;line-height:1.8;margin:0 0 16px;color:#AEB6C4"';
  const H2 = 'style="font-size:20px;font-weight:700;margin:32px 0 12px;color:#E8F4F8"';
  const H3 = 'style="font-size:16px;font-weight:700;margin:24px 0 8px;color:#E8F4F8"';
  return (blocks || []).map(b => {
    if (b.type === "h2") return `<h2 ${H2}>${escapeHtml(b.text)}</h2>`;
    if (b.type === "h3") return `<h3 ${H3}>${escapeHtml(b.text)}</h3>`;
    if (b.type === "ul") {
      const items = (b.items || []).map(i => `<li style="margin:0 0 6px">${escapeHtml(i)}</li>`).join("");
      return `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.7;color:#AEB6C4">${items}</ul>`;
    }
    return `<p ${P}>${escapeHtml(b.text)}</p>`;
  }).join("\n      ");
}

// Prerendered body, placed inside <div id="root">. React's createRoot()
// clears this on load; it exists purely for crawlers and the first paint.
function buildBody(route) {
  if (!route.h1 && !route.blocks) return "";
  const nav = [
    '<a href="/" style="color:#00D4AA">Home</a>',
    '<a href="/architecture" style="color:#00D4AA">Architecture</a>',
    '<a href="/security" style="color:#00D4AA">Security</a>',
    '<a href="/blog" style="color:#00D4AA">Blog</a>',
  ].join(" · ");
  const dateLine = route.dateLine
    ? `<p style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#5A6478;margin:0 0 24px">${escapeHtml(
        new Date(route.dateLine).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      )}</p>`
    : "";
  return `
    <div id="prerender-seo" style="max-width:720px;margin:0 auto;padding:48px 20px;font-family:'Inter',system-ui,sans-serif;color:#E8F4F8;background:#0A0A0F">
      <nav style="font-size:13px;color:#5A6478;margin:0 0 32px">${nav}</nav>
      <h1 style="font-size:clamp(26px,5.5vw,36px);font-weight:700;line-height:1.3;margin:0 0 20px">${escapeHtml(route.h1 || "")}</h1>
      ${dateLine}
      ${renderBlocks(route.blocks)}
    </div>`;
}

function buildHead(template, route) {
  let html = template;

  html = html.replace(/<title>.*?<\/title>/s, `<title>${route.title}</title>`);
  html = html.replace(
    /<meta name="description" content=".*?"\s*\/?>/s,
    `<meta name="description" content="${escapeHtml(route.description)}" />`
  );

  const canonical = resolveCanonical(route);
  const robots = route.noindex ? "noindex, nofollow" : "index, follow";

  const tags = [
    `<link rel="canonical" href="${canonical}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<meta property="og:type" content="${route.ogType || "website"}" />`,
    `<meta property="og:site_name" content="Anchor Ledger" />`,
    `<meta property="og:title" content="${escapeHtml(route.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(route.description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    ...(route.publishedTime ? [`<meta property="article:published_time" content="${route.publishedTime}" />`] : []),
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(route.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(route.description)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />`,
    `<link rel="apple-touch-icon" href="/icon-192.png" />`,
    `<link rel="manifest" href="/manifest.json" />`,
    ...route.jsonld.map(obj => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`),
  ].join("\n    ");

  html = html.replace("</head>", `    ${tags}\n  </head>`);

  const body = buildBody(route);
  if (body) {
    html = html.replace('<div id="root"></div>', `<div id="root">${body}\n  </div>`);
  }

  return html;
}

// Generated from the same ROUTES list every page's <head> comes from, so a
// new post added to content/posts.js appears here automatically instead of
// needing the static public/sitemap.xml kept in sync by hand.
function buildSitemap() {
  const entries = ROUTES.filter(r => !r.noindex && !r.excludeFromSitemap).map(r => {
    const priority = r.priority || (r.path === "/" ? "1.0" : r.path.startsWith("/blog/") ? "0.6" : "0.7");
    const lastmod = r.lastmod ? `\n    <lastmod>${r.lastmod}</lastmod>` : "";
    const changefreq = r.changefreq ? `\n    <changefreq>${r.changefreq}</changefreq>` : "";
    return `  <url>\n    <loc>${SITE_URL}${r.path === "/" ? "/" : r.path}</loc>${lastmod}${changefreq}\n    <priority>${priority}</priority>\n  </url>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
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

  fs.writeFileSync(path.join(DIST, "sitemap.xml"), buildSitemap());
  console.log("prerender-seo: wrote sitemap.xml");
}

main();
