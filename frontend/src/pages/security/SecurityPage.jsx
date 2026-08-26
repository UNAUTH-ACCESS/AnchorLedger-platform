import { useState } from "react";
import { Link } from "react-router-dom";
import { colors } from "../../lib/tokens";
import { FadeUp, wrap, Eyebrow, MarketingHeader, MarketingFooter } from "../../components/marketing/MarketingChrome";

// Same progressive-disclosure pattern as the homepage FAQ — click to expand.
// Each item states a real, shipped control, not an aspiration.
function SecurityDetail({ title, summary, detail }) {
  const [open, setOpen] = useState(false);
  return (
    <FadeUp style={{ marginBottom: 12 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", textAlign: "left", background: "transparent",
          border: "none", borderBottom: `1px solid ${colors.border}`,
          padding: "16px 0", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
        }}
      >
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: colors.text }}>{title}</h3>
          <p style={{ fontSize: 12.5, color: colors.muted, margin: "4px 0 0" }}>{summary}</p>
        </div>
        <span style={{
          fontSize: 14, color: open ? colors.green : colors.muted,
          transform: open ? "rotate(45deg)" : "none",
          transition: "transform 0.2s", flexShrink: 0,
        }}>
          +
        </span>
      </button>
      <div style={{
        maxHeight: open ? 200 : 0, overflow: "hidden",
        transition: "max-height 0.25s ease",
      }}>
        <p style={{ fontSize: 13, color: colors.muted, lineHeight: 1.7, margin: "12px 0 20px" }}>{detail}</p>
      </div>
    </FadeUp>
  );
}

export default function SecurityPage() {
  return (
    <div style={{ background: colors.bg, color: colors.text, fontFamily: "'Inter', sans-serif", minHeight: "100vh" }}>
      <MarketingHeader current="/security" />

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "64px 20px 56px" }}>
        <FadeUp>
          <Eyebrow>Security & Audit</Eyebrow>
          <h1 style={{ fontSize: "clamp(26px, 5.5vw, 36px)", fontWeight: 700, lineHeight: 1.25, marginBottom: 20 }}>
            Security, without the shield icons
          </h1>
          <p style={{ fontSize: 15, color: colors.muted, lineHeight: 1.7, maxWidth: 560 }}>
            No "bank-grade" claims, no badges that don't mean anything. Here's exactly what protects
            your account, in plain terms.
          </p>
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── Account protection ───────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "56px 20px" }}>
        <FadeUp style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Account protection</h2>
        </FadeUp>

        <SecurityDetail
          title="Email verification"
          summary="Required before onboarding proceeds past account creation."
          detail="Every account starts by confirming a real, working email address. Nothing about onboarding — identity verification, wallet linking, trading — proceeds until that's done."
        />
        <SecurityDetail
          title="Identity verification (KYC)"
          summary="A real human review, not a checkbox."
          detail="You submit your legal name, a government ID, and a selfie. An actual reviewer checks it before certain features unlock — this isn't an automated rubber stamp. Submitted documents are encrypted at rest and never stored in the clear."
        />
        <SecurityDetail
          title="Two-factor authentication"
          summary="Standard TOTP, works with any authenticator app."
          detail="Enable 2FA in Settings with any standard authenticator app (Google Authenticator, Authy, 1Password, etc.) — no proprietary app required. Once enabled, it's a required second step at login, not an optional extra that quietly does nothing."
        />
        <SecurityDetail
          title="Known-device tracking"
          summary="New sign-ins from unrecognized devices are recorded and flagged."
          detail="Anchor Ledger keeps track of which devices have signed into your account before. A sign-in from a new device triggers an email alert to you — so a login you didn't make doesn't go unnoticed."
        />
        <SecurityDetail
          title="Explicit legal consent"
          summary="A real e-signature gate, not a pre-checked box."
          detail="Before certain account capabilities activate, you go through an explicit legal-agreement step that requires your own e-signature — it's a deliberate stop in onboarding, not a checkbox that's already ticked for you."
        />
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── Audit trail ───────────────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "56px 20px" }}>
        <FadeUp>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Every action, logged and yours to see</h2>
          <p style={{ fontSize: 13, color: colors.muted, lineHeight: 1.7, maxWidth: 560 }}>
            Every signal, proposal, execution, and settlement tied to your account is logged and
            timestamped — and it's scoped to you specifically, not just visible to anyone who asks.
            Once you're signed in, your full history is available under Audit Log in the app: nothing
            about what happened to your account is hidden from you, or handled off the record.
          </p>
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── Withdrawal handling ───────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "56px 20px" }}>
        <FadeUp>
          <Eyebrow>Withdrawals</Eyebrow>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>
            Withdrawals are manual by design — not an automation gap
          </h2>
          <p style={{ fontSize: 13, color: colors.muted, lineHeight: 1.7, maxWidth: 560 }}>
            You submit a withdrawal request, it's reviewed, and the payout is sent as a real on-chain
            transaction — which is verified before your request is ever marked complete. The private
            key that could move funds out of the deposit vault intentionally never touches any server.
            That's a structural choice: no code path exists that could automate an outbound payout,
            because the one thing that could do it was never put somewhere automation could reach it.
          </p>
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── API hygiene ───────────────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "56px 20px" }}>
        <FadeUp>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Ownership-scoped, rate-limited by default</h2>
          <p style={{ fontSize: 13, color: colors.muted, lineHeight: 1.7, maxWidth: 560 }}>
            Sensitive endpoints like identity-verification submission are rate-limited, and every
            record you can read or modify through the API is scoped to your own account — one user's
            requests never operate on another user's data.
          </p>
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* ── Closing CTA ───────────────────────────────────────────────── */}
      <div style={{ ...wrap, padding: "64px 20px", textAlign: "center" }}>
        <FadeUp>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
            Want to see how approval works on-chain?
          </h2>
          <Link to="/architecture" style={{
            display: "inline-block", fontSize: 13, color: colors.green,
            fontFamily: "'JetBrains Mono', monospace", textDecoration: "none", marginBottom: 28,
          }}>
            Read the architecture page →
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
