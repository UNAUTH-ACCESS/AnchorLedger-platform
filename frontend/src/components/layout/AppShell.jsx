import { useState, useEffect } from "react";
import { NavLink, Link } from "react-router-dom";
import useAuthStore from "../../store/auth.store";
import NotificationCenter from "../notifications/NotificationCenter";
import useSystemStore from "../../store/system.store";
import { SystemStatus } from "../system/SystemStatus";
import { regime as regimeMeta, colors } from "../../lib/tokens";
import { fmt } from "../../lib/format";
import { InstallButton } from "../marketing/MarketingChrome";

const NAV = [
  { to: "/dashboard",  label: "Dashboard",  icon: "▦" },
  { to: "/signals",    label: "Signals",     icon: "⚡" },
  { to: "/proposals",  label: "Proposals",   icon: "◈" },
  { to: "/positions",  label: "Positions",   icon: "⊞" },
  { to: "/portfolio",  label: "Portfolio",   icon: "◉" },
  { to: "/audit",      label: "Audit Log",   icon: "≡" },
  { to: "/settings",   label: "Settings",    icon: "⚙" },
  { to: "/wallets",    label: "Wallets",     icon: "◎" },
  { to: "/withdrawals", label: "Withdrawals", icon: "↑" },
  { to: "/pnl",       label: "P&L",         icon: "◈" },
];

const ADMIN_NAV = [
  { to: "/admin/kyc",  label: "KYC Review",  icon: "☑" },
  { to: "/admin/ops",  label: "Operations",  icon: "⌁" },
];

function RegimeOrb({ regime }) {
  if (!regime) return (
    <div style={{ padding: "10px 16px" }}>
      <div style={{ fontSize: 10, color: colors.muted, fontFamily: "'JetBrains Mono', monospace" }}>
        Regime loading…
      </div>
    </div>
  );

  const meta = regimeMeta[regime.state] || regimeMeta.QUIET_BULLISH;
  // Pulse speed inversely proportional to confidence
  const pulseDuration = `${1 + (1 - regime.confidence) * 2}s`;

  return (
    <div style={{
      margin: "8px 12px",
      padding: "10px 12px",
      background: colors.surface2,
      border: `1px solid ${colors.border2}`,
      borderRadius: 6,
      display: "flex",
      alignItems: "center",
      gap: 8,
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: meta.color,
        flexShrink: 0,
        boxShadow: `0 0 0 0 ${meta.pulse}`,
        animation: `regimePulse ${pulseDuration} ease-in-out infinite`,
      }}/>
      <div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: meta.color,
        }}>
          {meta.label}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: colors.muted, marginTop: 1 }}>
          conf {fmt.num(regime.confidence, 3)}
        </div>
      </div>
    </div>
  );
}

function Sidebar({ onNav }) {
  const { user, activeWorkspace } = useAuthStore();
  const { regime, unreadCount } = useSystemStore();

  return (
    <aside style={{
      width: 220, minWidth: 220,
      background: colors.surface,
      borderRight: `1px solid ${colors.border}`,
      display: "flex", flexDirection: "column",
      height: "100%", overflow: "hidden",
    }}>
      {/* Logo — links out to the marketing homepage, same as the icon does
          everywhere else on the site (marketing header, browser favicon) */}
      <Link to="/home" style={{
        padding: "18px 20px 14px",
        borderBottom: `1px solid ${colors.border}`,
        display: "flex", alignItems: "center", gap: 10,
        textDecoration: "none", color: "inherit",
      }}>
        <div style={{
          width: 24, height: 24,
          background: colors.green,
          clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
          flexShrink: 0,
        }}/>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em" }}>
            Anchor Ledger
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: colors.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
            {activeWorkspace?.name || "—"}
          </div>
        </div>
      </Link>

      {/* Regime orb */}
      <RegimeOrb regime={regime}/>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "4px 0", overflowY: "auto" }}>
        {[...NAV, ...(user?.isPlatformAdmin ? ADMIN_NAV : [])].map(({ to, label, icon }) => (
          <NavLink key={to} to={to} onClick={onNav} style={({ isActive }) => ({
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 16px",
            color: isActive ? colors.green : colors.muted,
            textDecoration: "none",
            fontSize: 12, fontWeight: 500,
            borderLeft: `2px solid ${isActive ? colors.green : "transparent"}`,
            background: isActive ? colors.surface2 : "transparent",
            transition: "all 0.1s",
            position: "relative",
          })}>
            <span style={{ fontSize: 13 }}>{icon}</span>
            <span>{label}</span>
            {label === "Signals" && unreadCount > 0 && (
              <span style={{
                marginLeft: "auto",
                background: colors.green, color: colors.bg,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9, fontWeight: 700,
                padding: "1px 5px", borderRadius: 3,
              }}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div style={{
        padding: "12px 16px",
        borderTop: `1px solid ${colors.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: colors.violet,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
            color: "white", flexShrink: 0,
          }}>
            {user?.name?.slice(0, 2).toUpperCase() || "??"}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{user?.name}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: colors.green, letterSpacing: "0.06em" }}>
              {activeWorkspace?.role || "—"}
            </div>
          </div>
        </div>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: colors.muted,
          display: "flex", gap: 8,
        }}>
          <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>Terms</a>
          <span>·</span>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>Privacy</a>
        </div>
      </div>
    </aside>
  );
}

function BottomNav() {
  const SHORT_NAV = NAV.slice(0, 5).map(item =>
    item.to === "/signals" ? { to: "/settings", label: "Settings", icon: "⚙" } : item
  );
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0,
      background: colors.surface,
      borderTop: `1px solid ${colors.border}`,
      display: "flex",
      zIndex: 100,
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      {SHORT_NAV.map(({ to, label, icon }) => (
        <NavLink key={to} to={to} style={({ isActive }) => ({
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: "10px 4px",
          color: isActive ? colors.green : colors.muted,
          textDecoration: "none",
          fontSize: 9, fontWeight: 500,
          gap: 3,
          position: "relative",
        })}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function AppShell({ children }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // BottomNav only fits 5 shortcuts - Audit Log, Wallets, Withdrawals and
  // P&L have no other route in on mobile without this. Closes itself via
  // Sidebar's existing onNav prop (already there for exactly this) so
  // tapping a link doesn't leave the drawer open over the new page.
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: colors.bg }}>
      {!isMobile && <Sidebar />}

      {isMobile && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "#00000099",
            zIndex: 199,
          }}
        />
      )}
      {isMobile && (
        <div style={{
          position: "fixed", top: 0, bottom: 0, left: 0,
          zIndex: 200,
          transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.22s ease",
          boxShadow: drawerOpen ? "2px 0 16px #00000066" : "none",
        }}>
          <Sidebar onNav={() => setDrawerOpen(false)}/>
        </div>
      )}

      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        overflow: "hidden", minWidth: 0,
      }}>
        {/* Topbar */}
        <div style={{
          height: 48, minHeight: 48,
          background: colors.surface,
          borderBottom: `1px solid ${colors.border}`,
          display: "flex", alignItems: "center",
          padding: "0 16px", gap: 12,
        }}>
          {isMobile && (
            <>
              <button
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                style={{
                  background: "transparent", border: "none",
                  color: colors.text, fontSize: 18,
                  padding: "4px 6px", margin: "-4px -6px 0 -8px",
                  cursor: "pointer", lineHeight: 1,
                }}
              >
                ☰
              </button>
              <Link to="/home" style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                color: colors.green, textDecoration: "none",
              }}>
                AL
              </Link>
            </>
          )}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
            <InstallButton compact={isMobile}/>
            <NotificationCenter/>
            <Clock/>
            <SystemStatus/>
          </div>
        </div>

        {/* Content */}
        <main style={{
          flex: 1, overflowY: "auto",
          padding: isMobile ? "16px" : "20px 24px",
          paddingBottom: isMobile ? "80px" : "20px",
        }}>
          {children}
        </main>
      </div>

      {isMobile && <BottomNav/>}
    </div>
  );
}

function Clock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toUTCString().slice(17, 25) + " UTC");
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 10, color: colors.muted,
    }}>
      {time}
    </span>
  );
}
