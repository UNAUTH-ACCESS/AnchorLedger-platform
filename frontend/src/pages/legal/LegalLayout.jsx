import { colors } from "../../lib/tokens";

// Renders [BRACKETED — placeholder] text visibly distinct from finalized
// content, per the founder's instruction: these are real open items
// pending counsel/founder decisions, not implementation gaps to paper
// over. Auto-detected rather than hand-marked per paragraph, so the
// source text below can stay a faithful copy of the provided draft.
const PLACEHOLDER_RE = /(\[[^\]]+\])/g;

export function TextWithPlaceholders({ children }) {
  const parts = String(children).split(PLACEHOLDER_RE);
  return parts.map((part, i) =>
    PLACEHOLDER_RE.test(part) ? (
      <span key={i} style={{
        background: colors.orange + "22",
        color: colors.orange,
        border: `1px solid ${colors.orange}55`,
        borderRadius: 3,
        padding: "0 4px",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "0.92em",
      }}>
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export function Section({ n, title, children }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700,
        color: colors.text, marginBottom: 10, letterSpacing: "0.02em",
      }}>
        {n}. {title}
      </h2>
      <div style={{ fontSize: 13, color: colors.muted, lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}

export function P({ children }) {
  return <p style={{ margin: "0 0 12px" }}><TextWithPlaceholders>{children}</TextWithPlaceholders></p>;
}

export function UL({ items }) {
  return (
    <ul style={{ margin: "0 0 12px", paddingLeft: 20 }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: 6 }}><TextWithPlaceholders>{item}</TextWithPlaceholders></li>
      ))}
    </ul>
  );
}

// Visually distinct from a normal <P> — for material factual disclosures
// that must not read as just another bullet in a long list (e.g. current
// simulated-trading status). Not a placeholder — do not wrap in brackets.
// Renders children directly (not through TextWithPlaceholders, which
// String()-coerces its input) so callers can nest elements like <strong>.
export function Callout({ children }) {
  return (
    <div style={{
      margin: "0 0 16px", padding: "12px 14px", borderRadius: 6,
      background: colors.orange + "14", border: `1px solid ${colors.orange}55`,
      fontSize: 13, lineHeight: 1.75, color: colors.text,
    }}>
      {children}
    </div>
  );
}

export function AllCaps({ children }) {
  return (
    <p style={{
      margin: "0 0 12px", fontSize: 12, letterSpacing: "0.01em",
      textTransform: "uppercase", color: colors.text,
    }}>
      <TextWithPlaceholders>{children}</TextWithPlaceholders>
    </p>
  );
}

export function LegalLayout({ title, effectiveDate, operator, children }) {
  return (
    <div style={{ minHeight: "100vh", background: colors.bg, fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>
        <a href="/" style={{
          display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 40, textDecoration: "none",
        }}>
          <div style={{
            width: 24, height: 24, background: colors.green,
            clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
          }}/>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700,
            letterSpacing: "0.08em", color: colors.text,
          }}>
            Anchor Ledger
          </span>
        </a>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: colors.text, marginBottom: 12 }}>{title}</h1>

        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: colors.muted,
          marginBottom: 32, lineHeight: 1.8,
        }}>
          <div>Effective Date: <TextWithPlaceholders>{effectiveDate}</TextWithPlaceholders></div>
          <div>Operator: <TextWithPlaceholders>{operator}</TextWithPlaceholders></div>
        </div>

        {children}

        <div style={{
          marginTop: 40, paddingTop: 20, borderTop: `1px solid ${colors.border}`,
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: colors.muted,
        }}>
          <a href="/" style={{ color: colors.green, textDecoration: "none" }}>← Back to Anchor Ledger</a>
        </div>
      </div>
    </div>
  );
}
