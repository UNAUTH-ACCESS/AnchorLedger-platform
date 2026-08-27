import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { colors } from "../../lib/tokens";
import { marketing } from "../../api/endpoints";
import { onInstallAvailabilityChange, promptInstall, isRunningInstalled } from "../../lib/pwaInstall";
import { requestConsentReview } from "../../lib/consent";

// Lightweight scroll fade-up, no animation library — matches "subtle
// scroll-based fade-up only, no other animation" from the design brief.
// Shared by every public marketing page (Home, Architecture, Security) so
// they read as one site, not three different ones stitched together.
export function useFadeUp() {
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

export function FadeUp({ children, style }) {
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

export const wrap = { maxWidth: 720, margin: "0 auto", padding: "0 20px" };

export function Eyebrow({ children }) {
  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: colors.green,
      letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

const NAV_LINKS = [
  ["Architecture", "/architecture"],
  ["Security", "/security"],
  ["Blog", "/blog"],
];

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Chrome/Android gets a real native install prompt on our own timing.
// iOS Safari never fires beforeinstallprompt at all - there is no
// programmatic install trigger there, only manual Share -> Add to Home
// Screen, so this shows instructions instead of a button that would
// silently do nothing.
// compact: true drops the text label to just the icon - the AppShell
// mobile topbar (hamburger + logo + notification/clock/status) is already
// tight, per the crowding fix in NotificationCenter/AppShell earlier.
export function InstallButton({ compact = false }) {
  const [available, setAvailable] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    if (isRunningInstalled()) return;
    return onInstallAvailabilityChange(setAvailable);
  }, []);

  if (isRunningInstalled()) return null;
  if (!available && !ios) return null;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => ios ? setShowIOSHint(h => !h) : promptInstall()}
        aria-label="Install App"
        style={{
          background: "transparent", border: `1px solid ${colors.border2}`,
          borderRadius: 4, padding: compact ? "5px 7px" : "5px 10px", cursor: "pointer",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
          color: colors.muted, display: "flex", alignItems: "center", gap: 5,
        }}
      >
        {compact ? "⤓" : "⤓ Install App"}
      </button>
      {showIOSHint && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, width: 220,
          background: colors.surface, border: `1px solid ${colors.border2}`,
          borderRadius: 6, padding: "10px 12px", zIndex: 300,
          fontSize: 11, color: colors.muted, lineHeight: 1.6,
        }}>
          Tap the Share icon in Safari, then "Add to Home Screen."
        </div>
      )}
    </div>
  );
}

export function MarketingHeader({ current }) {
  return (
    <div style={{ padding: "20px 20px 0" }}>
      <div style={{ ...wrap, padding: 0, display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
        {/* /home, not / — / redirects an authenticated session to /dashboard,
            which would make the logo unusable as a "back to homepage" link
            for anyone logged in. /home always renders the homepage. */}
        <Link to="/home" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <div style={{ width: 20, height: 20, background: colors.green, clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)" }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: colors.text }}>
            Anchor Ledger
          </span>
        </Link>
        <div style={{ display: "flex", gap: 20, marginLeft: "auto", alignItems: "center" }}>
          {NAV_LINKS.map(([label, href]) => (
            <Link
              key={href}
              to={href}
              style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                textDecoration: "none",
                color: current === href ? colors.green : colors.muted,
              }}
            >
              {label}
            </Link>
          ))}
          <InstallButton />
        </div>
      </div>
    </div>
  );
}

// Separate from the "Get Early Access" CTA elsewhere on these pages, which
// goes straight to /signup - that's a real, open account creation flow, not
// a waitlist. This is just an honest "email me when something ships" capture
// distinct from /subscribe's stale "Private Beta / waitlist" copy, which
// doesn't reflect that signup is already open.
function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | submitting | done | error

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setState("submitting");
    try {
      await marketing.subscribe(email, null, "footer");
      setState("done");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div style={{ fontSize: 11, color: colors.green, fontFamily: "'JetBrains Mono', monospace" }}>
        ✓ You're on the list — we'll email you when something ships.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: colors.muted, fontFamily: "'JetBrains Mono', monospace" }}>
        Get notified when we ship:
      </span>
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@example.com"
        required
        disabled={state === "submitting"}
        style={{
          background: colors.surface2, border: `1px solid ${colors.border2}`,
          borderRadius: 4, padding: "6px 10px", fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace", color: colors.text, outline: "none",
          width: 180,
        }}
      />
      <button
        type="submit"
        disabled={state === "submitting" || !email}
        style={{
          background: "transparent", border: `1px solid ${colors.green}`,
          color: colors.green, borderRadius: 4, padding: "6px 12px",
          fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
          cursor: state === "submitting" ? "not-allowed" : "pointer",
        }}
      >
        {state === "submitting" ? "…" : "Subscribe"}
      </button>
      {state === "error" && (
        <span style={{ fontSize: 10, color: colors.red, fontFamily: "'JetBrains Mono', monospace" }}>
          Something went wrong — try again.
        </span>
      )}
    </form>
  );
}

export function MarketingFooter() {
  return (
    <div style={{ borderTop: `1px solid ${colors.border}` }}>
      <div style={{ ...wrap, padding: "28px 20px 0" }}>
        <NewsletterSignup />
      </div>
      <div style={{ ...wrap, padding: "20px 20px 28px", display: "flex", gap: 20, flexWrap: "wrap" }}>
        {[
          ["Architecture", "/architecture"],
          ["Security", "/security"],
          ["Blog", "/blog"],
          ["Terms of Service", "/terms"],
          ["Privacy Policy", "/privacy"],
          ["Contact", "mailto:support@anchorledger.space"],
        ].map(([label, href]) => (
          <a
            key={label}
            href={href}
            style={{ fontSize: 11, color: colors.muted, textDecoration: "none", fontFamily: "'JetBrains Mono', monospace" }}
          >
            {label}
          </a>
        ))}
        <button
          onClick={requestConsentReview}
          style={{
            fontSize: 11, color: colors.muted, fontFamily: "'JetBrains Mono', monospace",
            background: "transparent", border: "none", padding: 0, cursor: "pointer",
          }}
        >
          Cookie Settings
        </button>
      </div>
    </div>
  );
}
