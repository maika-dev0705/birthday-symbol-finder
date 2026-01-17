const buckets = new Map();

export function getClientIp(request) {
  const headers = request?.headers;
  if (!headers) return "unknown";
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return (
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    headers.get("x-client-ip") ||
    "unknown"
  );
}

export function rateLimit(key, { windowMs, max }) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.reset) {
    const reset = now + windowMs;
    buckets.set(key, { count: 1, reset });
    return { ok: true, remaining: Math.max(0, max - 1), reset };
  }
  if (entry.count >= max) {
    return { ok: false, remaining: 0, reset: entry.reset };
  }
  entry.count += 1;
  return { ok: true, remaining: Math.max(0, max - entry.count), reset: entry.reset };
}
