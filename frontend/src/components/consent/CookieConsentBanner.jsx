import { useEffect, useState } from "react";
import { colors } from "../../lib/tokens";
import {
  getConsent, setConsent, hasConsentDecision, onConsentReviewRequested,
} from "../../lib/consent";

const checkbox = { width: 16, height: 16, accentColor: colors.green, cursor: "pointer" };
const label = { display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: colors.text, cursor: "pointer" };

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(!hasConsentDecision());
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [chat, setChat] = useState(true);

  useEffect(() => onConsentReviewRequested(() => {
    const existing = getConsent();
    setAnalytics(existing ? existing.analytics : true);
    setChat(existing ? existing.chat : true);
    setCustomizing(false);
    setVisible(true);
  }), []);

  if (!visible) return null;

  const decide = (prefs) => {
    setConsent(prefs);
    setVisible(false);
    setCustomizing(false);
  };

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 500,
      background: colors.surface, borderTop: `1px solid ${colors.border2}`,
      padding: "18px 20px", boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p style={{ fontSize: 13, color: colors.muted, lineHeight: 1.6, margin: "0 0 14px" }}>
          We use analytics (PostHog) and live chat (Smartsupp) — both optional, off by default
          until you choose. Necessary site function doesn't require your consent. See our{" "}
          <a href="/privacy" style={{ color: colors.green }}>Privacy Policy</a> for exactly what each does.
        </p>

        {customizing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            <label style={label}>
              <input type="checkbox" style={checkbox} checked={analytics} onChange={e => setAnalytics(e.target.checked)} />
              Analytics (PostHog) — which pages get visited, so we know what's working
            </label>
            <label style={label}>
              <input type="checkbox" style={checkbox} checked={chat} onChange={e => setChat(e.target.checked)} />
              Live chat (Smartsupp) — loads chat support; shares your email/account ID if you use it while logged in
            </label>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {customizing ? (
            <button
              onClick={() => decide({ analytics, chat })}
              style={{
                background: colors.green, color: colors.bg, border: "none", borderRadius: 4,
                padding: "10px 18px", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700, cursor: "pointer",
              }}
            >
              Save Preferences
            </button>
          ) : (
            <>
              {/* Equal size/weight for Accept and Reject, deliberately - a
                  prominent "Accept" next to a hidden/de-emphasized "Reject"
                  is a real, specifically-enforced GDPR consent violation,
                  not just a style nitpick. */}
              <button
                onClick={() => decide({ analytics: true, chat: true })}
                style={{
                  background: colors.green, color: colors.bg, border: "none", borderRadius: 4,
                  padding: "10px 18px", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700, cursor: "pointer",
                }}
              >
                Accept All
              </button>
              <button
                onClick={() => decide({ analytics: false, chat: false })}
                style={{
                  background: "transparent", color: colors.text, border: `1px solid ${colors.border2}`,
                  borderRadius: 4, padding: "10px 18px", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 700, cursor: "pointer",
                }}
              >
                Reject Non-Essential
              </button>
              <button
                onClick={() => setCustomizing(true)}
                style={{
                  background: "transparent", color: colors.muted, border: "none",
                  padding: "10px 4px", fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
                  cursor: "pointer", textDecoration: "underline",
                }}
              >
                Customize
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
