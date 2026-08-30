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
- RAM is tight: 1.9 GiB total, dockerd ~1 GB RSS, this Claude session ~300 MB standing,
  swap normally ~1.3/2.5 GiB used. Check `free -h` before any `docker compose build`;
  build one service at a time. Real fix (not yet done): move builds to CI, push finished images.

## Topology

| Component | Runs on | Managed by |
|---|---|---|
| delegate-server | HOST (not Docker) | PM2, name `delegate-server`; containers reach it via `host.docker.internal` (host-gateway, never a hardcoded bridge IP) |
| api / worker / frontend / nginx / postgres | Docker | `docker compose`, containers `anchorledger_*` (postgres still `quantedge_postgres`) |
| delegate-server watchdog | HOST | cron, `scripts/delegate-watchdog.sh` — **must stay committed to git** |
| Claude Code (server-side) | HOST | tmux session + `/remote-control`. If gone: `tmux ls`; if nothing, `tmux new -s claude` → `claude` → `/remote-control`. |

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
