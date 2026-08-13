import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { colors } from "../../lib/tokens";

// Lightweight scroll fade-up, no animation library — matches "subtle
// scroll-based fade-up only, no other animation" from the design brief.
function useFadeUp() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, visible];
}

function FadeUp({ children, style }) {
  const [ref, visible] = useFadeUp();
  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(16px)",
        transition: "opacity 0.6s ease, transform 0.6s ease",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const wrap = { maxWidth: 720, margin: "0 auto", padding: "0 20px" };

function Eyebrow({ children }) {
  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: colors.green,
      letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

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

function PermissionDiagram() {
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
        PERMISSION GRANTED
      </div>
      <div style={line}><span style={key}>├─ Spender:</span><span style={val}>Anchor Ledger Delegate</span></div>
      <div style={line}><span style={key}>├─ Asset:</span><span style={val}>USDC</span></div>
      <div style={line}><span style={key}>├─ Max Amount:</span><span style={val}>$10,000.00</span></div>
      <div style={line}><span style={key}>├─ Used:</span><span style={val}>$0.00</span></div>
      <div style={line}>
        <span style={key}>├─ Status:</span>
        <span style={{ color: colors.green }}>● Active</span>
      </div>
      <div style={line}><span style={key}>└─ Revoke:</span><span style={val}>instant · on-chain · anytime</span></div>
    </div>
  );
}

function ChainStatus({ label, state }) {
  const active = state === "active";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
      <span style={{ color: active ? colors.green : colors.muted }}>{active ? "●" : "○"}</span>
      <span style={{ color: colors.text }}>{label}</span>
      <span style={{ color: colors.muted }}>{active ? "In progress" : "Planned"}</span>
    </div>
  );
}

export default function HomePage() {
  return (
    <div style={{ background: colors.bg, color: colors.text, fontFamily: "'Inter', sans-serif", minHeight: "100vh" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ padding: "20px 20px 0" }}>
        <div style={{ ...wrap, padding: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 20, height: 20, background: colors.green, clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)" }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em" }}>
            Anchor Ledger
          </span>
        </div>
      </div>

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
          <Link to="/subscribe" style={{ textDecoration: "none" }}>
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

      {/* ── Chain status ───────────────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "56px 20px" }}>
        <FadeUp>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Built in stages, headed to mainnet</h2>
          <p style={{ fontSize: 13, color: colors.muted, lineHeight: 1.7, marginBottom: 24, maxWidth: 560 }}>
            Anchor Ledger is in active development. Live execution is rolling out chain by chain
            as we move toward full mainnet launch — each piece is built, tested, and verified
            before it goes live for real funds.
          </p>
          <div style={{
            display: "flex", flexWrap: "wrap", gap: "10px 28px",
            background: colors.surface, border: `1px solid ${colors.border2}`,
            borderRadius: 6, padding: "16px 20px",
          }}>
            <ChainStatus label="Solana" state="active" />
            <ChainStatus label="Ethereum" state="planned" />
            <ChainStatus label="Tron" state="planned" />
          </div>
        </FadeUp>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${colors.border}` }}>
        <div style={{ ...wrap, padding: "28px 20px", display: "flex", gap: 20, flexWrap: "wrap" }}>
          {[
            ["Terms of Service", "/terms"],
            ["Privacy Policy", "/privacy"],
            ["Contact", "mailto:hello@anchorledger.io"],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              style={{ fontSize: 11, color: colors.muted, textDecoration: "none", fontFamily: "'JetBrains Mono', monospace" }}
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
