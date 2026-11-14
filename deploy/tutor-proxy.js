/* Optional tutor proxy for the hosted site, as a Cloudflare Worker (free plan is enough).

   Why: the hosted site is plain files, so it cannot keep an API key secret. This small worker keeps your Groq key
   as an encrypted secret and forwards tutor requests to Groq. Visitors then use the tutor without their own key.

   Setup (see README.md, "Host it online"):
     npx wrangler secret put GROQ_API_KEY          your key; it is stored by Cloudflare, never in this file
     set ALLOWED_ORIGINS in wrangler.toml          your site's address, for example https://yourname.github.io
     npx wrangler deploy
   Then build the site with:  python app.py --build site --tutor-proxy https://course-tutor.<you>.workers.dev

   Limits: the origin check stops other websites from using the proxy from a browser, but a script can fake it. The
   optional RATE_LIMITER binding (wrangler.toml) caps requests per visitor, and you should also set a spending or
   usage limit on the Groq key itself. */

const MODEL = 'openai/gpt-oss-120b';
const MAX_BODY = 40000;        // characters accepted from the page
const MAX_MESSAGES = 20;

function json(data, status, cors) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
    const ok = allowed.includes(origin);
    const cors = ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : { Vary: 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers: cors });
    if (!ok) return json({ error: 'This site is not allowed to use the tutor proxy.' }, 403, cors);
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405, cors);
    if (!env.GROQ_API_KEY) return json({ error: 'The tutor proxy has no GROQ_API_KEY secret.' }, 200, cors);

    if (env.RATE_LIMITER) {
      const who = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: who });
      if (!success) return json({ error: 'Too many tutor requests. Wait a minute and try again.' }, 200, cors);
    }

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
  },
};
