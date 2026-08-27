import { Link } from "react-router-dom";
import { colors } from "../../lib/tokens";
import { FadeUp, wrap, Eyebrow, MarketingHeader, MarketingFooter } from "../../components/marketing/MarketingChrome";
import { posts } from "../../content/posts";

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default function BlogIndex() {
  const sorted = [...posts].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div style={{ background: colors.bg, color: colors.text, fontFamily: "'Inter', sans-serif", minHeight: "100vh" }}>
      <MarketingHeader current="/blog" />

      <div style={{ ...wrap, padding: "64px 20px 56px" }}>
        <FadeUp>
          <Eyebrow>Blog</Eyebrow>
          <h1 style={{ fontSize: "clamp(26px, 5.5vw, 36px)", fontWeight: 700, lineHeight: 1.25 }}>
            Notes on how Anchor Ledger actually works
          </h1>
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      <div style={{ ...wrap, padding: "40px 20px" }}>
        {sorted.map(post => (
          <FadeUp key={post.slug} style={{ marginBottom: 36 }}>
            <Link to={`/blog/${post.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: colors.muted, marginBottom: 8 }}>
                {fmtDate(post.date)}
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{post.title}</h2>
              <p style={{ fontSize: 14, color: colors.muted, lineHeight: 1.7, margin: 0 }}>{post.description}</p>
              <span style={{ display: "inline-block", marginTop: 10, fontSize: 12, color: colors.green, fontFamily: "'JetBrains Mono', monospace" }}>
                Read more →
              </span>
            </Link>
          </FadeUp>
        ))}
      </div>

      <MarketingFooter />
    </div>
  );
}
