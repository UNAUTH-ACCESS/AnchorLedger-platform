import { useState, useEffect, useRef } from "react";
import { Transaction } from "@solana/web3.js";
import { TronLinkAdapter } from "@tronweb3/tronwallet-adapter-tronlink";
import { TronWeb } from "tronweb";
import { colors } from "../../lib/tokens";
import client from "../../api/client";
import useAuthStore from "../../store/auth.store";
import {
  getSession as getPhantomSession,
  setFlow as setPhantomFlow,
  buildConnectUrl as buildPhantomConnectUrl,
  beginSigning as beginPhantomSigning,
} from "../../lib/phantomDeeplink";

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// ── Chain config ──────────────────────────────────────────────────────────────

// TronLinkAdapter handles both desktop (window.tronWeb extension) and
// mobile (opens the TronLink app via its own deep-link protocol,
// openAppWithDeeplink defaults to true) — matching TronLink's own
// recommended integration rather than hand-rolling their raw
// tronlinkoutside:// protocol. Singleton: connect() state needs to persist
// between getAddress() and sendApproval() within one flow.
const tronLinkAdapter = new TronLinkAdapter({
  dappName: "Anchor Ledger",
  dappIcon: `${window.location.origin}/icon-192.png`,
});

// signTransaction() only signs, doesn't broadcast (same shape as Phantom's
// deep-link signTransaction) — this plain, keyless TronWeb instance is
// only used to build the unsigned tx and submit the signed one; neither
// operation needs a wallet.
const tronWebReadOnly = new TronWeb({ fullHost: "https://nile.trongrid.io" });

const CHAINS = [
  {
    key:      "ERC20",
    label:    "Ethereum",
    sub:      "ETH trades · ERC-20 USDT",
    provider: "METAMASK",
    icon:     "⬡",
    color:    "#627EEA",
    detect:   () => typeof window.ethereum !== "undefined" && window.ethereum.isMetaMask,
    getAddress: async () => {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      return accounts[0];
    },
    switchChain: async () => {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x7a69" }] // Hardhat local chainId 31337
      });
    },
    sendApproval: async (payload) => {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      return window.ethereum.request({
        method: "eth_sendTransaction",
        params: [{ from: accounts[0], to: payload.to, data: payload.data }]
      });
    }
  },
  {
    key:      "TRC20",
    label:    "Tron",
    sub:      "Nile TESTNET · TRX trades · TRC-20 USDT (test token, no real value)",
    provider: "TRONLINK",
    icon:     "◈",
    color:    "#FF060A",
    detect:   () => true, // detection + mobile deep-link handled inside connect() by
                           // TronLinkAdapter itself — matches the SPL pattern, no
                           // synchronous pre-check that would false-negative on mobile
                           // before the adapter gets a chance to open the app.
    getAddress: async () => {
      await tronLinkAdapter.connect();
      return tronLinkAdapter.address;
    },
    switchChain: async () => {}, // TronLink handles network internally — switchChain() itself
                                  // isn't supported by every TronLink app version (confirmed via
                                  // live test: "Current version of TronLink doesn't support switch
                                  // chain operation"), so this stays a no-op rather than a hard
                                  // dependency on an RPC method that isn't universally available.
    sendApproval: async (payload) => {
      tronWebReadOnly.setAddress(tronLinkAdapter.address);
      const tx = await tronWebReadOnly.transactionBuilder.triggerSmartContract(
        payload.contractAddress,
        payload.functionSelector,
        { feeLimit: 100_000_000 },
        payload.parameters,
        tronLinkAdapter.address
      );
      const signed = await tronLinkAdapter.signTransaction(tx.transaction);
      const result = await tronWebReadOnly.trx.sendRawTransaction(signed);
      return result.txid;
    }
  },
  {
    key:      "SPL",
    label:    "Solana",
    sub:      "SOL trades · SPL USDT",
    provider: "PHANTOM",
    icon:     "◎",
    color:    "#9945FF",
    detect:   () => true, // detection happens inside getAddress — mobile browsers
                           // without Phantom injected fall back to a deep link there
                           // instead of hard-blocking here (matches OnboardingPage.jsx)
    getAddress: async () => {
      if (window.solana?.isPhantom) {
        const resp = await window.solana.connect();
        return resp.publicKey.toString();
      }
      const url = encodeURIComponent(window.location.href);
      window.location.href = "https://phantom.app/ul/browse/" + url + "?ref=" + url;
      return "__DEEPLINK__";
    },
    switchChain: async () => {}, // Phantom handles network internally
    sendApproval: async (payload) => {
      // SPL approve via Phantom signAndSendTransaction
      // The transaction is built server-side and returned as a base64 serialized tx
      // Payload includes: { transaction: base64string } built by delegate-server
      if (payload.transaction) {
        const txBytes = Uint8Array.from(atob(payload.transaction), c => c.charCodeAt(0));
        const tx = Transaction.from(txBytes);
        const result = await window.solana.signAndSendTransaction(tx);
        return result.signature;
      }
      // Fallback: return payload note if no tx built yet
      throw new Error("SPL transaction payload missing — ensure delegate server is running");
    }
  }
];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Persists across an interrupted unlink flow — e.g. Android reclaiming a
// backgrounded WebView during Phantom's approval overlay, which silently
// reloads the page and abandons the in-flight handleUnlink() promise chain
// before it ever reaches unlink-confirm. Keyed per chain since only one
// unlink can realistically be in flight per chain at a time. Server-side,
// unlink-confirm independently verifies the delegate is actually gone
// on-chain before trusting any signature passed here — so a stale/replayed
// entry can't incorrectly mark a wallet unlinked that's still delegated.
const pendingUnlinkKey = (chainKey) => `al_pending_unlink_${chainKey}`;

function getPendingUnlink(chainKey) {
  try {
    const raw = localStorage.getItem(pendingUnlinkKey(chainKey));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setPendingUnlink(chainKey, data) {
  try {
    localStorage.setItem(pendingUnlinkKey(chainKey), JSON.stringify(data));
  } catch { /* localStorage unavailable — resume just won't be possible */ }
}

function clearPendingUnlink(chainKey) {
  try {
    localStorage.removeItem(pendingUnlinkKey(chainKey));
  } catch { /* ignore */ }
}

const STATUSES = {
  idle:        { label: "Not connected",   color: colors.muted  },
  detecting:   { label: "Detecting…",      color: colors.muted  },
  connecting:  { label: "Connecting…",     color: colors.violet },
  approving:   { label: "Awaiting approval…", color: colors.violet },
  confirming:  { label: "Confirming…",     color: colors.orange },
  linked:      { label: "Linked",          color: colors.green  },
  error:       { label: "Error",           color: colors.red    },
};

// ── WalletCard ────────────────────────────────────────────────────────────────

function WalletCard({ chain, workspaceId, onLinked, onUnlinked, approvedWallet }) {
  const [status,  setStatus]  = useState("idle");
  const [error,   setError]   = useState(null);
  const [address, setAddress] = useState(null);
  const [txHash,  setTxHash]  = useState(null);

  // Hydrate from server truth. Without this, the card starts at "idle" on
  // every mount regardless of what's actually delegate-approved on-chain -
  // which is exactly the desync where already-linked wallets showed as
  // "Not connected". Only overrides idle/error states, never an in-flight
  // connect attempt.
  useEffect(() => {
    if (approvedWallet && (status === "idle" || status === "error")) {
      setStatus("linked");
      setAddress(approvedWallet.address);
      if (approvedWallet.linkTxHash) setTxHash(approvedWallet.linkTxHash);
    } else if (!approvedWallet && status === "linked") {
      // Server truth says this chain is no longer delegate-approved - e.g.
      // unlinked from a different browser/tab - so reflect that here too
      // instead of leaving a stale "linked" card until a full page reload.
      setStatus("idle");
      setAddress(null);
      setTxHash(null);
    }
  }, [approvedWallet]);

  const s = STATUSES[status];
  const isLinked = status === "linked";

  async function handleConnect() {
    setError(null);
    try {
      // Mobile SPL uses Phantom's deep-link protocol instead of
      // window.solana — even inside Phantom's own in-app browser, Android
      // can reclaim the backgrounded WebView during the native-approval
      // handoff and silently abandon window.solana.signAndSendTransaction()
      // mid-flight. The deep-link flow survives that because state
      // round-trips through URLs/localStorage, not an in-memory Promise.
      // Desktop (browser extension, no app-switch) is unaffected and keeps
      // window.solana unchanged.
      if (chain.key === "SPL" && isMobileDevice()) {
        setStatus("connecting");
        const session = getPhantomSession();
        if (session) {
          await beginPhantomSigning({ action: "link", chainKey: "SPL", walletId: null, capUSDT: 10000 });
        } else {
          setPhantomFlow({ action: "link", chainKey: "SPL", walletId: null, capUSDT: 10000, stage: "connecting" });
          window.location.href = buildPhantomConnectUrl();
        }
        return; // navigates away either way — nothing after this runs
      }

      // 1. Detect wallet
      setStatus("detecting");
      if (!chain.detect()) {
        throw new Error(`${chain.label} wallet not detected. Install ${chain.provider === "METAMASK" ? "MetaMask" : chain.provider === "TRONLINK" ? "TronLink" : "Phantom"}.`);
      }

      // 2. Get address
      setStatus("connecting");
      const addr = await chain.getAddress();
      if (addr === "__DEEPLINK__") {
        setStatus("idle");
        setError("Opening wallet app… return here after connecting and tap Connect again.");
        return;
      }
      setAddress(addr);
      await chain.switchChain();

      // 3. Create wallet record in DB
      const chainsRes = await client.get("/wallets");
      // Check if wallet already exists
      const existing = chainsRes.data.data?.find(
        w => w.address.toLowerCase() === addr.toLowerCase()
      );

      let walletId;
      if (existing) {
        walletId = existing.id;
      } else {
        // Get chain ID from DB
        const chainRes = await client.get("/chains").catch(() => null);
        const dbChain = chainRes?.data?.data?.find(c =>
          chain.key === "ERC20" ? c.type === "EVM" :
          chain.key === "TRC20" ? c.type === "TRON" :
          c.type === "SOLANA"
        );

        const walletRes = await client.post("/wallets", {
          label:    `${chain.label} Wallet`,
          address:  addr,
          chainId:  dbChain?.id || chain.key,
          provider: chain.provider
        });
        walletId = walletRes.data.data.id;
      }

      // 4. Get approval payload from delegate server
      setStatus("approving");
      const payloadRes = await client.post("/wallets/link-payload", {
        walletIds: [walletId],
        capUSDT:   10000
      });
      const payload = payloadRes.data.data.payloads[chain.key];
      if (!payload) throw new Error(`No payload returned for ${chain.key}`);

      // 5. Present approve tx to wallet
      const hash = await chain.sendApproval(payload);
      setTxHash(hash);

      // 6. Confirm with backend
      setStatus("confirming");
      await new Promise(r => setTimeout(r, 3000)); // wait for on-chain confirmation
      await client.post(`/wallets/${walletId}/link-confirm`, { txHash: hash });

      setStatus("linked");
      onLinked?.({ chain: chain.key, address: addr, txHash: hash });

    } catch (e) {
      setError(e.message || "Connection failed");
      setStatus("error");
    }
  }

  async function handleUnlink() {
    setStatus("connecting");
    setError(null);
    try {
      // Same deep-link rationale as handleConnect above — this is in fact
      // the exact flow the original bug was diagnosed on.
      if (chain.key === "SPL" && isMobileDevice()) {
        const walletsRes = await client.get("/wallets");
        const wallet = walletsRes.data.data?.find(w => w.address.toLowerCase() === address?.toLowerCase());
        if (!wallet) throw new Error("Wallet not found");

        const session = getPhantomSession();
        if (session) {
          await beginPhantomSigning({ action: "unlink", chainKey: "SPL", walletId: wallet.id });
        } else {
          setPhantomFlow({ action: "unlink", chainKey: "SPL", walletId: wallet.id, stage: "connecting" });
          window.location.href = buildPhantomConnectUrl();
        }
        return;
      }
    } catch (e) {
      setError(e.message);
      setStatus("error");
      return;
    }
    try {
      // Ensure the wallet provider is actually available before attempting
      // to sign - handleUnlink calls sendApproval directly (it never goes
      // through getAddress() the way handleConnect does), so without this
      // check a missing provider crashes instead of falling back to the
      // same mobile deep link connect already uses.
      const providerCheck = await chain.getAddress();
      if (providerCheck === "__DEEPLINK__") {
        setStatus("idle");
        setError("Opening wallet app… return here after connecting and tap Unlink again.");
        return;
      }

      const walletsRes = await client.get("/wallets");
      const wallet = walletsRes.data.data?.find(
        w => w.address.toLowerCase() === address?.toLowerCase()
      );
      if (!wallet) throw new Error("Wallet not found");

      const payloadRes = await client.post(`/wallets/${wallet.id}/unlink-payload`);
      const payload = payloadRes.data.data.payload;

      // Mark the flow as in-progress before handing off to the wallet app —
      // this is the window (Phantom's approval overlay) where an Android
      // WebView reclaim can silently kill the page and abandon everything
      // below this line.
      setPendingUnlink(chain.key, { walletId: wallet.id, stage: "signing", signature: null, startedAt: Date.now() });

      const signature = await chain.sendApproval(payload);
      setTxHash(signature);

      // Persist the signature the moment we have it, before the network
      // call that could itself get interrupted — this is what makes resume
      // possible without re-prompting Phantom.
      setPendingUnlink(chain.key, { walletId: wallet.id, stage: "signed", signature, startedAt: Date.now() });

      await client.post(`/wallets/${wallet.id}/unlink-confirm`, { signature });
      clearPendingUnlink(chain.key);

      setStatus("idle");
      setAddress(null);
      setTxHash(null);
      onUnlinked?.(chain.key);
    } catch (e) {
      // Deliberately not clearing pendingUnlink here — if we have a
      // signature, it's still worth resuming on next mount rather than
      // losing it.
      setError(e.message);
      setStatus("error");
    }
  }

  // Resume-on-mount: if a previous unlink flow got a signature but never
  // reached unlink-confirm (interrupted reload), retry the confirm call
  // with it instead of forcing the user back through Phantom. Runs once;
  // server-side verification means a stale/never-landed signature just
  // fails safely rather than being trusted blindly.
  const resumeAttempted = useRef(false);
  useEffect(() => {
    if (resumeAttempted.current) return;
    if (!approvedWallet) return; // server truth says already unlinked — nothing to resume
    const pending = getPendingUnlink(chain.key);
    if (!pending || pending.stage !== "signed" || !pending.signature) return;
    if (pending.walletId !== approvedWallet.id) return;

    resumeAttempted.current = true;
    (async () => {
      try {
        await client.post(`/wallets/${pending.walletId}/unlink-confirm`, { signature: pending.signature });
        clearPendingUnlink(chain.key);
        setStatus("idle");
        setAddress(null);
        setTxHash(null);
        onUnlinked?.(chain.key);
      } catch (e) {
        // NOT_YET_REVOKED (or any other failure) — leave the pending entry
        // in place, it may resolve on a future mount. Don't surface an
        // error for a resume attempt the user didn't knowingly trigger.
      }
    })();
  }, [approvedWallet]);

  // Diagnostic beacon — if the page is being hidden/unloaded while an
  // unlink is mid-flight, log it server-side immediately. This is what
  // makes this exact failure mode visible on its own next time, instead of
  // needing a live coordinated repro to catch it in the act.
  useEffect(() => {
    const sendInterruptBeacon = () => {
      const pending = getPendingUnlink(chain.key);
      if (!pending) return;
      const payload = new Blob(
        [JSON.stringify({ walletId: pending.walletId, stage: pending.stage })],
        { type: "application/json" }
      );
      navigator.sendBeacon?.("/api/v1/wallets/unlink-interrupted-beacon", payload);
    };
    window.addEventListener("pagehide", sendInterruptBeacon);
    window.addEventListener("beforeunload", sendInterruptBeacon);
    return () => {
      window.removeEventListener("pagehide", sendInterruptBeacon);
      window.removeEventListener("beforeunload", sendInterruptBeacon);
    };
  }, [chain.key]);

  return (
    <div style={{
      background:   colors.surface,
      border:       `1px solid ${isLinked ? chain.color + "44" : colors.border}`,
      borderRadius: 8,
      padding:      20,
      display:      "flex",
      flexDirection: "column",
      gap:          14,
      transition:   "border-color 0.2s",
      position:     "relative",
      overflow:     "hidden"
    }}>
      {/* Accent bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 2,
        background: isLinked ? chain.color : "transparent",
        transition: "background 0.3s"
      }} />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontSize: 22, color: chain.color,
            fontFamily: "monospace", lineHeight: 1
          }}>{chain.icon}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
              {chain.label}
            </div>
            <div style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
              {chain.sub}
            </div>
          </div>
        </div>

        {/* Status pill */}
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          background: colors.surface2,
          border: `1px solid ${colors.border}`,
          borderRadius: 20, padding: "3px 8px"
        }}>
          <div style={{
            width: 5, height: 5, borderRadius: "50%",
            background: s.color,
            boxShadow: isLinked ? `0 0 6px ${chain.color}` : "none"
          }} />
          <span style={{ fontSize: 10, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>
            {s.label}
          </span>
        </div>
      </div>

      {/* Address */}
      {address && (
        <div style={{
          background: colors.surface2,
          border: `1px solid ${colors.border}`,
          borderRadius: 4, padding: "6px 10px",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10, color: colors.muted,
          wordBreak: "break-all"
        }}>
          {address}
        </div>
      )}

      {/* Tx hash */}
      {txHash && isLinked && (
        <div style={{ fontSize: 10, color: colors.muted }}>
          Approval tx: <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: colors.green
          }}>{String(txHash).slice(0, 20)}…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          fontSize: 10, color: colors.red,
          background: "#FF4D6D11",
          border: `1px solid #FF4D6D33`,
          borderRadius: 4, padding: "6px 10px"
        }}>
          {error}
        </div>
      )}

      {/* Action button */}
      {!isLinked ? (
        <button
          onClick={handleConnect}
          disabled={["detecting","connecting","approving","confirming"].includes(status)}
          style={{
            background:    chain.color + "22",
            border:        `1px solid ${chain.color}55`,
            borderRadius:  4,
            padding:       "8px 14px",
            color:         chain.color,
            fontSize:      11,
            fontWeight:    600,
            cursor:        status === "idle" || status === "error" ? "pointer" : "not-allowed",
            opacity:       ["detecting","connecting","approving","confirming"].includes(status) ? 0.6 : 1,
            transition:    "opacity 0.2s",
            fontFamily:    "'JetBrains Mono', monospace",
            letterSpacing: "0.04em"
          }}
        >
          {status === "idle" || status === "error"
            ? `Connect ${chain.label}`
            : s.label}
        </button>
      ) : (
        <button
          onClick={handleUnlink}
          style={{
            background:  "transparent",
            border:      `1px solid ${colors.border}`,
            borderRadius: 4,
            padding:     "8px 14px",
            color:       colors.muted,
            fontSize:    11,
            cursor:      "pointer",
            fontFamily:  "'JetBrains Mono', monospace"
          }}
        >
          Unlink wallet
        </button>
      )}
    </div>
  );
}

// ── DepositApprovalCard ──────────────────────────────────────────────────────
// Deposit-sweep approval is a SEPARATE authorization from trading (see
// wallets.routes.js's own comments on /deposit-approval-payload) - a wallet
// can be trading-approved, deposit-approved, both, or neither, since they're
// different grants (different caps, different assets, different purpose)
// that happen to currently point at the same delegate address. This card
// deliberately doesn't try to reuse WalletCard's isLinked state for that
// reason - it checks the real on-chain deposit allowance independently via
// deposit-status rather than trusting the shared delegateApproved DB flag,
// which trading approval can also set to true.
//
// Solana desktop only for v1 (window.solana / Phantom extension) - this
// doesn't yet replicate WalletCard's full mobile deep-link resume-on-
// interrupt machinery (pendingUnlinkKey and friends). A mobile user without
// the Phantom extension gets a clear message to use desktop rather than a
// silent failure.
function DepositApprovalCard({ workspaceId, onApproved }) {
  const [status, setStatus] = useState("checking"); // checking | idle | needs-wallet | approving | confirming | approved | error
  const [address, setAddress] = useState(null);
  const [walletId, setWalletId] = useState(null);
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);

  async function refresh() {
    if (!workspaceId) return;
    try {
      const walletsRes = await client.get("/wallets");
      const splWallet = (walletsRes.data.data || []).find(w => w.chain?.type === "SOLANA");

      if (!splWallet) {
        setStatus("needs-wallet");
        return;
      }
      setWalletId(splWallet.id);
      setAddress(splWallet.address);

      const statusRes = await client.get(`/wallets/${splWallet.id}/deposit-status`);
      if (statusRes.data.data.approved) {
        setStatus("approved");
      } else {
        setStatus("idle");
      }
    } catch {
      setStatus("idle");
    }
  }

  useEffect(() => { refresh(); }, [workspaceId]);

  async function handleApprove() {
    setError(null);
    try {
      if (!window.solana?.isPhantom) {
        throw new Error("Phantom wallet not detected. Deposit approval currently requires the Phantom browser extension on desktop.");
      }

      let currentWalletId = walletId;
      let currentAddress = address;

      if (!currentWalletId) {
        setStatus("approving");
        const resp = await window.solana.connect();
        currentAddress = resp.publicKey.toString();

        const chainRes = await client.get("/chains").catch(() => null);
        const solChain = chainRes?.data?.data?.find(c => c.type === "SOLANA");

        const walletRes = await client.post("/wallets", {
          label: "Solana Wallet", address: currentAddress, chainId: solChain?.id, provider: "PHANTOM",
        });
        currentWalletId = walletRes.data.data.id;
        setWalletId(currentWalletId);
        setAddress(currentAddress);
      }

      setStatus("approving");
      const payloadRes = await client.post("/wallets/deposit-approval-payload", {
        walletId: currentWalletId, capUSDC: 100000,
      });
      const payload = payloadRes.data.data.payload;

      const txBytes = Uint8Array.from(atob(payload.transaction), c => c.charCodeAt(0));
      const tx = Transaction.from(txBytes);
      const result = await window.solana.signAndSendTransaction(tx);
      setTxHash(result.signature);

      setStatus("confirming");
      await new Promise(r => setTimeout(r, 3000));
      await client.post(`/wallets/${currentWalletId}/deposit-approval-confirm`, { txHash: result.signature });

      setStatus("approved");
      onApproved?.();
    } catch (e) {
      setError(e.message || "Approval failed");
      setStatus("error");
    }
  }

  const isApproved = status === "approved";
  const isBusy = ["checking", "approving", "confirming"].includes(status);

  const statusLabel = {
    checking:    "Checking…",
    idle:        "Not approved",
    "needs-wallet": "Connect a Solana wallet first",
    approving:   "Awaiting approval…",
    confirming:  "Confirming…",
    approved:    "Approved",
    error:       "Error",
  }[status];
  const statusColor = isApproved ? colors.green : status === "error" ? colors.red : colors.muted;

  return (
    <div style={{
      background:   colors.surface,
      border:       `1px solid ${isApproved ? colors.green + "44" : colors.border}`,
      borderRadius: 8,
      padding:      20,
      display:      "flex",
      flexDirection: "column",
      gap:          14,
      position:     "relative",
      overflow:     "hidden"
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 2,
        background: isApproved ? colors.green : "transparent",
      }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 22, color: "#9945FF", fontFamily: "monospace", lineHeight: 1 }}>◎</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>Deposit Sweep</div>
            <div style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
              Solana · USDC deposits only — separate from trading permission
            </div>
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 5,
          background: colors.surface2, border: `1px solid ${colors.border}`,
          borderRadius: 20, padding: "3px 8px"
        }}>
          <div style={{
            width: 5, height: 5, borderRadius: "50%", background: statusColor,
            boxShadow: isApproved ? `0 0 6px ${colors.green}` : "none"
          }} />
          <span style={{ fontSize: 10, color: statusColor, fontFamily: "'JetBrains Mono', monospace" }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {address && (
        <div style={{
          background: colors.surface2, border: `1px solid ${colors.border}`,
          borderRadius: 4, padding: "6px 10px",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: colors.muted,
          wordBreak: "break-all"
        }}>
          {address}
        </div>
      )}

      {txHash && isApproved && (
        <div style={{ fontSize: 10, color: colors.muted }}>
          Approval tx: <span style={{ fontFamily: "'JetBrains Mono', monospace", color: colors.green }}>
            {String(txHash).slice(0, 20)}…
          </span>
        </div>
      )}

      {error && (
        <div style={{
          fontSize: 10, color: colors.red, background: "#FF4D6D11",
          border: `1px solid #FF4D6D33`, borderRadius: 4, padding: "6px 10px"
        }}>
          {error}
        </div>
      )}

      {!isApproved && (
        <button
          onClick={handleApprove}
          disabled={isBusy}
          style={{
            background: "#9945FF22", border: "1px solid #9945FF55", borderRadius: 4,
            padding: "8px 14px", color: "#9945FF", fontSize: 11, fontWeight: 600,
            cursor: isBusy ? "not-allowed" : "pointer", opacity: isBusy ? 0.6 : 1,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em"
          }}
        >
          {status === "checking" ? "Checking…" : "Approve Deposit Sweep"}
        </button>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function WalletConnect() {
  const workspaceId = useAuthStore(s => s.activeWorkspace?.id);
  const [approvedByChain, setApprovedByChain] = useState({});

  // Single source of truth: always re-fetch what's ACTUALLY delegate-approved
  // server-side, rather than tracking a separate local "linked" map that can
  // drift from it. This is what makes the summary count and every card
  // self-correct after ANY change - including ones made in a totally
  // different browser context (e.g. Phantom's in-app browser), which this
  // tab has no other way of finding out about.
  function refreshWallets() {
    if (!workspaceId) return;
    client.get("/wallets/delegate-status")
      .then(res => {
        const byChain = {};
        for (const w of res.data.data || []) {
          if (w.delegateChain) byChain[w.delegateChain] = w;
        }
        setApprovedByChain(byChain);
      })
      .catch(() => {}); // non-fatal: cards just start at idle as before
  }

  useEffect(() => {
    refreshWallets();

    // Re-sync whenever this tab regains focus/visibility - catches actions
    // taken elsewhere (another tab, or Phantom's in-app browser) while this
    // tab was in the background, without requiring a manual reload.
    function onFocus() { refreshWallets(); }
    function onVisibility() { if (document.visibilityState === "visible") refreshWallets(); }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [workspaceId]);

  function handleLinked() {
    refreshWallets();
  }

  function handleUnlinked() {
    refreshWallets();
  }

  const linkedCount = Object.keys(approvedByChain).length;

  return (
    <div style={{
      minHeight:  "100vh",
      background: colors.bg,
      padding:    "40px 24px",
      maxWidth:   680,
      margin:     "0 auto"
    }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{
          fontSize: 10, color: colors.muted,
          textTransform: "uppercase", letterSpacing: "0.1em",
          marginBottom: 8
        }}>
          Wallet Setup
        </div>
        <h1 style={{
          fontSize: 22, fontWeight: 700,
          color: colors.text, margin: 0, marginBottom: 8
        }}>
          Connect Trading Wallets
        </h1>
        <p style={{ fontSize: 12, color: colors.muted, margin: 0, lineHeight: 1.6 }}>
          Each chain requires its own wallet. Connect the chains you want to trade.
          One approval grants Anchor Ledger permission to execute trades automatically.
        </p>
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {CHAINS.map(chain => (
          <WalletCard
            key={chain.key}
            chain={chain}
            workspaceId={workspaceId}
            onLinked={handleLinked}
            onUnlinked={handleUnlinked}
            approvedWallet={approvedByChain[chain.key] || null}
          />
        ))}
      </div>

      {/* Deposits — a separate authorization from trading, called out on
          its own rather than folded into the chain cards above */}
      <div style={{ marginTop: 28, marginBottom: 12 }}>
        <div style={{
          fontSize: 10, color: colors.muted,
          textTransform: "uppercase", letterSpacing: "0.1em",
        }}>
          Deposits
        </div>
        <p style={{ fontSize: 11, color: colors.muted, margin: "4px 0 0", lineHeight: 1.5 }}>
          A separate approval — this is what lets Anchor Ledger sweep USDC you send
          to your Solana wallet into your trading balance. Trading permission above
          doesn't grant this on its own.
        </p>
      </div>
      <DepositApprovalCard workspaceId={workspaceId} onApproved={handleLinked} />

      {/* Summary */}
      {linkedCount > 0 && (
        <div style={{
          marginTop: 24,
          background: colors.surface,
          border: `1px solid ${colors.green}33`,
          borderRadius: 8, padding: 16,
          display: "flex", alignItems: "center", gap: 10
        }}>
          <span style={{ color: colors.green, fontSize: 16 }}>✓</span>
          <div>
            <div style={{ fontSize: 12, color: colors.text, fontWeight: 600 }}>
              {linkedCount} wallet{linkedCount > 1 ? "s" : ""} linked
            </div>
            <div style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
              Anchor Ledger will trade automatically when signals fire.
            </div>
          </div>
        </div>
      )}

      {/* How it works */}
      <div style={{
        marginTop: 24,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 8, padding: 16
      }}>
        <div style={{
          fontSize: 10, color: colors.muted,
          textTransform: "uppercase", letterSpacing: "0.06em",
          marginBottom: 12
        }}>
          How it works
        </div>
        {[
          ["Connect",  "Your wallet signs a one-time approval transaction."],
          ["Delegate", "Anchor Ledger receives permission to move up to 10,000 USDT on your behalf."],
          ["Trade",    "When a signal fires, trades execute automatically — no manual action needed."],
          ["Revoke",   "Unlink at any time to cancel all permissions instantly."],
        ].map(([title, desc]) => (
          <div key={title} style={{
            display: "flex", gap: 12, alignItems: "flex-start",
            padding: "6px 0",
            borderBottom: `1px solid ${colors.border}`
          }}>
            <span style={{
              fontSize: 10, color: colors.violet,
              fontFamily: "'JetBrains Mono', monospace",
              minWidth: 52, paddingTop: 1
            }}>
              {title}
            </span>
            <span style={{ fontSize: 11, color: colors.muted, lineHeight: 1.5 }}>
              {desc}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
