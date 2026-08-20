import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import client from "../../api/client";
import { colors } from "../../lib/tokens";
import {
  parseConnectCallback, parseSignCallback,
  getFlow, clearFlow, beginSigning,
} from "../../lib/phantomDeeplink";

// Lands here after every redirect back from Phantom's deep-link flow (both
// the connect step and the signTransaction step use this same route, via
// ?phantom_action=connect|sign — Phantom appends its response as query
// params on redirect_link). Mounted inside the normal authenticated route
// tree so RouteGuard's bootstrap() re-establishes the access token first —
// it doesn't survive the reload this redirect always causes, same as
// nothing else in memory does.
export default function WalletCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("processing");
  const [error, setError] = useState(null);

  useEffect(() => {
    const action = searchParams.get("phantom_action");

    (async () => {
      try {
        if (action === "connect") {
          const result = parseConnectCallback(searchParams);
          if (!result.success) throw new Error(result.error || "Phantom connect was rejected or failed");

          const flow = getFlow();
          if (!flow) throw new Error("No pending wallet action found — please start over from the Wallets page");

          await beginSigning(flow); // redirects again — nothing after this runs
          return;
        }

        if (action === "sign") {
          const result = parseSignCallback(searchParams);
          if (!result.success) {
            // User rejected or Phantom errored — no signature exists, nothing
            // to resume. Clear the flow rather than leaving stale "signing"
            // state that a later mount would try to act on.
            clearFlow();
            throw new Error(result.error || "Signing was rejected or failed");
          }

          const flow = getFlow();
          if (!flow) throw new Error("No pending wallet action found — please start over from the Wallets page");

          const submitRes = await client.post("/wallets/submit-signed-transaction", {
            transaction: result.signedTransactionBase64,
          });
          const signature = submitRes.data.data.signature;

          if (flow.action === "link") {
            await client.post(`/wallets/${flow.walletId}/link-confirm`, { txHash: signature });
          } else if (flow.action === "deposit-approve") {
            await client.post(`/wallets/${flow.walletId}/deposit-approval-confirm`, { txHash: signature });
          } else {
            await client.post(`/wallets/${flow.walletId}/unlink-confirm`, { signature });
          }

          // Return to wherever this flow started (onboarding vs. the
          // standalone Wallets page) - previously hardcoded to /wallets,
          // which would silently eject a mobile user out of onboarding
          // partway through Stage 9 the moment they approved via deep link.
          const returnTo = flow.returnTo || "/wallets";
          clearFlow();
          setStatus("done");
          setTimeout(() => navigate(returnTo, { replace: true }), 1200);
          return;
        }

        throw new Error(`Unknown phantom_action: ${action}`);
      } catch (e) {
        setError(e.response?.data?.error?.message || e.message || "Something went wrong completing the Phantom flow");
        setStatus("error");
      }
    })();
  }, []);

  return (
    <div style={{
      minHeight: "100vh", background: colors.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'JetBrains Mono', monospace", padding: 24,
    }}>
      <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
        {status === "processing" && (
          <div style={{ fontSize: 12, color: colors.muted }}>Completing wallet action…</div>
        )}
        {status === "done" && (
          <div style={{ fontSize: 12, color: colors.green }}>Done — returning to Wallets…</div>
        )}
        {status === "error" && (
          <>
            <div style={{ fontSize: 12, color: colors.red, marginBottom: 16 }}>{error}</div>
            <button
              onClick={() => navigate("/wallets", { replace: true })}
              style={{
                background: colors.surface2, color: colors.text, border: `1px solid ${colors.border2}`,
                borderRadius: 4, padding: "8px 16px", fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                cursor: "pointer",
              }}
            >
              Back to Wallets
            </button>
          </>
        )}
      </div>
    </div>
  );
}
