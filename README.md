# Ben Lalez Team AI Marketing Operating System

An autonomous AI marketing system for a top Chicago real estate team at Compass. 8 AI agents run 24/7 with one goal: **drive closings**.

## Architecture

All agents use the Claude Agent SDK (tool-use loop), log everything to Supabase, and coordinate through shared tables. Ben reviews and approves — never builds.

## Agents

| # | Agent | Directory | Schedule | What It Does |
|---|-------|-----------|----------|--------------|
| 1 | **Orchestrator** | `agents/orchestrator/` | Every 30min | Monitors all agents, manages tasks, sends daily reports, escalates issues |
| 2 | **Referral** | `agents/referral/` | Every 12h | Mines past clients for referrals, anniversary outreach, high-value alerts |
| 3 | **Content SEO** | `agents/content-seo/` | Blog 8h / Social 4h | Publishes WordPress blog posts, schedules Buffer social media |
| 4 | **Email Nurture** | `agents/email-nurture/` | Tasks 10min / Drip 6h | Sends personalized emails (SendGrid) and SMS (Twilio), processes tasks |
| 5 | **Paid Ads** | `agents/paid-ads/` | Monitor 4h / Optimize 12h | Manages Google Ads + Meta campaigns, optimizes spend |
| 6 | **GMB Agent** | `agents/gmb-agent/` | Reviews 2h / Posts 8h | Monitors Google/Zillow/Facebook reviews, publishes GMB posts |
| 7 | **Lead Scoring** | `agents/lead-scoring/` | Every 15min | Scores leads 0-100, SMS alerts Ben for hot leads (80+) |
| 8 | **Intelligence** | `agents/intelligence/` | Every 6h | Researches market trends, competitors, neighborhoods |
| - | **SMS Processor** | `agents/notifications/` | Every 60s | Sends pending notifications from queue via Twilio |
| - | **Dashboard** | `dashboard/` | Always on | React app — agent status, KPIs, notifications, content feed |

## Supabase Tables

| Table | Purpose |
|-------|---------|
| `agent_logs` | Every agent action, API call, error |
| `agent_tasks` | Inter-agent task queue |
| `lead_intelligence` | Enriched lead data + AI scoring |
| `content_performance` | All content across all channels |
| `brand_memory` | Voice rules, templates, brand elements |
| `shared_intelligence` | Cross-agent knowledge sharing |
| `notification_queue` | Alerts and approvals for Ben |

## Running Locally

```bash
# Single agent run
node agents/orchestrator/index.js
node agents/lead-scoring/index.js
node agents/gmb-agent/index.js

# Daemon mode (continuous)
node agents/orchestrator/index.js daemon

# Mock tests (no API keys needed except Supabase)
node agents/gmb-agent/mock-run.js
node agents/lead-scoring/mock-run.js
node agents/referral/mock-run.js

# SMS processor
node agents/notifications/sms.js process

# Dashboard
cd dashboard && npm run dev
```

## Deploy to Railway

```bash
# 1. Push to GitHub
git init && git add -A && git commit -m "Initial commit"
git remote add origin <your-repo-url>
git push -u origin main

# 2. Install Railway CLI
npm install -g @railway/cli
railway login

# 3. Create project and link
railway init
railway link

# 4. Create services (one per Dockerfile)
# In Railway dashboard: New Service > GitHub Repo > Set Dockerfile path
# Repeat for each: Dockerfile.orchestrator, Dockerfile.lead-scoring, etc.

# 5. Set environment variables in Railway dashboard (shared across services)
```

## Required Credentials

### Already Configured
| Service | Variable | Status |
|---------|----------|--------|
| Supabase | `SUPABASE_URL` | Set |
| Supabase | `SUPABASE_SERVICE_ROLE_KEY` | Set |
| Twilio | `TWILIO_ACCOUNT_SID` | Set |
| Twilio | `TWILIO_AUTH_TOKEN` | Set |
| Twilio | `TWILIO_FROM_NUMBER` | Set |
| Twilio | `BEN_PHONE_NUMBER` | Set |

### Needs Configuration
| Service | Variable | Agent(s) |
|---------|----------|----------|
| Anthropic | `ANTHROPIC_API_KEY` | All agents |
| Follow Up Boss | `FOLLOWUPBOSS_API_KEY` | Lead Scoring |
| ActiveCampaign | `ACTIVECAMPAIGN_API_URL` | Email Nurture |
| ActiveCampaign | `ACTIVECAMPAIGN_API_KEY` | Email Nurture |
| SendGrid | `SENDGRID_API_KEY` | Email Nurture |
| SendGrid | `SENDGRID_FROM_EMAIL` | Email Nurture |
| WordPress | `WORDPRESS_URL` | Content SEO |
| WordPress | `WORDPRESS_USERNAME` | Content SEO |
| WordPress | `WORDPRESS_APP_PASSWORD` | Content SEO |
| Buffer | `BUFFER_ACCESS_TOKEN` | Content SEO |
| Google Ads | `GOOGLE_ADS_DEVELOPER_TOKEN` | Paid Ads |
| Google Ads | `GOOGLE_ADS_CLIENT_ID` | Paid Ads |
| Google Ads | `GOOGLE_ADS_CLIENT_SECRET` | Paid Ads |
| Google Ads | `GOOGLE_ADS_REFRESH_TOKEN` | Paid Ads |
| Google Ads | `GOOGLE_ADS_CUSTOMER_ID` | Paid Ads |
| Meta Ads | `META_ACCESS_TOKEN` | Paid Ads |
| Meta Ads | `META_AD_ACCOUNT_ID` | Paid Ads |
| Google My Business | `GMB_ACCOUNT_ID` | GMB Agent |
| Google My Business | `GMB_LOCATION_ID` | GMB Agent |
| Google My Business | `GMB_ACCESS_TOKEN` | GMB Agent |
| Zillow | `ZILLOW_SCREEN_NAME` | GMB Agent |
| Zillow | `ZILLOW_ZWS_ID` | GMB Agent |
| Facebook | `FACEBOOK_PAGE_ID` | GMB Agent |
| Facebook | `FACEBOOK_PAGE_ACCESS_TOKEN` | GMB Agent |
| Serper (optional) | `SERPER_API_KEY` | Intelligence |
# Dashboard fix: use Dockerfile.dashboard
