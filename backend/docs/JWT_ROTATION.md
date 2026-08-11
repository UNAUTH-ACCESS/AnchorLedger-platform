# JWT Secret Rotation

How to rotate `JWT_SECRET` or `JWT_REFRESH_SECRET` without force-logging out
every active session. Do this if a secret may have leaked, or on a routine
schedule.

## How it works

`lib/jwt.js` signs new tokens with only the *current* secret, but verifies
against the current secret first and falls back to a `*_PREVIOUS` secret if
one is set and current fails. So during a rotation window, tokens issued
under the old secret keep working until they naturally expire or get
refreshed (which re-signs them under the new secret) — nothing gets
invalidated all at once.

Access tokens live 15 minutes (`JWT_EXPIRES_IN`), refresh tokens 7 days
(`JWT_REFRESH_EXPIRES_IN`). The refresh token's DB row (`refresh_tokens`
table) is checked by exact string match, independent of which secret signed
it — rotating the secret never invalidates that table.

## Procedure — rotate `JWT_SECRET`

1. Generate a new secret:
   ```
   openssl rand -hex 32
   ```
2. In `~/quantedge/.env`, set `JWT_SECRET_PREVIOUS` to the **current**
   value of `JWT_SECRET` (the one about to be replaced).
3. Set `JWT_SECRET` to the newly generated value.
4. Restart the api container:
   ```
   cd ~/quantedge && docker compose up -d api
   ```
   From this point: new access tokens sign with the new secret; existing
   sessions keep authenticating via the `_PREVIOUS` fallback.
5. Wait at least 7 days (`JWT_REFRESH_EXPIRES_IN`) — the longest any
   session issued before step 4 can still be relying on the old secret.
   After that, every session has either refreshed (now on the new secret)
   or fully expired.
6. Remove `JWT_SECRET_PREVIOUS` from `.env` entirely (don't leave it set to
   an empty string — unset the line) and restart the api container again.
   **This step is what actually finishes the rotation.** Skipping it
   leaves the old secret silently valid indefinitely.

## Procedure — rotate `JWT_REFRESH_SECRET`

Same 4 steps, substituting `JWT_REFRESH_SECRET` / `JWT_REFRESH_SECRET_PREVIOUS`.
Independent of the access-token rotation above — you don't have to do both
at once, though the normal case is rotating both together.

## Verifying a rotation actually took

- `docker logs quantedge_api --tail 20` after the restart — clean boot,
  no config errors (`assertApiConfig()` fails fast at startup if a secret
  is malformed, so a bad rotation shows up immediately, not later).
- Confirm a session that was active *before* the restart still works:
  hit `GET /api/v1/auth/me` with a token/cookie obtained before the
  rotation. Should still return `200`.
- Confirm a *fresh* login after the restart also works normally.
