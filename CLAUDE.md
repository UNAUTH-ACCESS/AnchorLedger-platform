# Anchor Ledger — operational context

> This repo directory is still named `~/quantedge` on disk; the GitHub remote is
> `UNAUTH-ACCESS/anchorledger-platform`. Delegate repo: `~/quantedge-delegate` →
> `UNAUTH-ACCESS/anchorledger-delegate`. Same project, pre-rename name was QuantEdge
> (renamed Aug 2026 after a trademark dispute — Quantedge Capital Pte. Ltd. holds the mark).

## What this is

Anchor Ledger — a **non-custodial** multi-chain algorithmic trading platform
(Solana / Ethereum / Tron). Trading is **simulated**: real price data, no order is
placed on any venue (disclosed in the ToS).

Non-custodial means: a user grants a **capped, on-chain, user-revocable delegate
approval**. The platform can move funds only up to that cap; the user can revoke
on-chain anytime. This is a legal/product distinction, not an implementation
detail — no feature may quietly turn it into custody.

## Server

- Linode VPS, IP `139.162.181.164`, single box, rebuilt Aug 2026.
- Ops user `solana` (uid 1000, sudo + docker). Non-root. **Key-only SSH; root login disabled.**
- `sudo` requires a TTY here — non-interactive `sudo` fails. For `dmesg`/log checks
  the user must run the command themselves (`! <cmd>` in the Claude prompt).
- RAM is tight: 1.9 GiB total. dockerd creeps toward ~1 GB RSS over weeks (leak /
  build-cache bookkeeping) — `systemctl restart docker` reclaims it back to ~150 MB;
  do this if `free -h` shows the box thrashing. Each Claude session adds ~300 MB standing.
- **Image builds now run in CI** (`.github/workflows/build-images.yml`) and push to GHCR;
  the VPS only `docker compose pull`s. Deploy with `./scripts/deploy.sh` (pull + prisma
  migrate deploy + `up -d` + prune). `build:` blocks stay in docker-compose.yml as a
  local fallback — if you must build on the box, `free -h` first, one service at a time,
  and note dockerd needs a restart afterward to release the build memory.
- Every compose service has `mem_limit` / `pids_limit` (ceilings, not reservations) so
  one runaway can't OOM the box. Backend image is ~470 MB (multi-stage, `--omit=dev`),
  runs as the non-root `node` user (uid 1000 = host `solana`, so bind-mounted
  `storage/kyc-docs` files land 1000:1000).
- **nginx config lives in `nginx/active.conf` (bind-mounted as a single file).** Editing it
  in an editor swaps the inode, so the running container keeps serving the old file — after
  any change run `docker compose up -d --force-recreate nginx` (brief blip on all vhosts),
  not `nginx -s reload`. `server_tokens off` + a conservative app-origin CSP are set here.
- Frontend bundle is route-split (`React.lazy` + `manualChunks`): the wallet SDKs
  (`@solana/web3.js`, `tronweb`, `@tronweb3`) load only on `/wallets` and `/onboarding`,
  not the marketing path. Don't add a static import of those from an eager module, and
  don't give the wallet libs a *named* `manualChunks` entry (Vite then modulepreloads it).
- **Frontend serving moved off the VPS to GitHub Pages (2026-09-12).** `.github/workflows/
  deploy-pages.yml` builds `frontend/` and publishes to `unauth-access.github.io/
  AnchorLedger-platform` on every push touching it — including a `404.html` (copy of
  `index.html`) for the SPA client-route fallback (Pages has no server-side rewrite).
  `nginx/active.conf`'s `location /` for anchorledger.space proxies there instead of to
  the local `frontend` container — same origin from the browser's POV, no CORS/cookie
  changes needed. Two things that only surfaced during cutover, don't re-break them:
  - `resolver ... ipv6=off` is required — this container's docker network has no IPv6
    route (the host does, the bridge doesn't), so unauth-access.github.io's AAAA records
    fail instantly and, uncorrected, exhaust nginx's retries.
  - Pages' extensionless-path redirects (`/blog` → `/blog/`) must stay intercepted
    (`error_page 301 302 = @pages_dir_index`, refetching `<path>/index.html` directly) —
    otherwise the raw `github.io` origin leaks into the client's Location header.
  The local `frontend` container is still built/deployed and left running, unused, as an
  immediate rollback (`docker compose start frontend` is redundant, it's already up —
  just swap `location /`'s `proxy_pass` back to `$upstream_frontend`).

## Topology

| Component | Runs on | Managed by |
|---|---|---|
| delegate-server | HOST (not Docker) | PM2, name `delegate-server`; containers reach it via `host.docker.internal` (host-gateway, never a hardcoded bridge IP) |
| api / worker / frontend / nginx / postgres | Docker | `docker compose`, containers `anchorledger_*` (postgres still `quantedge_postgres`) |
| delegate-server watchdog | HOST | cron `*/5`, `scripts/delegate-watchdog.sh` — **must stay committed to git** |
| Claude Code (server-side) | HOST | tmux session + `/remote-control`. If gone: `tmux ls`; if nothing, `tmux new -s claude` → `claude` → `/remote-control`. |

delegate-server is defined by `ecosystem.config.js` in the delegate repo (`max_memory_restart`
200M, `max_restarts` 10). Apply changes with `pm2 startOrReload ecosystem.config.js && pm2 save`.

## The core operating principle

**Never trust a status claim about consequential state — verify it directly, every time.**

- Git: `git log --oneline --decorate -3` must show `(HEAD -> <branch>, origin/<branch>)`
  **on the same line**. A clean working tree does NOT mean pushed. (platform branch: `master`;
  delegate branch: `main`.)
- On-chain: query the chain directly (`getAccount`, `spl-token accounts --verbose`).
  Never trust `delegateApproved` or any DB flag as ground truth.
- Deploys: check the running container's actual env (`docker exec <svc> printenv | grep VAR`)
  and image build time vs. when the code changed. A "deployed" claim with a stale image = not deployed.
- Email: check the provider's delivery dashboard, not "no error thrown."

The two recurring failure modes: **config mismatch** (env var not propagated to where
it's read) and **trusting "should work" instead of verifying**.

## Financial / security-sensitive changes — required sequence

Anything touching real money, real keys, or real user data (mainnet txns, keystore/
passphrase generation, DB writes to financial tables, SSH/auth hardening):

1. **Investigate and report a plan before writing code** — what changes, how it's tested.
2. **Test the mechanism in isolation first** (crypto round-trip proof; throwaway keypair before a real vault).
3. **Explicit human go-ahead immediately before the irreversible step** — sending funds,
   disabling password auth, `docker volume rm`, a Linode Rebuild. A clean plan is not authorization to execute.
4. **Verify the result against ground truth afterward**, not just "no error."

## Non-custodial design traps (already hit and fixed)

- **One transaction cannot reference two blockchain clusters.** Devnet USDT and mainnet
  USDC must never share a `Connection` or a transaction object. `USDCMainnetExecutor.js`
  is a fully separate module. Two chains ⇒ two transactions, two connections, structurally.
- **Real deposited money must never be exposed to simulated trading results.** Real deposits
  sit untouched in `SOLANA_DEPOSIT_VAULT`; the simulated engine reads only an internal
  ledger credit (`PortfolioSnapshot.cash`).

## Database

- Prisma `DATABASE_URL` needs `?connection_limit=10&pool_timeout=20` on this box.
- Raw SQL: `docker exec quantedge_postgres psql -U <user> -d <db> -c "..."`; columns are
  camelCase (escape as `\"delegateApproved\"`). Prisma model names differ from tables via
  `@@map` (e.g. `PlatformAdmin` → `platform_admins`) — check `schema.prisma` before assuming a table is missing.
- Schema is on tracked migrations (`backend/prisma/migrations/`, baselined `0_baseline`).
  Use `npm run db:migrate` / `db:migrate:prod`, not `db push`.

## Open items to verify, never assume

- **CI is committed but not yet live**: `.github/workflows/build-images.yml` needs
  `gh auth login` done once (interactive, by the user) and the first run to succeed +
  the GHCR packages made public (or a `docker login ghcr.io` on the box). Until then,
  `docker compose build` on the box is still the deploy path.
- **delegate-server `/health` reports `degraded`** because the SPL (devnet MockUSDT
  *trading*) executor can't load `server/solana-deployment.json` — that file has never
  existed on this box and there's no devnet Solana validator in prod. Expected: SPL
  trading is retired (`TRADING_CHAINS = ["TRC20"]`; the `/wallets` page no longer offers
  a Solana trading card), and the real Solana money path (`SPL_USDC_MAINNET`, deposit
  sweep) is `available: true`. Don't chase it as a regression.
- **`clients.routes.js` admin metric** filters deposits on `status === "MINTED"` for
  "totalDeposited" — MINTED is a transient mid-flow state; this almost certainly should
  be `COMPLETE`. Pre-existing, not yet fixed.
- **App-origin CSP is deliberately loose** (`script-src`/`style-src`/`connect-src` allow
  `https:` + `'unsafe-inline'` + `'unsafe-eval'`) so the consent-gated PostHog/Smartsupp
  integrations can't be broken by it. A real source-list CSP is a separate, browser-tested
  job — the current one only enforces the structural directives.
- **Backups**: automated offsite backups were deferred at the last rebuild. Nightly
  `~/backups/quantedge-*.sql.gz` dumps exist locally — confirm a recent one is real before
  trusting it, and there is no verified offsite copy.
- **SSH hardening**: confirm `PermitRootLogin` / `PasswordAuthentication` in
  `/etc/ssh/sshd_config` — they have lagged/reverted before.
- **Public domain**: has churned through several stopgaps. `curl -sI https://<domain>`
  to confirm which is live. Resend/email needs a real owned domain — DuckDNS can't host DKIM/SPF.

## Reference material

Deeper playbooks live in the `anchor-ledger-ops` skill
(`~/.claude/skills/anchor-ledger-ops/references/`): incident recovery (Linode Rescue/Lish,
SSH hardening sequencing), wallet integration (per-chain quirks, mobile deep-link/interruption),
financial flows (deposit sweep, mainnet-USDC isolation, withdrawal lifecycle), chain deployment
(key rotation, mint deployment, devnet/mainnet separation).
