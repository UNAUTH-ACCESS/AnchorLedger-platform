import { Link, useParams } from "react-router-dom";
import { colors } from "../../lib/tokens";
import { FadeUp, wrap, Eyebrow, MarketingHeader, MarketingFooter } from "../../components/marketing/MarketingChrome";
import { posts } from "../../content/posts";

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function Block({ block }) {
  if (block.type === "h2") {
    return <h2 style={{ fontSize: 20, fontWeight: 700, margin: "32px 0 12px" }}>{block.text}</h2>;
  }
  if (block.type === "ul") {
    return (
      <ul style={{ margin: "0 0 16px", paddingLeft: 20 }}>
        {block.items.map((item, i) => (
          <li key={i} style={{ fontSize: 15, color: colors.muted, lineHeight: 1.7, marginBottom: 6 }}>{item}</li>
        ))}
      </ul>
    );
  }
  return <p style={{ fontSize: 15, color: colors.muted, lineHeight: 1.8, margin: "0 0 16px" }}>{block.text}</p>;
}

export default function BlogPost() {
  const { slug } = useParams();
  const post = posts.find(p => p.slug === slug);

  if (!post) {
    return (
      <div style={{ background: colors.bg, color: colors.text, fontFamily: "'Inter', sans-serif", minHeight: "100vh" }}>
        <MarketingHeader current="/blog" />
        <div style={{ ...wrap, padding: "64px 20px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Post not found</h1>
          <Link to="/blog" style={{ color: colors.green, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, textDecoration: "none" }}>
            ← Back to blog
          </Link>
        </div>
        <MarketingFooter />
      </div>
    );
  }

  return (
    <div style={{ background: colors.bg, color: colors.text, fontFamily: "'Inter', sans-serif", minHeight: "100vh" }}>
      <MarketingHeader current="/blog" />

      <div style={{ ...wrap, padding: "64px 20px 40px" }}>
        <FadeUp>
          <Eyebrow>{fmtDate(post.date)}</Eyebrow>
          <h1 style={{ fontSize: "clamp(26px, 5.5vw, 36px)", fontWeight: 700, lineHeight: 1.3 }}>
            {post.title}
          </h1>
        </FadeUp>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      <div style={{ ...wrap, padding: "40px 20px" }}>
        <FadeUp>
          {post.blocks.map((block, i) => <Block key={i} block={block} />)}
        </FadeUp>
        <div style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid ${colors.border}` }}>
          <Link to="/blog" style={{ color: colors.green, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, textDecoration: "none" }}>
            ← Back to blog
          </Link>
        </div>
      </div>

      <MarketingFooter />
    </div>
  );
}
