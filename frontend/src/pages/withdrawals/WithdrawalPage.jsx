import { useState } from "react";
import { useApi } from "../../hooks/useApi";
import { portfolios as portfoliosApi, withdrawals as withdrawalsApi } from "../../api/endpoints";
import { ErrorState, LoadingState, EmptyState } from "../../components/system/SystemStatus";
import { colors } from "../../lib/tokens";
import { fmt } from "../../lib/format";

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
const input = {
  background: colors.surface2, border: `1px solid ${colors.border2}`,
  borderRadius: 4, padding: "8px 10px", color: colors.text,
  fontFamily: "'JetBrains Mono', monospace", fontSize: 11, width: "100%",
  boxSizing: "border-box",
};

const STATUS_COLOR = { PENDING: colors.orange, PAID: colors.green, REJECTED: colors.red };

function RequestForm({ portfolioId, availableBalance, onRequested }) {
  const [amount, setAmount] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await withdrawalsApi.request(portfolioId, parseFloat(amount), destinationAddress.trim());
      setAmount("");
      setDestinationAddress("");
      onRequested?.();
    } catch (err) {
      setError(err.response?.data?.error?.message || "Withdrawal request failed");
    } finally {
      setSubmitting(false);
    }
  };

  const parsedAmount = parseFloat(amount);
  const exceedsBalance = !isNaN(parsedAmount) && parsedAmount > availableBalance;

  return (
    <form onSubmit={handleSubmit} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 600 }}>Request a withdrawal</div>

      <div>
        <div style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}>Amount (USD)</div>
        <input
          style={input} type="number" step="0.01" min="0.01" required
          value={amount} onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
        />
      </div>

      <div>
        <div style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}>Destination Solana address</div>
        <input
          style={input} type="text" required
          value={destinationAddress} onChange={(e) => setDestinationAddress(e.target.value)}
          placeholder="Your wallet's public address"
        />
      </div>

      {amount && (
        <div style={{ fontSize: 10, color: exceedsBalance ? colors.red : colors.muted }}>
          {exceedsBalance
            ? `Exceeds your available balance of ${fmt.usd(availableBalance)}`
            : `This will reduce your available balance to ${fmt.usd(availableBalance - (parsedAmount || 0))}`}
        </div>
      )}

      {error && <div style={{ fontSize: 10, color: colors.red }}>{error}</div>}

      <button
        type="submit"
        disabled={submitting || exceedsBalance || !amount || !destinationAddress}
        style={{
          background: (submitting || exceedsBalance || !amount || !destinationAddress) ? colors.surface2 : colors.green,
          color: (submitting || exceedsBalance || !amount || !destinationAddress) ? colors.muted : colors.bg,
          border: "none", borderRadius: 4, padding: "10px 20px",
          fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700,
          cursor: (submitting || exceedsBalance || !amount || !destinationAddress) ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? "Submitting…" : "Request Withdrawal"}
      </button>
    </form>
  );
}

export default function WithdrawalPage() {
  const { data: portfolios, loading: loadingPortfolios, error: portfolioError } = useApi(() => portfoliosApi.list(), []);
  const portfolio = portfolios?.[0];

  const { data, loading, error, refetch } = useApi(
    () => portfolio ? withdrawalsApi.get(portfolio.id) : Promise.resolve({ data: { data: { availableBalance: 0, withdrawals: [] } } }),
    [portfolio?.id]
  );

  if (loadingPortfolios || loading) return <div style={{ padding: 24 }}><LoadingState rows={4}/></div>;
  if (portfolioError) return <ErrorState error={portfolioError}/>;
  if (!portfolio) return <EmptyState message="No portfolio found"/>;
  if (error) return <ErrorState error={error} onRetry={refetch}/>;

  const { availableBalance, withdrawals: history } = data || { availableBalance: 0, withdrawals: [] };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>
      <div>
        <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Withdrawals</h1>
        <div style={{ fontSize: 20, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
          {fmt.usd(availableBalance)}
        </div>
        <div style={{ fontSize: 10, color: colors.muted }}>Available balance</div>
      </div>

      <RequestForm portfolioId={portfolio.id} availableBalance={availableBalance} onRequested={refetch} />

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 10 }}>History</div>
        {history.length === 0 && <EmptyState message="No withdrawal requests yet"/>}
        {history.length > 0 && (
          <div style={{ ...cardStyle, padding: 0, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Requested</th><th style={th}>Amount</th>
                  <th style={th}>Destination</th><th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((w) => (
                  <tr key={w.id}>
                    <td style={td}>{fmt.ago(w.requestedAt)}</td>
                    <td style={td}>{fmt.usd(w.amount)}</td>
                    <td style={{ ...td, maxWidth: 160, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={w.destinationAddress}>
                      {w.destinationAddress}
                    </td>
                    <td style={{ ...td, color: STATUS_COLOR[w.status] || colors.text }}>{w.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
