/**
 * Phantom deep-link signing protocol (docs.phantom.com/phantom-deeplinks).
 *
 * Replaces window.solana on mobile for both link and unlink. The root
 * cause this exists for: even inside Phantom's own in-app browser,
 * window.solana.signAndSendTransaction() can be silently abandoned if
 * Android reclaims the backgrounded WebView during the handoff to
 * Phantom's native approval UI — the calling page's whole JS context,
 * including the pending Promise, is gone when that happens. This protocol
 * round-trips state through URLs and localStorage instead of an in-memory
 * Promise, so it survives that.
 *
 * signAndSendTransaction (deep link) is deprecated by Phantom — this uses
 * signTransaction instead, which only signs. Submission (sendRawTransaction)
 * is a separate explicit step we do via delegate-server after decrypting
 * Phantom's response.
 *
 * Crypto: NaCl box (x25519 + XSalsa20 + Poly1305), verified round-trip +
 * nonce-freshness + tamper/wrong-key-fails-loudly in a standalone script
 * before this file was written.
 */
import nacl from "tweetnacl";
import { encodeUTF8, decodeUTF8 } from "tweetnacl-util";
import bs58 from "bs58";
import client from "../api/client";

const PHANTOM_BASE = "https://phantom.app/ul/v1";
const SESSION_KEY  = "al_phantom_session";
const FLOW_KEY     = "al_phantom_flow";

// ── Encoding ─────────────────────────────────────────────────────────────────

function b58encode(bytes) { return bs58.encode(bytes); }
function b58decode(str)   { return bs58.decode(str); }

// ── Encrypt / decrypt (verified logic — see verify_phantom_crypto.js) ────────

function encryptPayload(payloadObj, peerPublicKeyBytes, secretKeyBytes) {
  const nonce = nacl.randomBytes(24);
  const message = decodeUTF8(JSON.stringify(payloadObj));
  const encrypted = nacl.box(message, nonce, peerPublicKeyBytes, secretKeyBytes);
  return { nonce: b58encode(nonce), payload: b58encode(encrypted) };
}

function decryptPayload(dataB58, nonceB58, peerPublicKeyBytes, secretKeyBytes) {
  const nonce = b58decode(nonceB58);
  const encrypted = b58decode(dataB58);
  const decrypted = nacl.box.open(encrypted, nonce, peerPublicKeyBytes, secretKeyBytes);
  if (!decrypted) throw new Error("Failed to decrypt Phantom response — wrong key or tampered data");
  return JSON.parse(encodeUTF8(decrypted));
}

// ── Session (long-lived — one connect, reused indefinitely) ──────────────────
// Session tokens don't expire per Phantom's docs; persisting this means
// every link/unlink after the first skips straight to signTransaction,
// no repeated connect round-trip.

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return {
      dappSecretKey: b58decode(s.dappSecretKey),
      dappPublicKey: b58decode(s.dappPublicKey),
      phantomPublicKey: b58decode(s.phantomPublicKey),
      session: s.session,
      ownerAddress: s.ownerAddress,
    };
  } catch {
    return null;
  }
}

function saveSession({ dappSecretKey, dappPublicKey, phantomPublicKey, session, ownerAddress }) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    dappSecretKey: b58encode(dappSecretKey),
    dappPublicKey: b58encode(dappPublicKey),
    phantomPublicKey: b58encode(phantomPublicKey),
    session,
    ownerAddress,
  }));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ── Flow state (short-lived — what we're in the middle of doing) ─────────────
// Separate from the session: this is per-attempt (link vs unlink, which
// wallet, which stage) and gets cleared on completion, not reused.

export function getFlow() {
  try {
    const raw = localStorage.getItem(FLOW_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setFlow(flow) {
  localStorage.setItem(FLOW_KEY, JSON.stringify(flow));
}

export function clearFlow() {
  localStorage.removeItem(FLOW_KEY);
}

// ── Building outbound deep-link URLs ──────────────────────────────────────────

const REDIRECT_BASE = () => `${window.location.origin}/wallet-callback`;

export function buildConnectUrl({ cluster = "devnet" } = {}) {
  const dappKeypair = nacl.box.keyPair();
  // Stash the new keypair immediately, before navigating away — this is
  // the same principle as persisting the unlink signature the moment it's
  // obtained: nothing that matters lives only in memory across a redirect.
  localStorage.setItem("al_phantom_pending_keypair", JSON.stringify({
    secretKey: b58encode(dappKeypair.secretKey),
    publicKey: b58encode(dappKeypair.publicKey),
  }));

  const params = new URLSearchParams({
    app_url: window.location.origin,
    dapp_encryption_public_key: b58encode(dappKeypair.publicKey),
    redirect_link: `${REDIRECT_BASE()}?phantom_action=connect`,
    cluster,
  });
  return `${PHANTOM_BASE}/connect?${params.toString()}`;
}

export function buildSignTransactionUrl(transactionBase64) {
  const s = getSession();
  if (!s) throw new Error("No Phantom session — must connect first");

  const txBytes = Uint8Array.from(atob(transactionBase64), c => c.charCodeAt(0));
  const { nonce, payload } = encryptPayload(
    { transaction: b58encode(txBytes), session: s.session },
    s.phantomPublicKey,
    s.dappSecretKey
  );

  const params = new URLSearchParams({
    app_url: window.location.origin,
    dapp_encryption_public_key: b58encode(s.dappPublicKey),
    nonce,
    redirect_link: `${REDIRECT_BASE()}?phantom_action=sign`,
    payload,
  });
  return `${PHANTOM_BASE}/signTransaction?${params.toString()}`;
}

// ── Parsing inbound redirects (called from WalletCallback.jsx) ───────────────

export function parseConnectCallback(searchParams) {
  if (searchParams.get("errorCode")) {
    return { success: false, error: searchParams.get("errorMessage") || searchParams.get("errorCode") };
  }
  const pendingRaw = localStorage.getItem("al_phantom_pending_keypair");
  if (!pendingRaw) throw new Error("No pending Phantom keypair found — cannot decrypt connect response");
  const pending = JSON.parse(pendingRaw);
  const dappSecretKey = b58decode(pending.secretKey);
  const dappPublicKey = b58decode(pending.publicKey);

  const phantomPublicKey = b58decode(searchParams.get("phantom_encryption_public_key"));
  const decrypted = decryptPayload(searchParams.get("data"), searchParams.get("nonce"), phantomPublicKey, dappSecretKey);

  saveSession({ dappSecretKey, dappPublicKey, phantomPublicKey, session: decrypted.session, ownerAddress: decrypted.public_key });
  localStorage.removeItem("al_phantom_pending_keypair");
  return { success: true, publicKey: decrypted.public_key };
}

export function parseSignCallback(searchParams) {
  if (searchParams.get("errorCode")) {
    return { success: false, error: searchParams.get("errorMessage") || searchParams.get("errorCode") };
  }
  const s = getSession();
  if (!s) throw new Error("No Phantom session found — cannot decrypt signTransaction response");

  const decrypted = decryptPayload(searchParams.get("data"), searchParams.get("nonce"), s.phantomPublicKey, s.dappSecretKey);
  // decrypted.transaction is base58 signed tx bytes per Phantom's protocol —
  // re-encode to base64 to match the encoding delegate-server/backend use
  // everywhere else in this app.
  const signedTxBytes = b58decode(decrypted.transaction);
  const signedTxBase64 = btoa(String.fromCharCode(...signedTxBytes));
  return { success: true, signedTransactionBase64: signedTxBase64 };
}

// ── Shared orchestration step: fetch the right payload for the current
// flow (link or unlink) and redirect to Phantom's signTransaction. Used by
// both the initiator (WalletConnect.jsx, when a session already exists —
// skips straight here) and the callback (WalletCallback.jsx, right after a
// fresh connect succeeds) — one place, so link/unlink stay handled
// identically rather than drifting into two slightly different copies.
export async function beginSigning(flow) {
  let walletId = flow.walletId;

  // Link and deposit-approve both start with no wallet row yet the first
  // time - the address only became known once the connect step returned
  // it. Find-or-create here, same logic handleConnect's desktop path
  // already uses. Trading approval and deposit-sweep approval are
  // different grants on the same Solana wallet, so they share this
  // lookup rather than each keeping their own copy.
  if ((flow.action === "link" || flow.action === "deposit-approve") && !walletId) {
    const session = getSession();
    if (!session?.ownerAddress) throw new Error("No connected Phantom address found — reconnect and try again");
    const addr = session.ownerAddress;

    const existingRes = await client.get("/wallets");
    const existing = existingRes.data.data?.find(w => w.address.toLowerCase() === addr.toLowerCase());
    if (existing) {
      walletId = existing.id;
    } else {
      const chainRes = await client.get("/chains").catch(() => null);
      const dbChain = chainRes?.data?.data?.find(c => c.type === "SOLANA");
      const walletRes = await client.post("/wallets", {
        label: "Solana Wallet", address: addr, chainId: dbChain?.id || "SPL", provider: "PHANTOM",
      });
      walletId = walletRes.data.data.id;
    }
  }

  let payloadBase64;
  if (flow.action === "link") {
    const res = await client.post("/wallets/link-payload", { walletIds: [walletId], capUSDT: flow.capUSDT });
    payloadBase64 = res.data.data.payloads.SPL.transaction;
  } else if (flow.action === "deposit-approve") {
    const res = await client.post("/wallets/deposit-approval-payload", { walletId, capUSDC: flow.capUSDC });
    payloadBase64 = res.data.data.payload.transaction;
  } else {
    const res = await client.post(`/wallets/${walletId}/unlink-payload`);
    payloadBase64 = res.data.data.payload.transaction;
  }

  setFlow({ ...flow, walletId, stage: "signing" });
  window.location.href = buildSignTransactionUrl(payloadBase64);
}
