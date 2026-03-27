// Calls the claude-proxy Edge Function — model locked to Haiku server-side
const PROXY_URL = "https://zilgxvcrzlxuqcktemyl.supabase.co/functions/v1/claude-proxy";

export async function sendToAgent(system, messages, sender, agent) {
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages, sender, agent }),
  });

  if (res.status === 429) {
    const data = await res.json();
    throw new Error(data.error || "Rate limit reached");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Proxy error ${res.status}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "Something went wrong. Try again.";
}
