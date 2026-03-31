import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function callClaude(system, userPrompt, tier = 'haiku', maxTokens = 2000) {
  const model = tier === 'sonnet' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userPrompt }],
  });
  return response.content[0].text;
}

export async function callClaudeJSON(system, userPrompt, tier = 'haiku', maxTokens = 2000) {
  const raw = await callClaude(system, userPrompt, tier, maxTokens);
  const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(clean);
}
