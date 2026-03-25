const WP_URL = process.env.WORDPRESS_URL;
const WP_USER = process.env.WORDPRESS_USERNAME;
const WP_PASS = process.env.WORDPRESS_APP_PASSWORD;

function authHeader() {
  return "Basic " + Buffer.from(`${WP_USER}:${WP_PASS}`).toString("base64");
}

export async function createPost({ title, content, excerpt, categories = [], tags = [], status = "publish" }) {
  const res = await fetch(`${WP_URL}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ title, content, excerpt, categories, tags, status }),
  });
  if (!res.ok) throw new Error(`WordPress ${res.status}: ${await res.text()}`);
  const post = await res.json();
  return { id: post.id, link: post.link, slug: post.slug };
}

export async function getCategories() {
  const res = await fetch(`${WP_URL}/wp-json/wp/v2/categories?per_page=50`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) throw new Error(`WordPress ${res.status}`);
  return res.json();
}

export async function getRecentPosts(count = 5) {
  const res = await fetch(`${WP_URL}/wp-json/wp/v2/posts?per_page=${count}&orderby=date&order=desc`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) throw new Error(`WordPress ${res.status}`);
  return res.json();
}
