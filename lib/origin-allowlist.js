const DEFAULT_ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function normalizeOrigin(origin) {
  if (!origin || origin === "null") return "";
  try {
    return new URL(origin).origin;
  } catch {
    return origin.trim().replace(/\/$/, "");
  }
}

export function getAllowedOrigins() {
  const env = process.env.ALLOWED_ORIGINS;
  if (!env) return DEFAULT_ALLOWED_ORIGINS;
  const list = env
    .split(",")
    .map((value) => normalizeOrigin(value))
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...list]);
}

export function isAllowedOrigin(request) {
  const origin = normalizeOrigin(request?.headers?.get("origin"));
  const allowed = getAllowedOrigins();
  if (origin) {
    return allowed.has(origin);
  }

  const referer = normalizeOrigin(request?.headers?.get("referer"));
  if (referer && allowed.has(referer)) {
    return true;
  }

  const host = request?.headers?.get("host");
  if (host) {
    if (allowed.has(`https://${host}`)) return true;
    if (allowed.has(`http://${host}`)) return true;
  }

  return process.env.NODE_ENV !== "production";
}
