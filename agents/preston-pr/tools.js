// PRESTON v1.0 — tools.js
// PR & Earned Media Agent — tool definitions + implementations
// 15 tools total

import db, {
  logAction, getPrTargets, createPrTarget, updatePrTarget,
  createOutreach, getOutreachPipeline, updateOutreachStatus, getOverdueFollowUps,
  logBacklink, getBacklinks, getBacklinkStats,
  readSharedIntelligence, publishIntelligence, getBrandMemory, getRecentPublishedContent
} from "./lib/supabase.js";

export const toolDefinitions = [
  // ============================================
  // PR TARGET MANAGEMENT
  // ============================================
  {
    name: "get_pr_targets",
    description: "Get journalist/publication targets from the PR database. Filter by tier, status, or beat. Use to find the right person to pitch for a specific story angle.",
    input_schema: {
      type: "object",
      properties: {
        tier: { type: "string", enum: ["tier_1", "tier_2", "tier_3", "niche"], description: "Publication tier" },
        status: { type: "string", enum: ["active", "inactive", "blacklisted"] },
        beat: { type: "string", description: "Filter by journalist beat (e.g., 'real estate', 'luxury', 'Chicago')" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "create_pr_target",
    description: "Add a new journalist or publication to the PR target database. Use when you discover a relevant contact through web research, competitor backlink analysis, or HARO.",
    input_schema: {
      type: "object",
      properties: {
        contact_name: { type: "string" },
        contact_email: { type: "string" },
        contact_title: { type: "string", description: "e.g., 'Real Estate Reporter'" },
        publication: { type: "string" },
        publication_url: { type: "string" },
        publication_tier: { type: "string", enum: ["tier_1", "tier_2", "tier_3", "niche"] },
        domain_rating: { type: "number", description: "Ahrefs/Moz DR score 0-100" },
        beat: { type: "string" },
        source: { type: "string", description: "How discovered: muck_rack, haro, manual, competitor_backlink" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["contact_name", "publication"],
    },
  },

  // ============================================
  // OUTREACH PIPELINE
  // ============================================
  {
    name: "create_outreach",
    description: "Create a new pitch/outreach item. This is your core action — draft a pitch for Zach to review and send. Every pitch needs: a specific target, a sharp angle, at least one data point, and a subject line that earns the open. Status starts as 'drafted' — you queue it for Zach when ready.",
    input_schema: {
      type: "object",
      properties: {
        campaign_name: { type: "string", description: "e.g., 'Q2 2026 Chicago Luxury Data', 'HARO: Spring Market'" },
        outreach_type: { type: "string", enum: ["pitch", "haro_response", "guest_post", "podcast_pitch", "backlink_request", "relationship_building", "follow_up", "award_submission"] },
        target_id: { type: "string", description: "UUID of the pr_target" },
        publication: { type: "string" },
        journalist_name: { type: "string" },
        subject_line: { type: "string", description: "The email subject — make it specific and data-driven" },
        pitch_body: { type: "string", description: "Full pitch draft for Zach to review and send" },
        pitch_angle: { type: "string", description: "1-line summary of the angle" },
        data_points: { type: "object", description: "Key data supporting the pitch (from Roger's intelligence)" },
        intelligence_source_id: { type: "string", description: "UUID of the shared_intelligence entry that inspired this pitch" },
        priority: { type: "string", enum: ["urgent", "high", "normal", "low"] },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["outreach_type", "pitch_body", "pitch_angle"],
    },
  },
  {
    name: "get_outreach_pipeline",
    description: "View the current outreach pipeline — what's drafted, what's queued for Zach, what's been sent, what needs follow-up. Use to manage workflow and identify stale pitches.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["drafted", "queued_for_zach", "approved", "sent", "followed_up", "placed", "rejected", "no_response", "expired"] },
        outreach_type: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "update_outreach_status",
    description: "Update an outreach item's status through the workflow. Use to move pitches from drafted -> queued_for_zach -> sent -> placed. Also for logging responses and scheduling follow-ups.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Outreach UUID" },
        status: { type: "string", enum: ["drafted", "queued_for_zach", "approved", "sent", "followed_up", "placed", "rejected", "no_response", "expired"] },
        sent_at: { type: "string", description: "ISO date when Zach sent it" },
        placed_at: { type: "string", description: "ISO date when coverage was published" },
        placement_url: { type: "string" },
        placement_domain_rating: { type: "number" },
        backlink_earned: { type: "boolean" },
        response_summary: { type: "string" },
        follow_up_count: { type: "number" },
        next_follow_up_at: { type: "string", description: "ISO date for next follow-up" },
      },
      required: ["id", "status"],
    },
  },
  {
    name: "get_overdue_follow_ups",
    description: "Get outreach items that need follow-up — sent or followed_up items past their next_follow_up_at date. Generate follow-up directives for Zach.",
    input_schema: { type: "object", properties: {} },
  },

  // ============================================
  // BACKLINK TRACKING
  // ============================================
  {
    name: "log_backlink",
    description: "Record a discovered backlink to benlalez.com. Whether earned through outreach, HARO, guest posting, or discovered organically. Every link gets logged.",
    input_schema: {
      type: "object",
      properties: {
        source_url: { type: "string" },
        source_domain: { type: "string" },
        source_domain_rating: { type: "number" },
        source_page_title: { type: "string" },
        target_url: { type: "string", description: "Which benlalez.com page got the link" },
        anchor_text: { type: "string" },
        discovery_method: { type: "string", description: "competitor_intersect, haro_placement, guest_post, organic, outreach" },
        outreach_id: { type: "string", description: "UUID of the outreach that earned this (if applicable)" },
        estimated_traffic: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["source_url", "source_domain", "target_url"],
    },
  },
  {
    name: "get_backlinks",
    description: "View tracked backlinks. Filter by status and minimum domain rating. Use for reporting and to identify which strategies earn the best links.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "lost", "pending_verification"] },
        min_dr: { type: "number", description: "Minimum domain rating" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_backlink_stats",
    description: "Get aggregate backlink stats — total active, high-DR count, average domain rating. Use for reporting to Oliver and Ben.",
    input_schema: { type: "object", properties: {} },
  },

  // ============================================
  // RESEARCH & INTELLIGENCE
  // ============================================
  {
    name: "web_search",
    description: "Search the web for journalist contacts, HARO opportunities, competitor press coverage, Chicago media outlets, guest post opportunities, and backlink prospects.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
  {
    name: "deep_scrape_url",
    description: "Scrape a full web page using Firecrawl. Use for reading competitor press coverage, journalist profiles, publication submission guidelines, and HARO query pages.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "read_shared_intelligence",
    description: "Read intelligence from ALL agents. Critical: check Roger's intelligence for pitchable data stories (confidence >= 0.8). Check Sarah's content for link-worthy pieces to promote. Check Oliver's directives.",
    input_schema: {
      type: "object",
      properties: {
        source_agent: { type: "string" },
        intelligence_type: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        since: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_brand_memory",
    description: "Read brand voice rules before drafting any pitch. Ben's voice, rejected phrases, and audience definitions apply to PR outreach too — journalists will quote Ben, so the quotes need to sound like him.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string" },
      },
    },
  },
  {
    name: "get_content_for_pitching",
    description: "Get recently published content that's worth pitching for backlinks or press coverage. Prioritize pillar pages, data-driven posts, and comprehensive neighborhood guides — these are what journalists actually link to.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
  },
  {
    name: "publish_pr_intelligence",
    description: "Share PR insights with other agents — coverage earned, backlink opportunities, journalist preferences, pitch learnings. Webster needs backlink data for SEO, Sarah needs to know what content earns links, Roger needs to know what data stories journalists want.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        insight: { type: "string" },
        confidence: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
        target_agents: { type: "array", items: { type: "string" } },
      },
      required: ["title", "insight", "confidence"],
    },
  },
];

export async function executeTool(name, input) {
  const start = Date.now();
  try {
    let result;
    switch (name) {
      // --- PR TARGETS ---
      case "get_pr_targets": {
        result = await getPrTargets({
          tier: input.tier,
          status: input.status || "active",
          beat: input.beat,
          limit: input.limit,
        });
        await logAction("get_pr_targets", "success", { count: result.length });
        break;
      }

      case "create_pr_target": {
        result = await createPrTarget({
          contactName: input.contact_name,
          contactEmail: input.contact_email,
          contactTitle: input.contact_title,
          publication: input.publication,
          publicationUrl: input.publication_url,
          publicationTier: input.publication_tier,
          domainRating: input.domain_rating,
          beat: input.beat,
          source: input.source,
          tags: input.tags || [],
        });
        await logAction("create_pr_target", "success", { name: input.contact_name, publication: input.publication });
        break;
      }

      // --- OUTREACH ---
      case "create_outreach": {
        result = await createOutreach({
          campaignName: input.campaign_name,
          outreachType: input.outreach_type,
          targetId: input.target_id,
          publication: input.publication,
          journalistName: input.journalist_name,
          subjectLine: input.subject_line,
          pitchBody: input.pitch_body,
          pitchAngle: input.pitch_angle,
          dataPoints: input.data_points || {},
          intelligenceSourceId: input.intelligence_source_id,
          priority: input.priority || "normal",
          tags: input.tags || [],
        });
        await logAction("create_outreach", "success", { type: input.outreach_type, angle: input.pitch_angle });
        break;
      }

      case "get_outreach_pipeline": {
        result = await getOutreachPipeline({
          status: input.status,
          outreachType: input.outreach_type,
          limit: input.limit,
        });
        await logAction("get_outreach_pipeline", "success", { count: result.length });
        break;
      }

      case "update_outreach_status": {
        result = await updateOutreachStatus(input.id, {
          status: input.status,
          sentAt: input.sent_at,
          placedAt: input.placed_at,
          placementUrl: input.placement_url,
          placementDomainRating: input.placement_domain_rating,
          backlinkEarned: input.backlink_earned,
          responseSummary: input.response_summary,
          followUpCount: input.follow_up_count,
          nextFollowUpAt: input.next_follow_up_at,
        });

        // If placed, also update the target's stats
        if (input.status === "placed" && result.target_id) {
          try {
            await updatePrTarget(result.target_id, {
              total_placements: db().rpc ? undefined : undefined, // TODO: increment via RPC
              last_responded_at: new Date().toISOString(),
              relationship_status: "active",
            });
          } catch (e) { console.warn("Failed to update target stats:", e.message); }
        }

        await logAction("update_outreach_status", "success", { id: input.id, status: input.status });
        break;
      }

      case "get_overdue_follow_ups": {
        result = await getOverdueFollowUps();
        await logAction("get_overdue_follow_ups", "success", { count: result.length });
        break;
      }

      // --- BACKLINKS ---
      case "log_backlink": {
        result = await logBacklink({
          sourceUrl: input.source_url,
          sourceDomain: input.source_domain,
          sourceDomainRating: input.source_domain_rating,
          sourcePageTitle: input.source_page_title,
          targetUrl: input.target_url,
          anchorText: input.anchor_text,
          discoveryMethod: input.discovery_method,
          outreachId: input.outreach_id,
          estimatedTraffic: input.estimated_traffic,
          tags: input.tags || [],
        });

        // Publish to shared_intelligence so Webster can track DA impact
        await publishIntelligence({
          intelligenceType: "backlink_earned",
          title: `New backlink: ${input.source_domain} (DR ${input.source_domain_rating || "?"})`,
          insight: `Earned backlink from ${input.source_domain} to ${input.target_url}. Method: ${input.discovery_method || "unknown"}.`,
          confidence: 0.95,
          tags: ["backlink", "seo_impact"],
          targetAgents: ["content-seo", "orchestrator"],
          data: { source_domain: input.source_domain, target_url: input.target_url, dr: input.source_domain_rating },
        });

        await logAction("log_backlink", "success", { domain: input.source_domain, dr: input.source_domain_rating });
        break;
      }

      case "get_backlinks": {
        result = await getBacklinks({
          status: input.status,
          minDr: input.min_dr,
          limit: input.limit,
        });
        await logAction("get_backlinks", "success", { count: result.length });
        break;
      }

      case "get_backlink_stats": {
        result = await getBacklinkStats();
        await logAction("get_backlink_stats", "success", result);
        break;
      }

      // --- RESEARCH ---
      case "web_search": {
        const SERPER_KEY = process.env.SERPER_API_KEY;
        if (SERPER_KEY) {
          const res = await fetch("https://google.serper.dev/search", {
            method: "POST",
            headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ q: input.query, num: 10 }),
          });
          if (!res.ok) throw new Error(`Serper ${res.status}`);
          result = await res.json();
        } else {
          result = { note: "Web search not configured — set SERPER_API_KEY", query: input.query };
        }
        await logAction("web_search", "success", { query: input.query }, null, Date.now() - start);
        break;
      }

      case "deep_scrape_url": {
        const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY;
        if (!FIRECRAWL_KEY) {
          result = { note: "Firecrawl not configured — set FIRECRAWL_API_KEY", url: input.url };
          break;
        }
        const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: { "Authorization": `Bearer ${FIRECRAWL_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url: input.url, formats: ["markdown"] }),
        });
        if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${await res.text()}`);
        const data = await res.json();
        result = {
          url: input.url,
          markdown: data.data?.markdown || "",
          title: data.data?.metadata?.title || "",
          description: data.data?.metadata?.description || "",
        };
        await logAction("deep_scrape_url", "success", { url: input.url }, null, Date.now() - start);
        break;
      }

      case "read_shared_intelligence": {
        result = await readSharedIntelligence({
          sourceAgent: input.source_agent,
          intelligenceType: input.intelligence_type,
          tags: input.tags,
          since: input.since,
          limit: input.limit || 20,
        });
        await logAction("read_shared_intelligence", "success", { count: result.length });
        break;
      }

      case "get_brand_memory": {
        result = await getBrandMemory({ category: input.category });
        await logAction("get_brand_memory", "success", { count: result.length });
        break;
      }

      case "get_content_for_pitching": {
        result = await getRecentPublishedContent(input.limit || 10);
        await logAction("get_content_for_pitching", "success", { count: result.length });
        break;
      }

      case "publish_pr_intelligence": {
        result = await publishIntelligence({
          intelligenceType: "pr_insight",
          title: input.title,
          insight: input.insight,
          confidence: input.confidence,
          tags: [...(input.tags || []), "pr", "earned_media"],
          targetAgents: input.target_agents || ["orchestrator", "content-seo"],
        });
        await logAction("publish_pr_intelligence", "success", { title: input.title });
        break;
      }

      default: throw new Error(`Unknown tool: ${name}`);
    }
    return { success: true, data: result };
  } catch (err) {
    await logAction(name, "error", { input }, err.message, Date.now() - start);
    return { success: false, error: err.message };
  }
}
