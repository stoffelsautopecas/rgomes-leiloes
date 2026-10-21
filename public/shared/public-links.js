export function publicOrigin(configured) {
  const candidate = configured || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  try {
    const url = new URL(candidate);
    if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
  } catch (_) { /* Use the local development origin. */ }
  return "http://localhost:3000";
}
export const clientLink = (page, token, origin) => `${publicOrigin(origin)}/${page}?token=${encodeURIComponent(token || "")}`;
