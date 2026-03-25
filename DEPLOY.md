# Railway Deployment Guide

## Architecture

Each agent runs as a separate Railway service with its own Dockerfile, sharing the same environment variables. This gives each agent independent scaling, logging, and restart behavior.

| Service | Dockerfile | Schedule |
|---------|-----------|----------|
| GMB Agent | `Dockerfile.gmb-agent` | Reviews every 2h, GMB posts every 8h |
| Lead Scoring | `Dockerfile.lead-scoring` | Scores leads every 15min |
| Referral Agent | `Dockerfile.referral` | Full cycle every 12h |
| SMS Processor | `Dockerfile.sms-processor` | Checks notification_queue every 60s |

## Setup Steps

### 1. Push to GitHub

```bash
git init
git add -A
git commit -m "Initial commit: AI Marketing OS"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Create Railway Project

1. Go to [railway.app](https://railway.app) and create a new project
2. Connect your GitHub repo

### 3. Create Services

For each agent, create a new service in the Railway project:

**GMB Agent:**
- New Service > GitHub Repo
- Settings > Build > Dockerfile Path: `Dockerfile.gmb-agent`

**Lead Scoring:**
- New Service > GitHub Repo
- Settings > Build > Dockerfile Path: `Dockerfile.lead-scoring`

**Referral Agent:**
- New Service > GitHub Repo
- Settings > Build > Dockerfile Path: `Dockerfile.referral`

**SMS Processor:**
- New Service > GitHub Repo
- Settings > Build > Dockerfile Path: `Dockerfile.sms-processor`

### 4. Set Environment Variables

Add these to the Railway project (shared across all services):

```
SUPABASE_URL=https://zilgxvcrzlxuqcktemyl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
ANTHROPIC_API_KEY=<your-anthropic-api-key>
FOLLOWUPBOSS_API_KEY=<your-fub-api-key>
TWILIO_ACCOUNT_SID=<your-twilio-sid>
TWILIO_AUTH_TOKEN=<your-twilio-auth-token>
TWILIO_FROM_NUMBER=+18336694356
BEN_PHONE_NUMBER=+18474529675
GMB_ACCOUNT_ID=<your-gmb-account-id>
GMB_LOCATION_ID=<your-gmb-location-id>
GMB_ACCESS_TOKEN=<your-gmb-access-token>
ZILLOW_SCREEN_NAME=<your-zillow-screen-name>
ZILLOW_ZWS_ID=<your-zillow-zws-id>
FACEBOOK_PAGE_ID=<your-facebook-page-id>
FACEBOOK_PAGE_ACCESS_TOKEN=<your-facebook-page-token>
```

### 5. Deploy

Railway auto-deploys on push to main. Each service builds and starts independently.

## Monitoring

- **Railway Logs**: Each service has its own log stream in the Railway dashboard
- **Supabase agent_logs**: All agent actions are logged with timestamps and durations
- **notification_queue**: Check for pending/failed notifications

## Costs

- Railway: ~$5-10/month per service (Worker type, no inbound traffic)
- Anthropic API: Variable based on agent run frequency
- Twilio: Per-SMS pricing on your plan
