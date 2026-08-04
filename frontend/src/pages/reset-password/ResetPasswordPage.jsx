import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { auth as authApi } from "../../api/endpoints";
import { colors } from "../../lib/tokens";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [state, setState]             = useState("idle"); // idle | submitting | success
  const [error, setError]             = useState(null);

  const wrapStyle = {
    minHeight: "100vh", background: colors.bg,
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 24, fontFamily: "'Inter', sans-serif",
  };
  const cardStyle = { width: "100%", maxWidth: 380, textAlign: "center" };
  const titleStyle = { fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: colors.text, marginBottom: 12 };
  const bodyStyle = { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: colors.muted, lineHeight: 1.6, marginBottom: 20 };
  const buttonStyle = (disabled) => ({
    width: "100%",
    background: disabled ? colors.surface2 : colors.green,
    color: disabled ? colors.muted : colors.bg,
    border: "none", borderRadius: 4, padding: "11px",
    fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700, letterSpacing: "0.06em",
    cursor: disabled ? "not-allowed" : "pointer",
  });

  if (!token) {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={titleStyle}>Invalid reset link</div>
          <div style={bodyStyle}>This link is missing its token. Request a new one from the login page.</div>
          <a href="/forgot-password" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: colors.green, textDecoration: "none" }}>
            Request a new link →
          </a>
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
          <div style={titleStyle}>Password updated</div>
          <div style={bodyStyle}>Your password has been changed. Sign in with your new password.</div>
          <button style={buttonStyle(false)} onClick={() => navigate("/login", { replace: true })}>
            Go to sign in →
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setState("submitting");
    try {
      await authApi.resetPassword(token, newPassword);
      setState("success");
    } catch (err) {
      setError(err.response?.data?.error?.message || "Couldn't reset your password — the link may be invalid or expired.");
      setState("idle");
    }
  };

  return (
    <div style={wrapStyle}>
      <div style={{ ...cardStyle, textAlign: "left" }}>
        <div style={{ ...titleStyle, textAlign: "center" }}>Set a new password</div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20, marginTop: 20 }}>
            <label style={{ display: "block", fontSize: 11, color: colors.muted, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoFocus
              minLength={8}
              disabled={state === "submitting"}
              placeholder="••••••••"
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
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: colors.muted, marginTop: 6 }}>
              At least 8 characters.
            </div>
          </div>

          {error && (
            <div style={{
              background: "#FF4D6D11", border: "1px solid #FF4D6D44", borderRadius: 4,
              padding: "10px 12px", marginBottom: 16,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: colors.red,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={state === "submitting" || newPassword.length < 8}
            style={buttonStyle(state === "submitting" || newPassword.length < 8)}
          >
            {state === "submitting" ? "Updating…" : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
