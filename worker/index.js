// Hunt drop box Worker. Knows nothing about hunts: it stores an opaque JSON
// payload under a key, with a version counter, in R2. See
// claude/hunt-drop-box-plan.md for why each choice was made.
//
// Config: R2 binding HUNTS; secret ADMIN_KEY; var ALLOWED_ORIGIN.
// Expiry is an R2 lifecycle rule on the bucket (age counts from each write,
// so a hunt that keeps being edited never expires) — see wrangler.toml notes.

const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
const ROUTE_RE = /^\/h\/([A-Za-z0-9_-]{22})(\/meta)?$/;
const MAX_BYTES = 2_000_000;
const MAX_NAME = 80;

function corsHeaders(env, req) {
  const allowed = (env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("Origin");
  const h = {
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(env, req, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(env, req) },
  });
}

const metaOf = (e) => ({ version: e.version, updatedAt: e.updatedAt, updatedBy: e.updatedBy });

async function readEnvelope(env, key) {
  const obj = await env.HUNTS.get(key);
  if (!obj) return { obj: null, env: null };
  return { obj, env: JSON.parse(await obj.text()) };
}

function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(env, req) });

    const url = new URL(req.url);
    const m = ROUTE_RE.exec(url.pathname);
    if (!m) return json(env, req, 404, { error: "not_found" });
    const token = m[1];
    const isMeta = !!m[2];
    const key = "h/" + token;

    if (isMeta) {
      if (req.method !== "GET") return json(env, req, 405, { error: "method_not_allowed" });
      const { env: cur } = await readEnvelope(env, key);
      if (!cur) return json(env, req, 404, { error: "not_found" });
      return json(env, req, 200, metaOf(cur));
    }

    if (req.method === "GET") {
      const { env: cur } = await readEnvelope(env, key);
      if (!cur) return json(env, req, 404, { error: "not_found" });
      return json(env, req, 200, cur);
    }

    if (req.method === "PUT") {
      const len = Number(req.headers.get("Content-Length") || 0);
      if (len > MAX_BYTES) return json(env, req, 413, { error: "too_large" });
      const raw = await req.text();
      if (raw.length > MAX_BYTES) return json(env, req, 413, { error: "too_large" });
      let body;
      try { body = JSON.parse(raw); } catch { return json(env, req, 400, { error: "bad_json" }); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json(env, req, 400, { error: "bad_body" });
      const baseVersion = body.baseVersion ?? 0;
      if (!Number.isInteger(baseVersion) || baseVersion < 0) return json(env, req, 400, { error: "bad_base_version" });
      if (!("payload" in body) || body.payload === null || typeof body.payload !== "object") {
        return json(env, req, 400, { error: "missing_payload" });
      }
      const updatedBy = typeof body.updatedBy === "string" && body.updatedBy.trim()
        ? body.updatedBy.trim().slice(0, MAX_NAME) : "okänd";

      const { obj: existing, env: cur } = await readEnvelope(env, key);
      const curVersion = cur ? cur.version : 0;
      if (baseVersion !== curVersion) {
        return json(env, req, 409, { error: "conflict", ...(cur ? metaOf(cur) : { version: 0 }) });
      }
      const next = {
        version: curVersion + 1,
        updatedAt: new Date().toISOString(),
        updatedBy,
        payload: body.payload,
      };
      const written = await env.HUNTS.put(key, JSON.stringify(next), {
        httpMetadata: { contentType: "application/json" },
        onlyIf: existing ? { etagMatches: existing.etag } : { etagDoesNotMatch: "*" },
      });
      if (written === null) {
        // Someone slipped in between our read and our write: report the winner.
        const { env: now } = await readEnvelope(env, key);
        return json(env, req, 409, { error: "conflict", ...(now ? metaOf(now) : { version: 0 }) });
      }
      return json(env, req, 200, { version: next.version });
    }

    if (req.method === "DELETE") {
      const supplied = req.headers.get("X-Admin-Key") || "";
      if (!env.ADMIN_KEY || !timingSafeEqual(supplied, env.ADMIN_KEY)) {
        return json(env, req, 403, { error: "forbidden" });
      }
      await env.HUNTS.delete(key);
      return json(env, req, 200, { deleted: true });
    }

    return json(env, req, 405, { error: "method_not_allowed" });
  },
};
