import { useState } from "react";
import { auth as authApi } from "../../api/endpoints";
import { colors } from "../../lib/tokens";

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState("");
  const [state, setState]     = useState("idle"); // idle | submitting | sent
  const [error, setError]     = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setState("submitting");
    try {
      await authApi.forgotPassword(email);
      // Always show the same confirmation, regardless of what the backend
      // actually found — the endpoint itself never leaks account existence.
      setState("sent");
    } catch (err) {
      setError(err.response?.data?.error?.message || "Something went wrong — try again in a moment.");
      setState("idle");
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: colors.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 28, height: 28,
            background: colors.green,
            clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
          }}/>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", color: colors.text }}>
              QuantEdge
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: colors.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Systematic Trading
            </div>
          </div>
        </div>

        {state === "sent" ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📬</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: colors.text, marginBottom: 12 }}>
              Check your email
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: colors.muted, lineHeight: 1.6, marginBottom: 20 }}>
              If an account exists for {email}, a password reset link is on its way. It expires in 1 hour.
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: colors.muted, lineHeight: 1.6, marginBottom: 20 }}>
            Enter your email and we'll send you a link to reset your password.
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 11, color: colors.muted, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              disabled={state === "submitting"}
              placeholder="you@example.com"
              style={{
                width: "100%", boxSizing: "border-box",
                background: colors.surface,
                border: `1px solid ${colors.border2}`,
                borderRadius: 4,
                padding: "10px 12px",
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                color: colors.text,
                outline: "none",
              }}
            />
          </div>

          {error && (
            <div style={{
              background: "#FF4D6D11",
              border: "1px solid #FF4D6D44",
              borderRadius: 4,
              padding: "10px 12px",
              marginBottom: 16,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              color: colors.red,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={state === "submitting" || !email}
            style={{
              width: "100%",
              background: state === "submitting" ? colors.surface2 : colors.green,
              color: state === "submitting" ? colors.muted : colors.bg,
              border: "none",
              borderRadius: 4,
              padding: "11px",
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              letterSpacing: "0.06em",
              cursor: state === "submitting" ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {state === "submitting" ? "Sending…" : "Send Reset Link"}
          </button>
        </form>
        )}

        <div style={{ marginTop: 24, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: colors.muted, textAlign: "center" }}>
          <a href="/login" style={{ color: colors.green, textDecoration: "none" }}>Back to sign in</a>
        </div>
      </div>
    </div>
  );
}
