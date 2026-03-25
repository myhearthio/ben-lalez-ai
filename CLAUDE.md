# Ben Lalez Team AI Marketing Operating System

## What This Is

An autonomous AI marketing operating system for a top Chicago real estate team at Compass. The system runs 8 AI agents 24/7 with one goal: **drive closings**. Ben is the only human — he reviews and approves, never builds.

## Tech Stack

- **AI orchestration:** Claude Agent SDK
- **Database:** Supabase (connected)
- **Deployment:** Railway
- **CRM:** Follow Up Boss
- **Email marketing:** ActiveCampaign
- **SMS:** Twilio
- **Email delivery:** SendGrid
- **Website:** WordPress REST API
- **Social media scheduling:** Buffer
- **Paid ads:** Google Ads API, Meta Marketing API
- **Local SEO:** Google My Business API
- **Video:** HeyGen (avatar video)
- **Voice:** ElevenLabs

## Architecture Principles

1. **Every agent logs everything to Supabase.** No silent operations. Every API call, decision, error, and outcome gets a row in the appropriate log table.
2. **All sensitive credentials go in environment variables only.** Never hardcode API keys, tokens, passwords, or secrets in source code. Use `process.env` or equivalent.
3. **Agents run autonomously 24/7.** They must handle errors gracefully, retry with backoff, and alert on repeated failures.
4. **Primary metric is closings.** Every feature, agent, and workflow should trace back to generating or nurturing leads toward a closing.
5. **Ben approves, never builds.** The system should surface decisions for human review where required (e.g., ad spend changes, unusual outreach) but operate independently for routine tasks.

## The 8 Agents

1. **Lead Capture Agent** — Ingests leads from all sources into Follow Up Boss, deduplicates, enriches, and scores them.
2. **Nurture Agent** — Runs automated email/SMS drip sequences via ActiveCampaign and Twilio to keep leads warm.
3. **Content Agent** — Generates blog posts, social captions, and market updates; publishes via WordPress REST API and Buffer.
4. **Video Agent** — Creates avatar videos with HeyGen and voiceovers with ElevenLabs for listings, market updates, and social.
5. **Ads Agent** — Manages Google Ads and Meta ad campaigns; optimizes spend toward lead generation and cost-per-closing.
6. **SEO/Local Agent** — Manages Google My Business listings, reviews, and local search optimization.
7. **Analytics Agent** — Tracks pipeline metrics across all agents, generates reports, identifies bottlenecks to closing.
8. **Orchestrator Agent** — Coordinates the other 7 agents, handles scheduling, resolves conflicts, and escalates to Ben.

## Project Structure

```
ben-lalez-ai/
  agents/           # One directory per agent
  shared/           # Shared utilities, Supabase client, logging, error handling
  config/           # Agent configuration, schedules, thresholds
  migrations/       # Supabase SQL migrations
  scripts/          # Deployment, setup, and maintenance scripts
  tests/            # Agent and integration tests
```

## Development Rules

- **No credentials in code.** Use environment variables for all API keys and secrets.
- **Log to Supabase first.** Before building any agent action, ensure the logging table and insert call exist.
- **Idempotent operations.** Agents may restart at any time. All operations should be safe to re-run.
- **Rate limit awareness.** Respect API rate limits for all external services. Implement exponential backoff.
- **Error isolation.** One agent failing must not crash others. The Orchestrator handles cross-agent coordination.
- **Supabase is the source of truth.** All agent state, lead data references, campaign results, and logs live in Supabase.

## Environment Variables

All of these must be set in Railway (production) and `.env` (local development). Never commit `.env`.

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
FOLLOWUPBOSS_API_KEY
ACTIVECAMPAIGN_API_URL
ACTIVECAMPAIGN_API_KEY
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
SENDGRID_API_KEY
WORDPRESS_URL
WORDPRESS_USERNAME
WORDPRESS_APP_PASSWORD
BUFFER_ACCESS_TOKEN
GOOGLE_ADS_DEVELOPER_TOKEN
GOOGLE_ADS_CLIENT_ID
GOOGLE_ADS_CLIENT_SECRET
GOOGLE_ADS_REFRESH_TOKEN
META_APP_ID
META_APP_SECRET
META_ACCESS_TOKEN
GMB_CLIENT_ID
GMB_CLIENT_SECRET
GMB_REFRESH_TOKEN
HEYGEN_API_KEY
ELEVENLABS_API_KEY
```

## Supabase Conventions

- Table names: `snake_case`, plural (e.g., `leads`, `agent_logs`, `campaign_metrics`)
- Every table gets `id` (uuid, primary key), `created_at` (timestamptz, default now()), `updated_at` (timestamptz)
- Agent logs table: `agent_logs` with columns `agent_name`, `action`, `status`, `payload` (jsonb), `error` (text)
- Use Row Level Security where appropriate
- Migrations go in `migrations/` with timestamp prefix: `20260325_create_agent_logs.sql`
