/* Optional server for the hosted site, as a Cloudflare Worker (free plan is enough). It does two separate jobs:

   1. Tutor proxy (POST /): keeps your Groq key as an encrypted secret and forwards tutor requests to Groq, so
      visitors use the tutor without their own key.
   2. Progress sync (POST /sync/load, /sync/save): stores each ID's progress in Workers KV, so the same ID shows the
      same progress on every device. The browser turns the password into a key (PBKDF2) before sending it; this
      worker never sees the password and stores only a SHA-256 hash of that key.

   Setup (see README.md, "Host it online"):
     npx wrangler kv namespace create SYNC         then put the printed id into wrangler.toml
     npx wrangler secret put GROQ_API_KEY          your key; it is stored by Cloudflare, never in this file
     set ALLOWED_ORIGINS in wrangler.toml          your site's address, for example https://yourname.github.io
     npx wrangler deploy
   Then build the site with:
     python app.py --build site --tutor-proxy https://course-tutor.<you>.workers.dev --sync-url https://course-tutor.<you>.workers.dev

   Limits: the origin check stops other websites from using this worker from a browser, but a script can fake it. The
   RATE_LIMITER and SYNC_LIMITER bindings (wrangler.toml) cap requests per visitor, and you should also set a spending
   or usage limit on the Groq key itself. */

const MODEL = 'openai/gpt-oss-120b';
const MAX_BODY = 40000;        // characters accepted from the page for a tutor request
const MAX_MESSAGES = 20;
const MAX_DATA = 1000000;      // characters of progress stored per ID
const ID_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;

function json(data, status, cors) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function limited(limiter, request) {
  if (!limiter) return false;
  const { success } = await limiter.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
  return !success;
}

async function tutor(request, env, cors) {
  if (!env.GROQ_API_KEY) return json({ error: 'The tutor proxy has no GROQ_API_KEY secret.' }, 200, cors);
  if (await limited(env.RATE_LIMITER, request)) return json({ error: 'Too many tutor requests. Wait a minute and try again.' }, 200, cors);

  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: 'The request was too long.' }, 413, cors);
  let body;
  try { body = JSON.parse(text); } catch (e) { return json({ error: 'Invalid JSON.' }, 400, cors); }
  const system = typeof body.system === 'string' ? body.system.slice(0, 12000) : '';
  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 9000) })) : [];
  if (!messages.length) return json({ error: 'Nothing to ask.' }, 400, cors);

  let answer, data = {};
  try {
    answer = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.MODEL || MODEL, max_completion_tokens: 2000, reasoning_effort: 'low',
        messages: [{ role: 'system', content: system }, ...messages] }),
    });
    data = await answer.json().catch(() => ({}));
  } catch (e) {
    return json({ error: 'The proxy could not reach Groq.' }, 200, cors);
  }
  if (!answer.ok) {
    const detail = (data.error && data.error.message) || '';
    return json({ error: `The AI service answered with HTTP ${answer.status}${detail ? ': ' + String(detail).slice(0, 200) : ''}.` }, 200, cors);
  }
  const reply = (((data.choices || [])[0] || {}).message || {}).content || '';
  return json(reply.trim() ? { reply: reply.trim() } : { error: 'The AI returned an empty answer.' }, 200, cors);
}

/* Stored per ID under "user:<id>": { auth: sha256(key from the browser), rev, updated, data }.
   rev goes up by one on every save. A save names the rev it started from (base); if another device saved in the
   meantime, the answer is 409 with the newer data, and the browser combines both and saves again. */
async function sync(op, request, env, cors) {
  if (!env.SYNC) return json({ error: 'Progress sync is not set up on this server (KV binding SYNC is missing).' }, 501, cors);
  if (await limited(env.SYNC_LIMITER, request)) return json({ error: 'Too many requests. Wait a minute and try again.' }, 429, cors);
  const text = await request.text();
  if (text.length > MAX_DATA + 2000) return json({ error: 'Your progress is too large to save (over 1 MB).' }, 413, cors);
  let body;
  try { body = JSON.parse(text); } catch (e) { return json({ error: 'Invalid JSON.' }, 400, cors); }
  const id = typeof body.id === 'string' ? body.id.trim().toLowerCase() : '';
  const auth = typeof body.auth === 'string' ? body.auth : '';
  if (!ID_RE.test(id) || !/^[0-9a-f]{64}$/.test(auth)) return json({ error: 'Invalid ID or password.' }, 400, cors);

  const key = 'user:' + id;
  const [record, hash] = await Promise.all([env.SYNC.get(key, 'json'), sha256(auth)]);
  if (op === 'load') {
    if (!record) return json({ error: 'No progress is saved under this ID.' }, 404, cors);
    if (record.auth !== hash) return json({ error: 'Wrong password for this ID.' }, 403, cors);
    return json({ rev: record.rev, updated: record.updated, data: record.data }, 200, cors);
  }
  const data = body.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ error: 'Progress must be an object.' }, 400, cors);
  if (body.create) {
    if (record) return json({ error: 'This ID is already taken.' }, 409, cors);
  } else {
    if (!record) return json({ error: 'No progress is saved under this ID.' }, 404, cors);
    if (record.auth !== hash) return json({ error: 'Wrong password for this ID.' }, 403, cors);
    if (body.base !== record.rev) return json({ error: 'Another device saved first.', rev: record.rev, data: record.data }, 409, cors);
  }
  const next = { auth: hash, rev: (record ? record.rev : 0) + 1, updated: new Date().toISOString(), data };
  await env.SYNC.put(key, JSON.stringify(next));
  return json({ rev: next.rev, updated: next.updated }, 200, cors);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
    const ok = allowed.includes(origin);
    const cors = ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : { Vary: 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers: cors });
    if (!ok) return json({ error: 'This site is not allowed to use this server.' }, 403, cors);
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, cors);

    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    if (path === '/sync/load' || path === '/sync/save') return sync(path.slice('/sync/'.length), request, env, cors);
    if (path === '' || path === '/tutor') return tutor(request, env, cors);
    return json({ error: 'Not found.' }, 404, cors);
  },
};
