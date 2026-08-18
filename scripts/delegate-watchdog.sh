#!/bin/bash
# delegate-watchdog.sh
#
# delegate-server has died silently multiple times with nothing alerting
# anyone. Runs from cron every few minutes: if pm2 doesn't report it
# "online", restart it and email the founder via Resend so a silent death
# turns into a page instead.

set -uo pipefail

export PATH="/usr/bin:$PATH"
PM2_BIN="/usr/bin/pm2"
APP_NAME="delegate-server"
ENV_FILE="/home/solana/quantedge/.env"
LOG_FILE="/home/solana/quantedge-delegate/watchdog.log"
LOCK_FILE="/tmp/delegate-watchdog.lock"
ALERT_EMAIL="appointments.douglaseze@gmail.com"

exec 200>"$LOCK_FILE"
flock -n 200 || exit 0

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

RESEND_API_KEY=$(grep -E '^RESEND_API_KEY=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)
FROM_EMAIL=$(grep -E '^FROM_EMAIL=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)

send_alert() {
  local subject="$1"
  local body="$2"

  if [ -z "$RESEND_API_KEY" ]; then
    log "ERROR: RESEND_API_KEY not found in $ENV_FILE — cannot send alert email"
    return 1
  fi

  local payload
  payload=$(jq -n --arg from "$FROM_EMAIL" --arg to "$ALERT_EMAIL" --arg subject "$subject" --arg text "$body" \
    '{from: $from, to: [$to], subject: $subject, text: $text}')

  local http_code
  http_code=$(curl -s -o /tmp/delegate-watchdog-resend-resp.json -w "%{http_code}" -X POST "https://api.resend.com/emails" \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$payload")

  if [ "$http_code" = "200" ]; then
    log "Alert email sent to $ALERT_EMAIL (subject: $subject)"
  else
    log "ERROR: Resend API returned HTTP $http_code — $(cat /tmp/delegate-watchdog-resend-resp.json 2>/dev/null)"
  fi
}

JLIST=$("$PM2_BIN" jlist 2>>"$LOG_FILE")
if [ $? -ne 0 ]; then
  log "ERROR: '$PM2_BIN jlist' failed to run"
  send_alert "delegate-server watchdog: pm2 unreachable" \
    "The watchdog on $(hostname) could not run 'pm2 jlist' at all at $(date '+%Y-%m-%d %H:%M:%S %Z'). delegate-server's status is unknown — please check the box directly."
  exit 1
fi

STATUS=$(echo "$JLIST" | jq -r --arg name "$APP_NAME" '.[] | select(.name==$name) | .pm2_env.status' | head -1)

if [ -z "$STATUS" ]; then
  log "ERROR: $APP_NAME not found in pm2 process list"
  send_alert "delegate-server missing from pm2" \
    "delegate-server does not appear in 'pm2 jlist' at all on $(hostname) as of $(date '+%Y-%m-%d %H:%M:%S %Z'). Manual intervention required."
  exit 1
fi

if [ "$STATUS" != "online" ]; then
  log "$APP_NAME status is '$STATUS' — restarting"
  "$PM2_BIN" restart "$APP_NAME" >> "$LOG_FILE" 2>&1
  sleep 3
  NEW_STATUS=$("$PM2_BIN" jlist | jq -r --arg name "$APP_NAME" '.[] | select(.name==$name) | .pm2_env.status' | head -1)
  log "$APP_NAME restarted — new status: $NEW_STATUS"
  send_alert "delegate-server was down and has been restarted" \
    "delegate-server was found in status '$STATUS' at $(date '+%Y-%m-%d %H:%M:%S %Z') on $(hostname) and 'pm2 restart delegate-server' was issued automatically.

Post-restart status: $NEW_STATUS

Check 'pm2 logs delegate-server' and $LOG_FILE for the root cause."
fi
