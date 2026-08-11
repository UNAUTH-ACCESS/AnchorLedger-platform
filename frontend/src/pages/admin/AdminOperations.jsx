import { useState, Fragment } from "react";
import { Navigate } from "react-router-dom";
import { useApi } from "../../hooks/useApi";
import { admin as adminApi } from "../../api/endpoints";
import { ErrorState, LoadingState, EmptyState } from "../../components/system/SystemStatus";
import { colors } from "../../lib/tokens";
import { fmt } from "../../lib/format";
import useAuthStore from "../../store/auth.store";

const TABS = [
  { id: "health",        label: "System Health" },
  { id: "clients",       label: "Clients" },
  { id: "settlements",   label: "Stuck Settlements" },
  { id: "notifications", label: "Delivery Failures" },
  { id: "wallets",       label: "Wallets" },
  { id: "audit",         label: "Audit Log" },
];

const cardStyle = {
  background: colors.surface, border: `1px solid ${colors.border}`,
  borderRadius: 6, padding: 16,
};
const th = {
  textAlign: "left", padding: "8px 10px", fontSize: 9, color: colors.muted,
  letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `1px solid ${colors.border}`,
};
const td = {
  padding: "8px 10px", fontSize: 11, borderBottom: `1px solid ${colors.border}`,
  fontFamily: "'JetBrains Mono', monospace",
};
const refreshBtn = {
  marginLeft: "auto", background: "transparent", border: `1px solid ${colors.border2}`,
  borderRadius: 4, padding: "5px 10px", fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
  color: colors.muted, cursor: "pointer",
};

function SectionHeader({ title, count, onRefresh }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600 }}>{title}</h2>
      {count != null && (
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: colors.muted }}>
          {count}
        </span>
      )}
      <button onClick={onRefresh} style={refreshBtn}>Refresh</button>
    </div>
  );
}

// ── System Health ─────────────────────────────────────────────────────────────

function MemoryBar({ label, usedMb, totalMb }) {
  const pct = totalMb ? Math.round((usedMb / totalMb) * 100) : 0;
  const color = pct >= 90 ? colors.red : pct >= 70 ? colors.orange : colors.green;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: colors.muted, marginBottom: 4 }}>
        <span>{label}</span>
        <span>{usedMb}MB / {totalMb}MB ({pct}%)</span>
      </div>
      <div style={{ height: 6, background: colors.surface2, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

function RestartDelegateButton({ onRestarted }) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleRestart = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await adminApi.restartDelegate();
      setResult("Restart issued — refresh in a few seconds to confirm it came back online.");
      setConfirming(false);
      onRestarted?.();
    } catch (err) {
      setError(err.response?.data?.error?.message || "Restart failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return <div style={{ fontSize: 10, color: colors.green }}>{result}</div>;
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        style={{
          background: "transparent", color: colors.orange, border: `1px solid ${colors.orange}`,
          borderRadius: 4, padding: "6px 12px", fontSize: 10, fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace", cursor: "pointer",
        }}
      >
        Restart delegate-server
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 10, color: colors.orange }}>
        This restarts the live delegate server process. Any in-flight delegate call will fail. Confirm?
      </div>
      {error && <div style={{ fontSize: 10, color: colors.red }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          disabled={submitting}
          onClick={handleRestart}
          style={{
            background: colors.red, color: colors.bg, border: "none", borderRadius: 4,
            padding: "6px 12px", fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
            cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Restarting…" : "Confirm restart"}
        </button>
        <button
          disabled={submitting}
          onClick={() => setConfirming(false)}
          style={{
            background: "transparent", color: colors.muted, border: `1px solid ${colors.border2}`,
            borderRadius: 4, padding: "6px 12px", fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function SystemHealthSection() {
  const { data, loading, error, refetch } = useApi(() => adminApi.systemHealth(), []);

  if (loading) return <div style={{ padding: 24 }}><LoadingState rows={4}/></div>;
  if (error) return <ErrorState error={error} onRetry={refetch}/>;
  if (!data) return null;

  const { pm2, pm2Error, memory, memoryError, containers, containersError, ts } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionHeader title="System Health" onRefresh={refetch} />
      <div style={{ fontSize: 9, color: colors.muted, marginTop: -8 }}>As of {fmt.ts(ts)}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 10 }}>delegate-server (PM2)</div>
          {pm2Error && <div style={{ fontSize: 10, color: colors.red, marginBottom: 8 }}>{pm2Error}</div>}
          {pm2?.map((p) => (
            <div key={p.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", borderBottom: `1px solid ${colors.border}` }}>
              <span>{p.name}</span>
              <span style={{ color: p.status === "online" ? colors.green : colors.red, fontFamily: "'JetBrains Mono', monospace" }}>
                {p.status} {p.restarts != null ? `· ${p.restarts} restarts` : ""} {p.memoryMb != null ? `· ${p.memoryMb}MB` : ""}
              </span>
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <RestartDelegateButton onRestarted={refetch} />
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 10 }}>Host memory</div>
          {memoryError && <div style={{ fontSize: 10, color: colors.red }}>{memoryError}</div>}
          {memory && (
            <>
              <MemoryBar label="RAM" usedMb={memory.memUsedMb} totalMb={memory.memTotalMb} />
              <MemoryBar label="Swap" usedMb={memory.swapUsedMb} totalMb={memory.swapTotalMb} />
              <div style={{ fontSize: 9, color: colors.muted, marginTop: 6 }}>
                Available: {memory.memAvailableMb}MB
              </div>
            </>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 10 }}>Containers</div>
        {containersError && <div style={{ fontSize: 10, color: colors.red }}>{containersError}</div>}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>Name</th><th style={th}>Status</th><th style={th}>Image</th></tr></thead>
          <tbody>
            {containers?.map((c) => (
              <tr key={c.name}>
                <td style={td}>{c.name}</td>
                <td style={{ ...td, color: c.status?.startsWith("Up") ? colors.green : colors.red }}>{c.status}</td>
                <td style={td}>{c.image}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Stuck Settlements ────────────────────────────────────────────────────────

function StuckSettlementsSection() {
  const { data, loading, error, refetch } = useApi(() => adminApi.stuckSettlements(), []);
  const positions = data?.positions || [];

  if (loading) return <div style={{ padding: 24 }}><LoadingState rows={4}/></div>;
  if (error) return <ErrorState error={error} onRetry={refetch}/>;

  return (
    <div>
      <SectionHeader title="Stuck Settlements" count={positions.length} onRefresh={refetch} />
      {positions.length === 0 && <EmptyState message="No stuck or failed settlements"/>}
      {positions.length > 0 && (
        <div style={{ ...cardStyle, padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Workspace</th><th style={th}>Asset</th><th style={th}>Status</th>
                <th style={th}>Attempts</th><th style={th}>Last Attempt</th><th style={th}>Error</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id}>
                  <td style={td}>{p.portfolio?.workspace?.name || "—"}</td>
                  <td style={td}>{p.asset?.symbol || "—"} · {fmt.chain(p.chain?.type)}</td>
                  <td style={{ ...td, color: p.settlementStatus === "SETTLEMENT_FAILED" ? colors.red : colors.orange }}>
                    {p.settlementStatus}
                  </td>
                  <td style={td}>{p.settlementAttempts}</td>
                  <td style={td}>{fmt.ago(p.lastSettlementAt)}</td>
                  <td style={{ ...td, color: colors.red, maxWidth: 280, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={p.settlementError}>
                    {p.settlementError || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Notification Delivery Failures ──────────────────────────────────────────

function NotificationFailuresSection() {
  const [channel, setChannel] = useState("");
  const { data, loading, error, refetch } = useApi(
    () => adminApi.deliveryFailures(channel ? { channel } : {}),
    [channel]
  );
  const deliveries = data?.deliveries || [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600 }}>Notification Delivery Failures</h2>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: colors.muted }}>{deliveries.length}</span>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          style={{
            background: colors.surface2, border: `1px solid ${colors.border2}`, borderRadius: 4,
            padding: "4px 8px", fontSize: 10, color: colors.text, fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <option value="">All channels</option>
          <option value="EMAIL">EMAIL</option>
          <option value="WEBPUSH">WEBPUSH</option>
          <option value="INAPP">INAPP</option>
          <option value="WEBSOCKET">WEBSOCKET</option>
        </select>
        <button onClick={refetch} style={refreshBtn}>Refresh</button>
      </div>

      {loading && <div style={{ padding: 24 }}><LoadingState rows={4}/></div>}
      {error && <ErrorState error={error} onRetry={refetch}/>}
      {!loading && deliveries.length === 0 && <EmptyState message="No delivery failures"/>}
      {!loading && deliveries.length > 0 && (
        <div style={{ ...cardStyle, padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Channel</th><th style={th}>User</th><th style={th}>Type</th>
                <th style={th}>Attempts</th><th style={th}>Last Error</th><th style={th}>When</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <td style={{ ...td, color: colors.violet }}>{d.channel}</td>
                  <td style={td}>{d.notification?.user?.email || "—"}</td>
                  <td style={td}>{d.notification?.type || "—"}</td>
                  <td style={td}>{d.attempts}</td>
                  <td style={{ ...td, color: colors.red, maxWidth: 320, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={d.lastError}>
                    {d.lastError || "—"}
                  </td>
                  <td style={td}>{fmt.ago(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Wallets Overview ─────────────────────────────────────────────────────────

function WalletsSection() {
  const { data, loading, error, refetch } = useApi(() => adminApi.allWallets(), []);
  const wallets = data?.wallets || [];

  return (
    <div>
      <SectionHeader title="Wallets" count={wallets.length} onRefresh={refetch} />
      {loading && <div style={{ padding: 24 }}><LoadingState rows={4}/></div>}
      {error && <ErrorState error={error} onRetry={refetch}/>}
      {!loading && wallets.length === 0 && <EmptyState message="No wallets"/>}
      {!loading && wallets.length > 0 && (
        <div style={{ ...cardStyle, padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Workspace</th><th style={th}>Label</th><th style={th}>Address</th>
                <th style={th}>Chain</th><th style={th}>Status</th><th style={th}>Delegate</th>
                <th style={th}>Allowance</th><th style={th}>Last Checked</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => (
                <tr key={w.id}>
                  <td style={td}>{w.workspace?.name || "—"}</td>
                  <td style={td}>{w.label}</td>
                  <td style={td}>{fmt.addr(w.address)}</td>
                  <td style={td}>{w.delegateChain || fmt.chain(w.chain?.type)}</td>
                  <td style={{ ...td, color: w.status === "CONNECTED" ? colors.green : colors.muted }}>{w.status}</td>
                  <td style={{ ...td, color: w.delegateApproved ? colors.green : colors.red }}>
                    {w.delegateApproved ? "Approved" : "Not approved"}
                  </td>
                  <td style={td}>{w.remainingAllowance ?? "—"}</td>
                  <td style={td}>{fmt.ago(w.lastCheckedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Audit Log ────────────────────────────────────────────────────────────────

function AuditLogSection() {
  const [source, setSource] = useState("workspace"); // "workspace" | "platform"
  const [entity, setEntity] = useState("");

  const { data, loading, error, refetch } = useApi(
    () => source === "workspace"
      ? adminApi.auditEvents(entity ? { entity } : {})
      : adminApi.platformAuditEvents(),
    [source, entity]
  );
  const events = data?.events || [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <h2 style={{ fontSize: 13, fontWeight: 600 }}>Audit Log</h2>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: colors.muted }}>{events.length}</span>

        <div style={{ display: "flex", gap: 4, marginLeft: 12 }}>
          {["workspace", "platform"].map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              style={{
                background: source === s ? colors.surface2 : "transparent",
                border: `1px solid ${colors.border2}`, borderRadius: 4, padding: "4px 10px",
                fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                color: source === s ? colors.text : colors.muted, cursor: "pointer",
              }}
            >
              {s === "workspace" ? "Workspace events" : "Admin panel actions"}
            </button>
          ))}
        </div>

        {source === "workspace" && (
          <input
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            placeholder="Filter by entity type (e.g. Position, Wallet)"
            style={{
              background: colors.surface2, border: `1px solid ${colors.border2}`, borderRadius: 4,
              padding: "4px 8px", fontSize: 10, color: colors.text, fontFamily: "'JetBrains Mono', monospace",
              width: 220,
            }}
          />
        )}
        <button onClick={refetch} style={refreshBtn}>Refresh</button>
      </div>

      {loading && <div style={{ padding: 24 }}><LoadingState rows={4}/></div>}
      {error && <ErrorState error={error} onRetry={refetch}/>}
      {!loading && events.length === 0 && <EmptyState message="No audit events"/>}
      {!loading && events.length > 0 && source === "workspace" && (
        <div style={{ ...cardStyle, padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>When</th><th style={th}>Workspace</th><th style={th}>Actor</th>
                <th style={th}>Action</th><th style={th}>Entity</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td style={td}>{fmt.ts(e.ts)}</td>
                  <td style={td}>{e.workspace?.name || "—"}</td>
                  <td style={td}>{e.actor?.email || "—"}</td>
                  <td style={{ ...td, color: colors.violet }}>{e.action}</td>
                  <td style={td}>{e.entityType} · {e.entityId?.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && events.length > 0 && source === "platform" && (
        <div style={{ ...cardStyle, padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr><th style={th}>When</th><th style={th}>Actor</th><th style={th}>Action</th><th style={th}>Target Workspace</th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td style={td}>{fmt.ts(e.ts)}</td>
                  <td style={td}>{e.actorUserId?.slice(0, 8)}</td>
                  <td style={{ ...td, color: colors.orange }}>{e.action}</td>
                  <td style={td}>{e.targetWorkspace || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Clients ──────────────────────────────────────────────────────────────────

const TIER_META = {
  red:    { color: colors.red,    label: "Needs attention" },
  yellow: { color: colors.orange, label: "Delivery issues" },
  green:  { color: colors.green,  label: "No active risk signals" },
};

function TierBadge({ tier }) {
  const meta = TIER_META[tier];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 9, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em",
      color: meta.color, textTransform: "uppercase",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, display: "inline-block" }} />
      {meta.label}
    </span>
  );
}

function FlagPills({ flags }) {
  const active = Object.entries(flags).filter(([, v]) => v);
  if (active.length === 0) return <span style={{ color: colors.muted, fontSize: 10 }}>—</span>;
  const labels = { riskEvents: "Risk events", stuckSettlement: "Stuck settlement", complianceGap: "Compliance gap", deliveryFailures: "Delivery failures" };
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {active.map(([k]) => (
        <span key={k} style={{
          fontSize: 9, padding: "2px 6px", borderRadius: 3,
          background: colors.red + "22", color: colors.red,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {labels[k]}
        </span>
      ))}
    </div>
  );
}

function ClientDetail({ client }) {
  return (
    <tr>
      <td colSpan={9} style={{ ...td, background: colors.surface2, borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, padding: "8px 4px" }}>
          <div>
            <div style={{ fontSize: 9, color: colors.muted, textTransform: "uppercase", marginBottom: 4 }}>Account</div>
            <div>Owner: {client.owner?.email}</div>
            <div>Email verified: {client.owner?.emailVerified ? "Yes" : "No"}</div>
            <div>2FA enabled: {client.owner?.twoFactorEnabled ? "Yes" : "No"}</div>
            <div>Signed up: {fmt.ts(client.owner?.createdAt)}</div>
            <div>E-signature: {client.eSignature.completed ? `Completed ${fmt.ts(client.eSignature.agreedAt)}` : "Not completed"}</div>
            <div>Last active: {client.lastActiveAt ? fmt.ago(client.lastActiveAt) : "No login activity tracked"}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: colors.muted, textTransform: "uppercase", marginBottom: 4 }}>Funding & Wallets</div>
            <div>Deposited: {client.deposits.hasDeposited ? fmt.usd(client.deposits.totalDeposited) : "No deposits"}</div>
            {client.wallets.length === 0 && <div style={{ color: colors.muted }}>No wallets linked</div>}
            {client.wallets.map((w, i) => (
              <div key={i}>{fmt.chain(w.chain)}: {w.delegateApproved ? <span style={{ color: colors.green }}>Delegate approved</span> : <span style={{ color: colors.muted }}>Not approved</span>}</div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 9, color: colors.muted, textTransform: "uppercase", marginBottom: 4 }}>Risk history (last {client.riskEvents.length})</div>
            {client.riskEvents.length === 0 && <div style={{ color: colors.muted }}>No risk events on record</div>}
            {client.riskEvents.map((e, i) => (
              <div key={i} style={{ color: colors.orange }}>{e.type} — {fmt.ago(e.triggeredAt)} (value {e.value} / threshold {e.threshold})</div>
            ))}
            {client.deliveryFailureCount > 0 && (
              <div style={{ color: colors.red, marginTop: 6 }}>{client.deliveryFailureCount} notification delivery failure(s)</div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function ClientGroup({ tier, clients, expanded, onToggle }) {
  if (clients.length === 0) return null;
  const meta = TIER_META[tier];

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <TierBadge tier={tier} />
        <span style={{ fontSize: 10, color: colors.muted }}>({clients.length})</span>
      </div>
      <div style={{ ...cardStyle, padding: 0, overflow: "auto", opacity: tier === "green" ? 0.75 : 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Workspace</th><th style={th}>KYC</th><th style={th}>Onboarding</th>
              <th style={th}>Wallets</th><th style={th}>NAV</th><th style={th}>Trades</th>
              <th style={th}>Realized P&L</th><th style={th}>Flags</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <Fragment key={c.workspaceId}>
                <tr onClick={() => onToggle(c.workspaceId)} style={{ cursor: "pointer" }}>
                  <td style={td}>{c.name}</td>
                  <td style={{ ...td, color: c.owner?.kycStatus === "APPROVED" ? colors.green : c.owner?.kycStatus === "REJECTED" ? colors.red : colors.orange }}>
                    {c.owner?.kycStatus}
                  </td>
                  <td style={td}>{c.onboarding.complete ? "Complete" : `Stage ${c.onboarding.stage}/10`}</td>
                  <td style={td}>{c.wallets.length === 0 ? "—" : c.wallets.map(w => fmt.chain(w.chain)).join(", ")}</td>
                  <td style={td}>{c.portfolio.exists ? fmt.usd(c.portfolio.nav) : "No portfolio"}</td>
                  <td style={td}>{c.trades.total}{c.trades.lastTradeAt ? ` (last ${fmt.ago(c.trades.lastTradeAt)})` : ""}</td>
                  <td style={{ ...td, color: c.positions.realizedPnl >= 0 ? colors.green : colors.red }}>{fmt.usd(c.positions.realizedPnl)}</td>
                  <td style={td}><FlagPills flags={c.flags} /></td>
                  <td style={{ ...td, color: colors.muted }}>{expanded === c.workspaceId ? "▲" : "▼"}</td>
                </tr>
                {expanded === c.workspaceId && <ClientDetail client={c} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ClientsSection() {
  const { data, loading, error, refetch } = useApi(() => adminApi.clients(), []);
  const [expanded, setExpanded] = useState(null);
  const clients = data?.clients || [];

  return (
    <div>
      <SectionHeader title="Clients" count={clients.length} onRefresh={refetch} />
      {loading && <div style={{ padding: 24 }}><LoadingState rows={4}/></div>}
      {error && <ErrorState error={error} onRetry={refetch}/>}
      {!loading && clients.length === 0 && <EmptyState message="No workspaces"/>}
      {!loading && clients.length > 0 && (
        <>
          <ClientGroup tier="red"    clients={clients.filter(c => c.tier === "red")}    expanded={expanded} onToggle={(id) => setExpanded(expanded === id ? null : id)} />
          <ClientGroup tier="yellow" clients={clients.filter(c => c.tier === "yellow")} expanded={expanded} onToggle={(id) => setExpanded(expanded === id ? null : id)} />
          <ClientGroup tier="green"  clients={clients.filter(c => c.tier === "green")}  expanded={expanded} onToggle={(id) => setExpanded(expanded === id ? null : id)} />
        </>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminOperations() {
  const { user } = useAuthStore();
  if (!user?.isPlatformAdmin) return <Navigate to="/dashboard" replace />;

  const [tab, setTab] = useState("health");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ fontSize: 16, fontWeight: 600 }}>Operations</h1>

      <div style={{ display: "flex", gap: 6, borderBottom: `1px solid ${colors.border}`, paddingBottom: 8 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? colors.surface2 : "transparent",
              border: `1px solid ${tab === t.id ? colors.border2 : "transparent"}`,
              borderRadius: 4, padding: "6px 12px", fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              color: tab === t.id ? colors.text : colors.muted, cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "health" && <SystemHealthSection />}
      {tab === "clients" && <ClientsSection />}
      {tab === "settlements" && <StuckSettlementsSection />}
      {tab === "notifications" && <NotificationFailuresSection />}
      {tab === "wallets" && <WalletsSection />}
      {tab === "audit" && <AuditLogSection />}
    </div>
  );
}
