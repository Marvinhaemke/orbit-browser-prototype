export async function embeddingPolicy(raw, origin = location.origin, request = fetch) {
  const url = new URL(raw), parent = new URL(origin);
  if (parent.protocol === "https:" && url.protocol === "http:") return {blocked: true, reason: "mixed-content"};
  if (url.origin === parent.origin) return {blocked: false, reason: "same-origin"};
  try {
    const response = await request(`/api/frame-policy?url=${encodeURIComponent(url.href)}`, {signal: AbortSignal.timeout(18000)});
    if (response.ok) return await response.json();
  } catch { /* A failed advisory check does not replace the browser's own policy. */ }
  return {blocked: false, reason: "unverified"};
}
