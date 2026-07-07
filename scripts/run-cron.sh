#!/usr/bin/env sh
# Cron runner for Railway scheduled services.
#
# Usage: run-cron.sh <path>
#   run-cron.sh /api/cron/sf-sync
#   run-cron.sh /api/cron/leadiq-sync
#   run-cron.sh /api/cron/industry-intel
#
# Required env vars on the cron service:
#   APP_URL      base URL of the web service (e.g. https://renewal-intelligence.up.railway.app
#                or the private-network URL http://web.railway.internal:3000)
#   CRON_SECRET  same value as on the web service
set -eu

PATH_TO_CALL="${1:?usage: run-cron.sh <path>}"
: "${APP_URL:?APP_URL must be set}"
: "${CRON_SECRET:?CRON_SECRET must be set}"

echo "Triggering ${APP_URL}${PATH_TO_CALL} ..."
HTTP_CODE=$(curl -sS -o /tmp/cron-response.json -w '%{http_code}' \
  --max-time 900 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL}${PATH_TO_CALL}")

cat /tmp/cron-response.json
echo ""

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "OK (${HTTP_CODE})"
  exit 0
fi
echo "FAILED (${HTTP_CODE})" >&2
exit 1
