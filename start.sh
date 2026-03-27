#!/bin/sh
set -e

AGENT="${AGENT_NAME:-orchestrator}"
echo "[start.sh] Starting agent: $AGENT"

case "$AGENT" in
  orchestrator)
    exec node agents/orchestrator/index.js daemon
    ;;
  content-seo|content_seo)
    exec node agents/content-seo/index.js
    ;;
  email-nurture|email_nurture|emille_email)
    exec node agents/email-nurture/index.js daemon
    ;;
  gmb-agent|gmb_agent)
    exec node agents/gmb-agent/index.js
    ;;
  intelligence|roger)
    exec node agents/intelligence/index.js
    ;;
  lead-scoring|lead_scoring)
    exec node agents/lead-scoring/index.js
    ;;
  notifications|notification_sms)
    exec node agents/notifications/sms.js process
    ;;
  paid-ads|paid_ads|peter_paid_ads)
    exec node agents/paid-ads/index.js
    ;;
  referral|referral_agent)
    exec node agents/referral/index.js
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
