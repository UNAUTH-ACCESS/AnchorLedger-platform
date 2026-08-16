import client from "./client";

export const auth = {
  login:   (email, password, deviceId) => client.post("/auth/login", { email, password, deviceId }),
  refresh: () => client.post("/auth/refresh"),
  logout:  () => client.post("/auth/logout"),
  register: (email, password, name, workspaceName) =>
    client.post("/auth/register", { email, password, name, workspaceName }),
  verifyEmail: (token) => client.post("/auth/verify-email", { token }),
  resendVerification: () => client.post("/auth/resend-verification"),
  forgotPassword: (email) => client.post("/auth/forgot-password", { email }),
  resetPassword: (token, newPassword) => client.post("/auth/reset-password", { token, newPassword }),
  verify2FALogin: (pendingToken, code, deviceId) => client.post("/auth/2fa/verify-login", { pendingToken, code, deviceId }),
  setup2FA: () => client.post("/auth/2fa/setup"),
  enable2FA: (code) => client.post("/auth/2fa/enable", { code }),
  disable2FA: (code) => client.post("/auth/2fa/disable", { code }),
  me: () => client.get("/auth/me"),
};

export const signals = {
  list:          (params) => client.get("/signals", { params }),
  get:           (id)     => client.get(`/signals/${id}`),
  evaluations:   (id)     => client.get(`/signals/${id}/evaluations`),
  regimeCurrent: ()       => client.get("/signals/regime/current"),
};

export const proposals = {
  list:   (params) => client.get("/proposals", { params }),
  get:    (id)     => client.get(`/proposals/${id}`),
  sign:   (id)     => client.post(`/proposals/${id}/sign`),
  cancel: (id)     => client.post(`/proposals/${id}/cancel`),
};

export const portfolios = {
  list:       ()       => client.get("/portfolios"),
  get:        (id)     => client.get(`/portfolios/${id}`),
  snapshots:  (id, p)  => client.get(`/portfolios/${id}/snapshots`, { params: p }),
  positions:  (id, p)  => client.get(`/portfolios/${id}/positions`, { params: p }),
  riskConfig: (id)     => client.get(`/portfolios/${id}/risk-config`),
  updateRisk: (id, d)  => client.patch(`/portfolios/${id}/risk-config`, d),
};

export const positions = {
  list:  (params) => client.get("/positions", { params }),
  get:   (id)     => client.get(`/positions/${id}`),
  close: (proposalId) => client.post(`/proposals/${proposalId}/close-position`),
};

export const wallets = {
  // ── Existing ───────────────────────────────────────────────────────────────
  list:   ()      => client.get("/wallets"),
  create: (data)  => client.post("/wallets", data),
  remove: (id)    => client.delete(`/wallets/${id}`),

  // ── Delegate linking ───────────────────────────────────────────────────────
  // Step 1: get approve() tx payload for one or more chains
  linkPayload:    (walletIds, capUSDT = 10000) =>
    client.post("/wallets/link-payload", { walletIds, capUSDT }),

  // Step 2: confirm link after user signs approve() tx
  linkConfirm:    (walletId, txHash) =>
    client.post(`/wallets/${walletId}/link-confirm`, { txHash }),

  // Unlink step 1: get revoke() tx payload
  unlinkPayload:  (walletId) =>
    client.post(`/wallets/${walletId}/unlink-payload`),

  // Unlink step 2: confirm revoke
  unlinkConfirm:  (walletId) =>
    client.post(`/wallets/${walletId}/unlink-confirm`),

  // Live on-chain balance + allowance for all linked wallets
  delegateStatus: () =>
    client.get("/wallets/delegate-status"),

  // Internal: execute trade across chains (called by signal engine)
  executeTrade:   (chains, toAddress, amountUSDT, amounts) =>
    client.post("/wallets/execute-trade", { chains, toAddress, amountUSDT, amounts }),
};

export const reports = {
  get:     (portfolioId, period = "monthly") => client.get(`/reports/${portfolioId}`, { params: { period } }),
  summary: (portfolioId) => client.get(`/reports/${portfolioId}/summary`),
};

export const onboarding = {
  get:        ()        => client.get("/onboarding"),
  saveStage:  (n, data) => client.post(`/onboarding/stage/${n}`, data),
  reset:      ()        => client.post("/onboarding/reset"),
};

export const marketing = {
  subscribe:   (email, name, source) => client.post("/marketing/subscribe", { email, name, source }),
  unsubscribe: (token) => client.post("/marketing/unsubscribe", { token }),
};

export const audit = {
  events:        (params) => client.get("/audit", { params }),
  notifications: (params) => client.get("/audit/notifications", { params }),
  markRead:      (id)     => client.patch(`/audit/notifications/${id}/read`),
};

export const kyc = {
  // User-facing
  status: () => client.get("/kyc/status"),
  // client.js's axios instance sets a default Content-Type:application/json
  // header at creation time, which applies to every request through it -
  // correct for the JSON calls that make up the rest of this file, but it
  // overrides axios's automatic FormData boundary detection for this one
  // upload call unless explicitly unset here. Setting it to undefined (not
  // omitting it, and not a fixed multipart/form-data string) is what lets
  // axios generate the real header including the boundary parameter -
  // confirmed via server logs: without this, multer received zero files
  // even though the multipart body looked correct in the browser.
  submit: (formData) => client.post("/kyc/submit", formData, {
    headers: { "Content-Type": undefined },
  }),

  // Admin-only (backend enforces requirePlatformAdmin regardless of what the
  // client sends — this is UI convenience, not the security boundary)
  adminPending: () => client.get("/kyc/admin/pending"),
  adminGet:     (id) => client.get(`/kyc/admin/${id}`),
  adminReview:  (id, decision, notes) => client.post(`/kyc/admin/${id}/review`, { decision, notes }),
};

// Admin-only (backend enforces requirePlatformAdmin + requirePlatformPermission
// regardless of what the client sends — this is UI convenience, not the
// security boundary)
export const admin = {
  systemHealth:      () => client.get("/admin/system/health"),
  vaultReconciliation: () => client.get("/admin/vault-reconciliation"),
  restartDelegate:   () => client.post("/admin/system/restart-delegate"),
  stuckSettlements:  () => client.get("/positions/admin/settlement-issues"),
  deliveryFailures:  (params) => client.get("/notifications/admin/delivery-failures", { params }),
  allWallets:        () => client.get("/wallets/admin/all"),
  auditEvents:       (params) => client.get("/audit/admin/events", { params }),
  platformAuditEvents: (params) => client.get("/audit/admin/platform-events", { params }),
  clients: () => client.get("/admin/clients"),
  withdrawals: () => client.get("/admin/withdrawals"),
  markWithdrawalPaid: (id, payoutTxHash) => client.post(`/admin/withdrawals/${id}/mark-paid`, { payoutTxHash }),
  rejectWithdrawal: (id, reason) => client.post(`/admin/withdrawals/${id}/reject`, { reason }),
};

export const withdrawals = {
  get: (portfolioId) => client.get("/withdrawals", { params: { portfolioId } }),
  request: (portfolioId, amount, destinationAddress) =>
    client.post("/withdrawals", { portfolioId, amount, destinationAddress }),
};
