#!/bin/sh
set -e

AGENT="${AGENT_NAME:-orchestrator}"
echo "[start.sh] Starting agent: $AGENT"

case "$AGENT" in
  orchestrator)
    exec node agents/orchestrator/index.js daemon
    ;;
  content-seo|content_seo)
    exec node agents/content-seo/index.js daemon
    ;;
  email-nurture|email_nurture|emille_email)
    exec node agents/email-nurture/index.js daemon
    ;;
  gmb-agent|gmb_agent)
    exec node agents/gmb-agent/index.js daemon
    ;;
  intelligence|roger)
    exec node agents/intelligence/index.js daemon
    ;;
  lead-scoring|lead_scoring)
    exec node agents/lead-scoring/index.js daemon
    ;;
  notifications|notification_sms)
    echo '[start.sh] SMS agent disabled — sleeping forever'
    exec sleep infinity
    ;;
  paid-ads|paid_ads|peter_paid_ads)
    exec node agents/paid-ads/index.js daemon
    ;;
  referral|referral_agent)
    exec node agents/referral/index.js daemon
    ;;
  dashboard)
    echo "[start.sh] Serving dashboard on port ${PORT:-3000}"
    exec npx serve dashboard/dist -l "${PORT:-3000}" -s
    ;;
  *)
    echo "[start.sh] Unknown AGENT_NAME: $AGENT - defaulting to orchestrator"
    exec node agents/orchestrator/index.js daemon
    ;;
esac
