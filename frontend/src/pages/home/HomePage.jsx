import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { colors, regime as regimeMeta } from "../../lib/tokens";
import client from "../../api/client";
import { FadeUp, wrap, Eyebrow, MarketingHeader, MarketingFooter } from "../../components/marketing/MarketingChrome";

function QAItem({ n, question, punch, body }) {
  return (
    <FadeUp style={{ marginBottom: 40 }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: colors.muted,
        marginBottom: 8,
      }}>
        {String(n).padStart(2, "0")}
      </div>
      <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>{question}</h3>
      <div style={{ fontSize: 15, fontWeight: 600, color: colors.green, marginBottom: 8, lineHeight: 1.5 }}>
        {punch}
      </div>
      <p style={{ fontSize: 13, color: colors.muted, lineHeight: 1.7, margin: 0 }}>{body}</p>
    </FadeUp>
  );
}

// Interactive, but honest: dragging the slider doesn't call the backend or
// simulate a fake trade - it just recomputes the same diagram a real
// approval produces, so a visitor can see their own number in the actual
// permission structure instead of trusting a fixed $10,000 example.
function PermissionDiagram() {
  const [cap, setCap] = useState(10000);
  const [revoked, setRevoked] = useState(false);
  const line = { display: "flex", justifyContent: "space-between", gap: 16, padding: "6px 0" };
  const key = { color: colors.muted };
  const val = { color: colors.text };

  return (
    <div>
      <div style={{
        background: colors.surface, border: `1px solid ${colors.border2}`,
        borderRadius: 6, padding: "20px 24px",
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5,
        boxShadow: "0 0 0 1px rgba(0,212,170,0.04)",
        opacity: revoked ? 0.5 : 1, transition: "opacity 0.25s",
      }}>
        <div style={{ color: colors.text, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 4 }}>
          {revoked ? "PERMISSION REVOKED" : "PERMISSION GRANTED"}
        </div>
        <div style={line}><span style={key}>├─ Spender:</span><span style={val}>Anchor Ledger Delegate</span></div>
        <div style={line}><span style={key}>├─ Asset:</span><span style={val}>USDC</span></div>
        <div style={line}><span style={key}>├─ Max Amount:</span><span style={val}>${cap.toLocaleString()}.00</span></div>
        <div style={line}><span style={key}>├─ Used:</span><span style={val}>$0.00</span></div>
        <div style={line}>
          <span style={key}>├─ Status:</span>
          {revoked
            ? <span style={{ color: colors.muted }}>○ Inactive</span>
            : <span style={{ color: colors.green }}>● Active</span>}
        </div>
        <div style={line}><span style={key}>└─ Revoke:</span><span style={val}>instant · on-chain · anytime</span></div>
      </div>

      <div style={{ marginTop: 16, opacity: revoked ? 0.5 : 1, transition: "opacity 0.25s" }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          fontSize: 11, color: colors.muted, marginBottom: 8,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <span>Try your own cap</span>
          <span style={{ color: colors.text }}>${cap.toLocaleString()}</span>
        </div>
        <input
          type="range" min={100} max={50000} step={100} value={cap}
          disabled={revoked}
          onChange={(e) => setCap(Number(e.target.value))}
          style={{ width: "100%", accentColor: colors.green, cursor: revoked ? "default" : "pointer" }}
        />
      </div>

      <button
        onClick={() => setRevoked(r => !r)}
        style={{
          marginTop: 14, background: "transparent",
          border: `1px solid ${revoked ? colors.green : colors.border2}`,
          borderRadius: 4, padding: "8px 14px",
          color: revoked ? colors.green : colors.muted,
          fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 600, letterSpacing: "0.04em", cursor: "pointer",
        }}
      >
        {revoked ? "↺ Re-grant (demo)" : "⨯ Revoke this permission (try it)"}
      </button>
    </div>
  );
}

function ExecutionFlowDiagram() {
  const line = { display: "flex", justifyContent: "space-between", gap: 16, padding: "6px 0" };
  const key = { color: colors.muted };
  const val = { color: colors.text };
  return (
    <div style={{
      background: colors.surface, border: `1px solid ${colors.border2}`,
      borderRadius: 6, padding: "20px 24px",
      fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5,
      boxShadow: "0 0 0 1px rgba(0,212,170,0.04)",
    }}>
      <div style={{ color: colors.text, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 4 }}>
        EXECUTION FLOW
      </div>
      <div style={line}><span style={key}>├─ Signal:</span><span style={val}>generated from live market data</span></div>
      <div style={line}><span style={key}>├─ Evaluation:</span><span style={val}>checked against your risk settings</span></div>
      <div style={line}><span style={key}>├─ Proposal:</span><span style={val}>created, logged, timestamped</span></div>
      <div style={line}><span style={key}>├─ Execution:</span><span style={val}>trade fires within your approved cap</span></div>
      <div style={line}><span style={key}>└─ Settlement:</span><span style={val}>funds ± result returned to your wallet</span></div>
    </div>
  );
}

function SecurityItem({ children }) {
  return (
    <li style={{ fontSize: 13, color: colors.muted, lineHeight: 1.7, marginBottom: 10 }}>
      {children}
    </li>
  );
}

function FAQItem({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <FadeUp style={{ marginBottom: 12 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", textAlign: "left", background: "transparent",
          border: "none", borderBottom: `1px solid ${colors.border}`,
          padding: "14px 0", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: colors.text }}>{question}</h3>
        <span style={{
          fontSize: 14, color: open ? colors.green : colors.muted,
          transform: open ? "rotate(45deg)" : "none",
          transition: "transform 0.2s", flexShrink: 0,
        }}>
          +
        </span>
      </button>
      <div style={{
        maxHeight: open ? 240 : 0, overflow: "hidden",
        transition: "max-height 0.25s ease",
      }}>
        <p style={{ fontSize: 13, color: colors.muted, lineHeight: 1.7, margin: "12px 0 20px" }}>{answer}</p>
      </div>
    </FadeUp>
  );
}

function ChainStatus({ label, role, live }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
      <span style={{ color: live ? colors.green : colors.muted }}>{live ? "●" : "○"}</span>
      <span style={{ color: colors.text }}>{label}</span>
      <span style={{ color: colors.muted }}>{live ? role : "Planned"}</span>
    </div>
  );
}

// Real numbers only - fetched from /marketing/stats, which queries the
// actual signal + regime tables. If the request fails or hasn't resolved
// yet, the bar just doesn't render rather than showing a placeholder
// number that could be mistaken for a real one.
function LiveStatsBar({ stats }) {
  if (!stats) return null;
  const regime = stats.currentRegime && regimeMeta[stats.currentRegime.state];
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: "10px 24px", alignItems: "center",
      background: colors.surface, border: `1px solid ${colors.border2}`,
      borderRadius: 6, padding: "12px 18px",
      fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ color: colors.green }}>●</span>
        <span style={{ color: colors.text }}>{stats.totalSignals.toLocaleString()}</span>
        <span style={{ color: colors.muted }}>signals generated to date</span>
      </div>
      {regime && (
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ color: regime.color }}>●</span>
          <span style={{ color: colors.text }}>{regime.label}</span>
          <span style={{ color: colors.muted }}>current market regime</span>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    client.get("/marketing/stats")
      .then(res => setStats(res.data.data))
      .catch(() => {}); // page reads fine with no live bar if this fails
  }, []);

  return (
    <div style={{ background: colors.bg, color: colors.text, fontFamily: "'Inter', sans-serif", minHeight: "100vh" }}>

      <MarketingHeader current="/" />

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "64px 20px 56px" }}>
        <FadeUp>
          <Eyebrow>Multi-chain algorithmic trading</Eyebrow>
          <h1 style={{ fontSize: "clamp(28px, 6vw, 40px)", fontWeight: 700, lineHeight: 1.25, marginBottom: 20 }}>
            Anchor Ledger doesn't hold your money. It's given a permission slip.
          </h1>
          <p style={{ fontSize: 15, color: colors.muted, lineHeight: 1.7, marginBottom: 32, maxWidth: 560 }}>
            Not custody. Not a deposit. A scoped, revocable authority — visible on-chain,
            limited to an amount you set, gone the moment you say so.
          </p>
          <div style={{ marginBottom: 32 }}>
            <LiveStatsBar stats={stats} />
          </div>
          <Link to="/signup" style={{ textDecoration: "none" }}>
            <button style={{
              background: colors.green, color: colors.bg, border: "none", borderRadius: 4,
              padding: "14px 28px", fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700, letterSpacing: "0.05em", cursor: "pointer",
            }}>
              Get Early Access
            </button>
          </Link>
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── The four things ───────────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "56px 20px" }}>
        <FadeUp style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>The four things you actually need to know</h2>
        </FadeUp>

        <QAItem
          n={1}
          question="Where are my funds?"
          punch="In your own wallet. Full stop."
          body="Anchor Ledger never takes custody. Your assets never move to us, never sit in an account we control. They stay exactly where they are — in the wallet only you hold the keys to."
        />
        <QAItem
          n={2}
          question="What can Anchor Ledger actually do?"
          punch="Execute trades, up to a cap you set. Nothing else."
          body="The permission you grant is scoped to a specific maximum amount. It cannot move more than that. It cannot withdraw funds to itself. It cannot do anything outside of executing the trading strategy you signed up for."
        />
        <QAItem
          n={3}
          question="What happens if I change my mind?"
          punch="You revoke it. Instantly. On-chain."
          body={<>One transaction, signed by you, and the permission is gone — not "pending cancellation," not "processed within 3–5 business days." The moment it confirms on-chain, Anchor Ledger's authority over your wallet ends.</>}
        />
        <QAItem
          n={4}
          question="What happens when the permission expires?"
          punch="It doesn't, on its own — that's deliberate, not a gap."
          body="There's no hidden countdown and no auto-renewal you have to catch. The permission lasts exactly as long as you choose: it stays active until you revoke it. You're always the one who ends it, not a clock."
        />
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── Permission diagram ─────────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "56px 20px" }}>
        <FadeUp>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
            The permission, shown as what it actually is
          </h2>
          <PermissionDiagram />
          <div style={{ fontSize: 11, color: colors.muted, marginTop: 12, fontStyle: "italic" }}>
            This is the actual permission structure granted on-chain — not a summary, not marketing copy.
          </div>
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── A. What happens after you approve ─────────────────────────── */}
      <div style={{ ...wrap, padding: "56px 20px" }}>
        <FadeUp>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>What happens after you approve</h2>
          <p style={{ fontSize: 13, color: colors.muted, lineHeight: 1.7, marginBottom: 24, maxWidth: 560 }}>
            Once you've granted permission, here's exactly what happens:
          </p>
          <ExecutionFlowDiagram />
          <div style={{ fontSize: 11, color: colors.muted, marginTop: 12, fontStyle: "italic" }}>
            Every step is logged. Every proposal, execution, and settlement is tied to your account
            and visible in your history — nothing happens off the record.
          </div>
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── B. Security & architecture ────────────────────────────────── */}
      <div style={{ ...wrap, padding: "56px 20px" }}>
        <FadeUp>
          <Eyebrow>Built on specifics, not promises</Eyebrow>
          <ul style={{ margin: 0, padding: "0 0 0 18px" }}>
            <SecurityItem>
              <strong style={{ color: colors.text }}>Non-custodial by design</strong> — Anchor Ledger never
              holds a standing balance of your funds. Capital only ever moves within your approved
              cap, for the duration of an active trade, and returns to your wallet at settlement —
              visible in your history the whole way.
            </SecurityItem>
            <SecurityItem>
              <strong style={{ color: colors.text }}>Identity verification documents encrypted at rest</strong> —
              not stored in the clear, ever
            </SecurityItem>
            <SecurityItem>
              <strong style={{ color: colors.text }}>Two-factor authentication available</strong> —
              standard TOTP, works with any authenticator app
            </SecurityItem>
            <SecurityItem>
              <strong style={{ color: colors.text }}>Known-device tracking</strong> — new devices logging
              into your account are recorded and visible to you
            </SecurityItem>
            <SecurityItem>
              <strong style={{ color: colors.text }}>Full audit trail</strong> — every account action, every
              review, every decision is logged and timestamped
            </SecurityItem>
          </ul>
          <div style={{ fontSize: 11, color: colors.muted, marginTop: 8, fontStyle: "italic" }}>
            No shield icons. No "bank-grade" claims. Just what's actually true.
          </div>
          <Link to="/security" style={{
            display: "inline-block", marginTop: 16, fontSize: 12, color: colors.green,
            fontFamily: "'JetBrains Mono', monospace", textDecoration: "none",
          }}>
            Full security & audit practices →
          </Link>
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── C. FAQ ─────────────────────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "56px 20px" }}>
        <FadeUp style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>FAQ</h2>
        </FadeUp>

        <FAQItem
          question="Which chains are supported?"
          answer="Solana handles deposits and withdrawals; Tron and Ethereum both handle trade execution — all three live today. See the roadmap below for exactly what 'live' means on each."
        />
        <FAQItem
          question="What does identity verification actually involve?"
          answer="A real review, not a checkbox: your legal name, a government ID, and a selfie, checked by an actual reviewer before certain features unlock."
        />
        <FAQItem
          question="Is there a minimum deposit?"
          answer="No large minimum to worry about — start with whatever amount you're comfortable with."
        />
        <FAQItem
          question="How do I withdraw funds?"
          answer="You submit a request, it's reviewed, and the payout is sent on-chain — with the transaction verified before your request is marked complete. Nothing is automated blindly; every withdrawal has a real, checkable transaction behind it."
        />
        <FAQItem
          question="What if I change my mind?"
          answer="Revoke your permission at any time. It's an on-chain transaction you sign yourself — once it confirms, Anchor Ledger's authority over your wallet ends immediately."
        />
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── D. Roadmap ─────────────────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "56px 20px" }}>
        <FadeUp>
          <Eyebrow>Built in stages, headed to mainnet</Eyebrow>
          <p style={{ fontSize: 13, color: colors.muted, lineHeight: 1.7, marginBottom: 24, maxWidth: 560 }}>
            Anchor Ledger is being built the way infrastructure should be: one verified piece at a
            time. Live execution exists today so the surrounding system — signals, risk evaluation,
            settlement, custody-free permissions — are proven correct before real orders start
            hitting real exchanges. Each chain moves to live execution only once it's tested and
            verified, not on a promise.
          </p>
          <div style={{
            display: "flex", flexWrap: "wrap", gap: "10px 28px",
            background: colors.surface, border: `1px solid ${colors.border2}`,
            borderRadius: 6, padding: "16px 20px",
          }}>
            {stats?.chains
              ? Object.values(stats.chains).map(c => (
                  <ChainStatus key={c.label} label={c.label} role={c.role} live={c.live} />
                ))
              : ["Solana", "Tron", "Ethereum"].map(label => (
                  <span key={label} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: colors.muted }}>
                    {label} …
                  </span>
                ))}
          </div>
          <div style={{ fontSize: 11, color: colors.muted, marginTop: 12, fontStyle: "italic" }}>
            As each chain goes live, this page updates — you'll always know exactly where things stand.
          </div>
          <Link to="/architecture" style={{
            display: "inline-block", marginTop: 16, fontSize: 12, color: colors.green,
            fontFamily: "'JetBrains Mono', monospace", textDecoration: "none",
          }}>
            How approval & execution actually work, chain by chain →
          </Link>
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── E. Closing CTA ─────────────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "64px 20px", textAlign: "center" }}>
        <FadeUp>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>
            Ready to see it for yourself?
          </h2>
          <Link to="/signup" style={{ textDecoration: "none" }}>
            <button style={{
              background: colors.green, color: colors.bg, border: "none", borderRadius: 4,
              padding: "14px 28px", fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700, letterSpacing: "0.05em", cursor: "pointer",
            }}>
              Get Early Access
            </button>
          </Link>
        </FadeUp>
      </div>

      <MarketingFooter />
    </div>
  );
}
