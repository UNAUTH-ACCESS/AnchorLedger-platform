import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { colors } from "../../lib/tokens";
import client from "../../api/client";
import { FadeUp, wrap, Eyebrow, MarketingHeader, MarketingFooter } from "../../components/marketing/MarketingChrome";

const diagramBox = {
  background: colors.surface, border: `1px solid ${colors.border2}`,
  borderRadius: 6, padding: "20px 24px",
  fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5,
};
const line = { display: "flex", justifyContent: "space-between", gap: 16, padding: "6px 0" };
const key = { color: colors.muted };
const val = { color: colors.text };

const CHAIN_DETAIL = {
  SPL: {
    label: "Solana", live: true, role: "Deposits & withdrawals",
    approval: "buildSignableApprovalTransaction — a real, signable transaction",
    fees: "Fee-sponsored by the delegate keypair, so a new user never needs to hold SOL just to approve",
    steps: [
      ["Approval", "You sign a real Solana transaction granting a capped allowance"],
      ["Fee", "Sponsored — no SOL needed in your wallet to complete it"],
      ["Verification", "Server queries the chain directly for the resulting allowance before marking your wallet linked"],
    ],
  },
  TRC20: {
    label: "Tron", live: true, role: "Trade execution",
    approval: "TronLink approval with an explicit USDT spending cap",
    fees: "Gas for a wallet's first trading approval is auto-funded, so a new user isn't blocked by needing TRX first",
    steps: [
      ["Approval", "TronLink approval, capped to the amount you request"],
      ["Fee", "First approval's gas is funded for you"],
      ["Verification", "Server confirms the on-chain allowance directly — never trusts the wallet app's own success message"],
    ],
  },
  ERC20: {
    label: "Ethereum", live: false, role: "Planned",
    approval: "Not yet live",
    fees: "—",
    steps: [["Status", "Ethereum support is planned next — this page updates the moment it goes live"]],
  },
};

function ChainTabs() {
  const [active, setActive] = useState("SPL");
  const c = CHAIN_DETAIL[active];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {Object.entries(CHAIN_DETAIL).map(([key_, chain]) => (
          <button
            key={key_}
            onClick={() => setActive(key_)}
            style={{
              background: active === key_ ? colors.green : "transparent",
              color: active === key_ ? colors.bg : colors.muted,
              border: `1px solid ${active === key_ ? colors.green : colors.border2}`,
              borderRadius: 4, padding: "8px 16px", cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700,
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <span style={{ color: active === key_ ? colors.bg : (chain.live ? colors.green : colors.muted) }}>
              {chain.live ? "●" : "○"}
            </span>
            {chain.label}
          </button>
        ))}
      </div>

      <div style={diagramBox}>
        <div style={{ color: colors.text, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 4 }}>
          {c.label.toUpperCase()} — {c.role.toUpperCase()}
        </div>
        <div style={line}><span style={key}>├─ Approval:</span><span style={val}>{c.approval}</span></div>
        <div style={line}><span style={key}>└─ Fees:</span><span style={val}>{c.fees}</span></div>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        {c.steps.map(([label, body]) => (
          <div key={label} style={{ display: "flex", gap: 12, fontSize: 13, color: colors.muted, lineHeight: 1.6 }}>
            <span style={{ color: colors.green, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, flexShrink: 0, minWidth: 90 }}>
              {label.toUpperCase()}
            </span>
            <span>{body}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IsolationDiagram() {
  return (
    <div style={diagramBox}>
      <div style={{ color: colors.text, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 4 }}>
        TRANSACTION ISOLATION
      </div>
      <div style={line}><span style={key}>├─ Rule:</span><span style={val}>one chain per transaction, always</span></div>
      <div style={line}><span style={key}>├─ Deposits:</span><span style={val}>own connection, own code path</span></div>
      <div style={line}><span style={key}>├─ Execution:</span><span style={val}>own connection, own code path</span></div>
      <div style={line}><span style={key}>└─ Shared code path across chains:</span><span style={val}>never</span></div>
    </div>
  );
}

export default function ArchitecturePage() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    client.get("/marketing/stats")
      .then(res => setStats(res.data.data))
      .catch(() => {});
  }, []);

  return (
    <div style={{ background: colors.bg, color: colors.text, fontFamily: "'Inter', sans-serif", minHeight: "100vh" }}>
      <MarketingHeader current="/architecture" />

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "64px 20px 56px" }}>
        <FadeUp>
          <Eyebrow>Architecture</Eyebrow>
          <h1 style={{ fontSize: "clamp(26px, 5.5vw, 36px)", fontWeight: 700, lineHeight: 1.25, marginBottom: 20 }}>
            How the permission model actually works, chain by chain
          </h1>
          <p style={{ fontSize: 15, color: colors.muted, lineHeight: 1.7, maxWidth: 560 }}>
            The homepage shows you the permission slip. This page shows the machinery behind it —
            how approval, verification, and settlement actually happen on each chain Anchor Ledger supports.
          </p>
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── Per-chain approval mechanics ──────────────────────────────── */}
      <div style={{ ...wrap, padding: "56px 20px" }}>
        <FadeUp>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Approval, chain by chain</h2>
          <p style={{ fontSize: 13, color: colors.muted, lineHeight: 1.7, marginBottom: 24, maxWidth: 560 }}>
            Every chain gets its own approval flow, its own verification, and its own fee handling —
            nothing is generalized in a way that would blur what's actually happening on-chain.
          </p>
          <ChainTabs />
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── Server-side verification ─────────────────────────────────── */}
      <div style={{ ...wrap, padding: "56px 20px" }}>
        <FadeUp>
          <Eyebrow>Trust, but verify — literally</Eyebrow>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
            We check the chain. We don't check your browser's word.
          </h2>
          <p style={{ fontSize: 13, color: colors.muted, lineHeight: 1.7, maxWidth: 560 }}>
            A wallet app reporting "success" isn't proof of anything by itself — apps have bugs, mobile
            browsers get interrupted mid-signature, and a confirmation dialog can lie. Before Anchor
            Ledger ever marks a wallet as linked, the server queries the chain directly for the real,
            current on-chain allowance. If what's on-chain doesn't match what should be there, linking
            fails rather than silently trusting a client-reported success.
          </p>
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── Isolation ─────────────────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "56px 20px" }}>
        <FadeUp>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
            No transaction ever touches two chains at once
          </h2>
          <p style={{ fontSize: 13, color: colors.muted, lineHeight: 1.7, marginBottom: 24, maxWidth: 560 }}>
            Deposits and trade execution run on different chains today, and structurally, that's not
            an accident to work around — it's enforced. Each chain gets its own connection and its own
            code path; nothing is shared across them just because it would be less code to write.
          </p>
          <IsolationDiagram />
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── Path to live execution ───────────────────────────────────── */}
      <div style={{ ...wrap, padding: "56px 20px" }}>
        <FadeUp>
          <Eyebrow>Where things stand today</Eyebrow>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
            Signals are real. Execution is being proven correct before it touches a live exchange.
          </h2>
          <p style={{ fontSize: 13, color: colors.muted, lineHeight: 1.7, maxWidth: 560, marginBottom: 24 }}>
            Signals run against live market data today. Trade execution and settlement are being
            validated end-to-end — risk evaluation, position sizing, revocable permissions, and
            settlement — before real orders start routing to a live exchange on any chain. This is
            disclosed in the Terms of Service, and it's the same sequencing every chain goes through
            before its status below changes to fully live trading.
          </p>
          <div style={{
            display: "flex", flexWrap: "wrap", gap: "10px 28px",
            background: colors.surface, border: `1px solid ${colors.border2}`,
            borderRadius: 6, padding: "16px 20px",
          }}>
            {stats?.chains
              ? Object.values(stats.chains).map(c => (
                  <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
                    <span style={{ color: c.live ? colors.green : colors.muted }}>{c.live ? "●" : "○"}</span>
                    <span style={{ color: colors.text }}>{c.label}</span>
                    <span style={{ color: colors.muted }}>{c.live ? c.role : "Planned"}</span>
                  </div>
                ))
              : ["Solana", "Tron", "Ethereum"].map(label => (
                  <span key={label} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: colors.muted }}>
                    {label} …
                  </span>
                ))}
          </div>
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── Closing CTA ───────────────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "64px 20px", textAlign: "center" }}>
        <FadeUp>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
            Want the security side of the story too?
          </h2>
          <Link to="/security" style={{
            display: "inline-block", fontSize: 13, color: colors.green,
            fontFamily: "'JetBrains Mono', monospace", textDecoration: "none", marginBottom: 28,
          }}>
            Read the security & audit page →
          </Link>
          <div>
            <Link to="/signup" style={{ textDecoration: "none" }}>
              <button style={{
                background: colors.green, color: colors.bg, border: "none", borderRadius: 4,
                padding: "14px 28px", fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700, letterSpacing: "0.05em", cursor: "pointer",
              }}>
                Get Early Access
              </button>
            </Link>
          </div>
        </FadeUp>
      </div>

      <MarketingFooter />
    </div>
  );
}
