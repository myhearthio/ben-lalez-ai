# Agent 6: Reputation & Google My Business Agent

The GMB Agent monitors reviews across Google, Zillow, and Facebook and publishes 3 Google My Business posts per week. It uses the Claude Agent SDK to autonomously decide what to check, when to post, and how to draft responses.

## What It Does

### Review Monitoring (every 2 hours)
- Checks Google My Business, Zillow, and Facebook for new reviews
- Logs every review to `agent_logs` in Supabase
- For 1-3 star reviews: drafts a professional response and creates a Tier 1 (critical) notification in `notification_queue` for Ben to approve
- For 4-5 star reviews: logs them and continues

### GMB Posting (3x per week)
- Tracks posts published this week in `content_performance`
- Publishes up to 3 posts per week, rotating topics:
  - Market updates (Chicago neighborhoods, pricing trends)
  - Team highlights and recent closings
  - Community content and neighborhood spotlights
  - Buyer/seller tips
  - Just listed / just sold
- Pulls market intelligence from `shared_intelligence` (populated by other agents)
- Follows brand voice from `brand_memory`

## Running

```bash
# Single full cycle (review check + post if needed)
node agents/gmb-agent/index.js

# Single review check only
node agents/gmb-agent/index.js review_check

# Single GMB post check only
node agents/gmb-agent/index.js gmb_post

# Daemon mode (continuous: reviews every 2h, posts every 8h)
node agents/gmb-agent/index.js daemon
```

## Required Environment Variables

These must be set in `.env` (local) or Railway (production):

### Supabase (required)
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key

### Anthropic (required)
- `ANTHROPIC_API_KEY` — Claude API key

### Google My Business (required)
- `GMB_ACCOUNT_ID` — GMB account ID
- `GMB_LOCATION_ID` — GMB location ID for the business listing
- `GMB_ACCESS_TOKEN` — OAuth2 access token for the GMB API

### Zillow (required for Zillow review monitoring)
- `ZILLOW_SCREEN_NAME` — Agent's Zillow screen name
- `ZILLOW_ZWS_ID` — Zillow Web Services ID

### Facebook (required for Facebook review monitoring)
- `FACEBOOK_PAGE_ID` — Facebook business page ID
- `FACEBOOK_PAGE_ACCESS_TOKEN` — Page access token with `pages_read_user_content` permission

## Supabase Tables Used

- `agent_logs` — logs every action, review found, error, and run
- `notification_queue` — negative review alerts sent to Ben
- `content_performance` — tracks all published GMB posts
- `brand_memory` — reads brand voice rules for on-brand content
- `shared_intelligence` — reads market insights from other agents

## Architecture

```
agents/gmb-agent/
  index.js          — Main entry point, agent loop, scheduler
  tools.js          — Tool definitions and execution handler
  lib/
    supabase.js     — Supabase client, logging, notification helpers
    reviews.js      — Google, Zillow, Facebook review API integrations
    gmb.js          — GMB post publishing API
```

The agent uses Claude's tool-use loop: Claude receives a system prompt describing its role, chooses which tools to call, processes results, and continues until the task is complete. All decisions (which platforms to check, what to post about, how to draft responses) are made by Claude within the guardrails of the system prompt and available tools.
