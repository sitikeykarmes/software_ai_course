/* Hosted version only (made by `python app.py --build`). There is no server behind the hosted site, so this file
   answers the page's /api/... requests itself:
     /api/run, /api/judge      Python runs in this browser (static/pyworker.js, Pyodide), with the same time limit
     /api/state, /api/progress, /api/progress-patch
                               progress is kept in this browser's localStorage (Settings has Export and Import)
     /api/tutor                the Groq API, with the visitor's own key, or through the site's tutor proxy
   With a sync server (--sync-url), signing in with an ID and password also keeps the progress in sync between devices.
   It loads after course.js / python.js and before app.js / py.js. */
(function () {
  'use strict';
  var H = window.HOSTED || {};
  var PROMPTS = H.prompts || {};
  var LIMIT = H.timeout || 10, MAX_OUT = H.maxOutput || 20000;
  var STORE = 'sae-progress', KEY_STORE = 'sae-groq-key', SYNC_STORE = 'sae-sync', ASKED = 'sae-sync-asked';
  var SYNC = H.sync ? String(H.sync).replace(/\/+$/, '') : '';
  var LAB_ONLY = ['pydone', 'pylast'];
  var PATCHABLE = ['checks', 'drafts', 'pydone', 'pylast', 'streak', 'theme'];
  var here = document.currentScript ? document.currentScript.src : location.href;

  /* ---------- progress in localStorage ---------- */
  function readLocal(name) { try { return localStorage.getItem(name); } catch (e) { return null; } }
  function writeLocal(name, value) {
    try { if (value === null) localStorage.removeItem(name); else localStorage.setItem(name, value); return true; } catch (e) { return false; }
  }
  function load() {
    try { var v = JSON.parse(readLocal(STORE) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; }
  }
  function save(data) { return writeLocal(STORE, JSON.stringify(data)); }
  window.SAVED = load();

  function writeProgress(data) {   // the main course saves everything; keys owned by the Python Lab stay as stored
    var cur = load();
    LAB_ONLY.forEach(function (k) { delete data[k]; if (k in cur) data[k] = cur[k]; });
    return replaceAll(cur, data);
  }
  function patchProgress(section, key, value) {
    var before = load(), data = load();
    if (key === null || key === undefined) {
      if (value === null || value === undefined) delete data[section]; else data[section] = value;
    } else {
      var b = data[section];
      if (!b || typeof b !== 'object' || Array.isArray(b)) b = data[section] = {};
      if (value === null || value === undefined) delete b[key]; else b[key] = value;
    }
    return replaceAll(before, data);
  }
  function replaceAll(before, data) {   // every change made on this page goes through here
    if (!save(data)) return false;
    var s = getSync();
    if (s) { diffPaths(before, data, s.dirty); setSync(s); syncSoon(); }
    return true;
  }

  /* ---------- progress sync between devices (signed in with an ID) ----------
     Kept in localStorage under sae-sync: { id, auth, rev, dirty, adopt, at, error }.
       auth   a key made from the password in this browser (PBKDF2); the server stores only a hash of it
       rev    the server's revision this browser last had
       dirty  entries changed here and not yet saved to the ID, as "section" or "section\nkey" paths
       adopt  goes up when newer progress from the ID is taken in; other open tabs then reload
     Pages keep their progress in memory and save all of it, so after taking in newer progress the page reloads. */
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function hasKeys(o) { return isObj(o) && Object.keys(o).length > 0; }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  var WHOLE = { streak: 1 };   // values that are replaced as a whole, never combined entry by entry
  function getSync() {
    try { var s = JSON.parse(readLocal(SYNC_STORE) || 'null'); } catch (e) { return null; }
    if (!SYNC || !isObj(s) || !s.id || !s.auth) return null;
    if (!isObj(s.dirty)) s.dirty = {};
    return s;
  }
  function setSync(s) { writeLocal(SYNC_STORE, s ? JSON.stringify(s) : null); }
  function diffPaths(a, b, into) {   // which entries differ between two progress objects
    a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
    Object.keys(Object.assign({}, a, b)).forEach(function (k) {
      var x = a[k], y = b[k];
      if (same(x, y)) return;
      if (isObj(x) && isObj(y) && !WHOLE[k]) {
        Object.keys(Object.assign({}, x, y)).forEach(function (s) { if (!same(x[s], y[s])) into[k + '\n' + s] = 1; });
      } else into[k] = 1;
    });
    return into;
  }
  function applyPaths(base, local, paths) {   // the server's progress with this browser's unsaved changes on top
    var out = JSON.parse(JSON.stringify(isObj(base) ? base : {}));
    Object.keys(paths).forEach(function (p) {
      var i = p.indexOf('\n');
      if (i < 0) { if (p in local) out[p] = local[p]; else delete out[p]; return; }
      var k = p.slice(0, i), sub = p.slice(i + 1);
      if (isObj(local[k]) && sub in local[k]) { if (!isObj(out[k])) out[k] = {}; out[k][sub] = local[k][sub]; }
      else if (isObj(out[k])) delete out[k][sub];
    });
    return out;
  }
  function mergeIn(server, local) {   // signing in: the ID's progress wins; entries only this browser has are added
    var out = JSON.parse(JSON.stringify(server));
    Object.keys(local).forEach(function (k) {
      if (!(k in out)) out[k] = local[k];
      else if (isObj(out[k]) && isObj(local[k]) && !WHOLE[k]) {
        Object.keys(local[k]).forEach(function (sub) { if (!(sub in out[k])) out[k][sub] = local[k][sub]; });
      }
    });
    return out;
  }
  function syncCall(op, body, keepalive) {
    var opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    if (keepalive && opts.body.length < 60000) opts.keepalive = true;   // lets the save finish while the tab closes
    return fetchReal(SYNC + '/sync/' + op, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { d = isObj(d) ? d : {}; d.status = r.status; return d; });
    });
  }
  var pushing = false, pushTimer = null, lastPull = 0, tabAdopt = 0;
  function syncSoon(ms) { clearTimeout(pushTimer); pushTimer = setTimeout(push, ms === undefined ? 30000 : ms); }
  function push(keepalive) {   // save this browser's changes to the ID
    var s = getSync();
    if (!s || pushing || !hasKeys(s.dirty)) return Promise.resolve();
    pushing = true; clearTimeout(pushTimer);
    var data = load();
    return syncCall('save', { id: s.id, auth: s.auth, base: s.rev || 0, data: data }, keepalive).then(function (r) {
      pushing = false;
      var now = getSync();
      if (!now || now.id !== s.id) return;
      if (r.status === 200) {
        now.rev = r.rev; now.at = Date.now(); now.error = '';
        now.dirty = diffPaths(data, load(), {});   // anything changed while this save was on its way is still unsaved
        setSync(now); refreshAccount();
        if (hasKeys(now.dirty)) syncSoon();
        return;
      }
      if (r.status === 409 && r.rev > (now.rev || 0)) return adopt(now, r.rev, r.data);   // another device saved first
      now.error = r.error || ('HTTP ' + r.status); setSync(now); refreshAccount();
      if (r.status !== 403 && r.status !== 404) syncSoon(60000);
    }, function () {
      pushing = false;
      var now = getSync();
      if (now) { now.error = 'Could not reach the sync server. Changes are kept here and saved later.'; setSync(now); refreshAccount(); }
      syncSoon(60000);
    });
  }
  function adopt(s, rev, serverData) {   // take in newer progress from the ID, keeping changes not yet saved from here
    var local = load(), server = isObj(serverData) ? serverData : {};
    var merged = hasKeys(s.dirty) ? applyPaths(server, local, s.dirty) : server;
    s.rev = rev; s.at = Date.now(); s.error = ''; s.dirty = diffPaths(server, merged, {});
    s.adopt = (s.adopt || 0) + 1; tabAdopt = s.adopt;
    setSync(s);
    var changed = !same(merged, local);
    if (changed) { status('Loading your progress from your ID.'); save(merged); }
    return push(true).then(function () { if (changed) location.reload(); });
  }
  function pull() {   // fetch the ID's progress; take it in when it is newer than what this browser has
    var s = getSync();
    if (!s) return Promise.resolve();
    lastPull = Date.now();
    return syncCall('load', { id: s.id, auth: s.auth }).then(function (r) {
      var now = getSync();
      if (!now || now.id !== s.id) return;
      if (r.status !== 200) { now.error = r.error || ('HTTP ' + r.status); setSync(now); refreshAccount(); return; }
      if (r.rev > (now.rev || 0)) return adopt(now, r.rev, r.data);
      if (now.error) { now.error = ''; setSync(now); refreshAccount(); }
      if (hasKeys(now.dirty)) return push();
    }, function () { /* offline: keep working in this browser; changes are saved to the ID later */ });
  }
  function deriveAuth(id, password) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('course-sync/v1/' + id), iterations: 200000 }, k, 256);
    }).then(function (bits) {
      return Array.prototype.map.call(new Uint8Array(bits), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }
  function signIn(id, password, create) {
    return deriveAuth(id, password).then(function (auth) {
      var local = load();
      if (create) {
        return syncCall('save', { id: id, auth: auth, base: 0, create: true, data: local }).then(function (r) {
          if (r.status === 409) throw new Error('This ID is already taken. Choose another one, or sign in if it is yours.');
          if (r.status !== 200) throw new Error(r.error || 'The sync server answered with HTTP ' + r.status + '.');
          setSync({ id: id, auth: auth, rev: r.rev, dirty: {}, adopt: 0, at: Date.now(), error: '' });
        });
      }
      return syncCall('load', { id: id, auth: auth }).then(function (r) {
        if (r.status === 404) throw new Error('No progress is saved under this ID. Check the spelling, or use Create new ID.');
        if (r.status === 403) throw new Error('Wrong password for this ID.');
        if (r.status !== 200) throw new Error(r.error || 'The sync server answered with HTTP ' + r.status + '.');
        var server = isObj(r.data) ? r.data : {}, merged = mergeIn(server, local);
        setSync({ id: id, auth: auth, rev: r.rev, dirty: diffPaths(server, merged, {}), adopt: 0, at: Date.now(), error: '' });
        save(merged);
        return push(true);
      });
    }, function () { throw new Error('This browser cannot create the sign-in key. Use an up-to-date browser.'); });
  }
  function signOut() {
    var s = getSync();
    if (!s) return;
    if (!confirm('Sign out of "' + s.id + '"? The progress in this browser is removed; it stays saved in your ID.')) return;
    push(true).catch(function () {}).then(function () {
      var now = getSync();
      if (now && hasKeys(now.dirty) && !confirm('Some changes could not be saved to your ID yet (no connection?). Sign out and lose them?')) return;
      setSync(null); writeLocal(STORE, null); location.reload();
    });
  }

  /* ---------- Python in a Web Worker ---------- */
  var worker = null, workerState = 'off', current = null, queue = [], nextId = 1, timer = null;
  var pill = null;
  function status(text) {
    if (!pill) { pill = document.createElement('div'); pill.className = 'py-status'; pill.setAttribute('role', 'status'); document.body.appendChild(pill); }
    pill.textContent = text || ''; pill.hidden = !text;
  }
  function startWorker() {
    if (worker) return;
    workerState = 'loading';
    worker = new Worker(new URL('pyworker.js', here));
    worker.onmessage = function (e) {
      var m = e.data;
      if (m.phase === 'ready') { workerState = 'ready'; status(''); updatePyInfo(); return; }
      if (m.phase === 'failed') {   // end this worker, so the next Run tries the download again
        killWorker(); workerState = 'failed'; status(''); updatePyInfo();
        if (current) finish({ error: 'Python could not be loaded in this browser (' + (m.error || 'unknown error') + '). Check the internet connection and try again.' });
        return;
      }
      if (!current || m.id !== current.id) return;
      if (m.phase === 'start') { status(''); clearTimeout(timer); timer = setTimeout(stopForTime, LIMIT * 1000); return; }
      if ('partial' in m) { current.partial = m.partial; return; }
      finish('error' in m ? { error: m.error } : { result: m.result });
    };
    worker.onerror = function (e) {
      e.preventDefault();
      killWorker();   // first, so the next queued job starts in a fresh worker
      updatePyInfo();
      if (current) finish({ error: 'Python stopped unexpectedly: ' + (e.message || 'unknown error') + '. Check the internet connection and try again.' });
    };
  }
  function killWorker() { if (worker) worker.terminate(); worker = null; workerState = 'off'; }
  function stopForTime() {   // like the local version: stop the program and keep what it printed
    var job = current;
    killWorker();
    if (job) finish({ timedOut: true });
    if (!worker) startWorker();   // a fresh Python for the next run (loads from the browser cache)
  }
  function finish(outcome) {
    clearTimeout(timer);
    var job = current; current = null; status('');
    if (job) job.done(outcome, job.partial || '');
    pump();
  }
  function pump() {
    if (current || !queue.length) return;
    current = queue.shift();
    startWorker();
    if (workerState !== 'ready') status('Starting Python in your browser. The first time this downloads about 10 MB.');
    worker.postMessage(current.msg);
  }
  function python(msg) {
    return new Promise(function (resolve) {
      msg.id = nextId++;
      queue.push({ id: msg.id, msg: msg, partial: '', done: function (outcome, partial) { resolve({ outcome: outcome, partial: partial }); } });
      pump();
    });
  }
  function runCode(code) {
    return python({ type: 'run', code: code }).then(function (r) {
      var o = r.outcome;
      var text = o.timedOut ? r.partial : (o.error ? o.error : o.result);
      return { output: String(text || '').slice(0, MAX_OUT), timed_out: !!o.timedOut, limit: LIMIT };
    });
  }
  function judgeCode(code, tests, limit) {
    return python({ type: 'judge', code: code, tests: tests, limit: limit }).then(function (r) {
      var o = r.outcome, res = { cases: [], error: '', stdout: '', total: 0 };
      if (o.result) { try { res = JSON.parse(o.result); } catch (e) { res.error = 'The judge could not read the result.'; } }
      else if (o.error) res.error = o.error;
      res.timed_out = !!o.timedOut; res.limit = LIMIT;
      return res;
    });
  }
  function preload() {   // get Python ready in the background, so the first Run is quick
    var c = navigator.connection;
    if (c && c.saveData) return;
    if (!worker) startWorker();
  }
  window.addEventListener('load', function () {
    (window.requestIdleCallback || function (f) { setTimeout(f, 1500); })(preload);
  });

  /* ---------- AI tutor ---------- */
  function clip(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }
  function tutorRequest(data) {   // the same prompt as build_tutor_request() in app.py
    var mode = data.mode, system = PROMPTS.base || '', history = [], user;
    var title = clip(data.lesson_title, 200);
    if (title) system += "\nThe learner is reading the lesson '" + title + "'. Lesson text for reference:\n<lesson>\n" + clip(data.lesson_md, 6000) + '\n</lesson>';
    if (mode === 'check' || mode === 'hint') {
      var kind = data.kind === 'code' ? 'Python code' : 'written answer';
      user = 'Practice task:\n' + clip(data.task, 4500) + "\n\nLearner's answer (" + kind + '):\n<learner_answer>\n' + clip(data.code, 8000) + '\n</learner_answer>';
      var criteria = clip(data.criteria, 2000);
      if (criteria) user += '\n\nWhat a good answer must cover (rubric):\n' + criteria;
      if (data.tests === 'passed' || data.tests === 'failed') user += "\n\nAutomated tests on the learner's code: " + data.tests.toUpperCase() + '.';
      var output = clip(data.output, 4000);
      if (output) user += '\n\nOutput from running the code:\n<learner_answer>\n' + output + '\n</learner_answer>';
      system += mode === 'check' ? (PROMPTS.check || '') : (PROMPTS.hint || '');
    } else {
      user = clip(data.question, 4000);
      (Array.isArray(data.history) ? data.history : []).slice(-8).forEach(function (item) {
        if (item && (item.role === 'user' || item.role === 'assistant')) history.push({ role: item.role, content: clip(item.content, 3000) });
      });
    }
    if (!user.trim()) throw new Error('Nothing to ask.');
    var cleaned = [];
    history.concat([{ role: 'user', content: user }]).forEach(function (m) {
      if (cleaned.length && cleaned[cleaned.length - 1].role === m.role) cleaned[cleaned.length - 1].content += '\n' + m.content;
      else cleaned.push({ role: m.role, content: m.content });
    });
    while (cleaned.length && cleaned[0].role !== 'user') cleaned.shift();
    return { system: system, messages: cleaned };
  }
  var HINTS = { 401: ' Check that the API key is correct (Settings).', 403: ' The key may lack access to this model, or a network filter blocked the request.',
    404: ' Check the model name.', 413: ' The request was too long.', 429: ' Rate limit reached; wait a moment.' };
  function postJSON(url, headers, body) {
    var ctl = window.AbortController ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, 90000) : null;
    headers['Content-Type'] = 'application/json';
    return fetchReal(url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (r) {
        clearTimeout(t);
        return r.text().then(function (text) {
          var data = {}; try { data = JSON.parse(text); } catch (e) { /* not JSON */ }
          if (!r.ok) {
            var err = data.error, detail = (err && typeof err === 'object' ? err.message : err) || '';
            throw new Error('The AI service answered with HTTP ' + r.status + (detail ? ': ' + String(detail).slice(0, 200) : '') + '.' + (HINTS[r.status] || ''));
          }
          return data;
        });
      }, function (err) {
        clearTimeout(t);
        throw new Error(err && err.name === 'AbortError' ? 'The AI service took too long to answer.' : 'Could not reach the AI service. Check the internet connection; a company network may block it.');
      });
  }
  function askTutor(data) {
    var req;
    try { req = tutorRequest(data || {}); } catch (e) { return Promise.resolve({ error: e.message }); }
    if (H.proxy) {
      return postJSON(H.proxy, {}, req).then(function (d) {
        return d.reply ? { reply: String(d.reply).trim() } : { error: d.error || 'The AI returned an empty answer.' };
      }, function (e) { return { error: e.message }; });
    }
    var key = readLocal(KEY_STORE);
    if (!key) {
      openSettings('#hs-key');
      return Promise.resolve({ error: 'To use the tutor, add your Groq API key in Settings (top bar). It stays in this browser.' });
    }
    return postJSON('https://api.groq.com/openai/v1/chat/completions', { Authorization: 'Bearer ' + key }, {
      model: H.model || 'openai/gpt-oss-120b', max_completion_tokens: 2000, reasoning_effort: 'low',
      messages: [{ role: 'system', content: req.system }].concat(req.messages)
    }).then(function (d) {
      var reply = (((d.choices || [])[0] || {}).message || {}).content || '';
      return reply.trim() ? { reply: reply.trim() } : { error: 'The AI returned an empty answer.' };
    }, function (e) { return { error: e.message }; });
  }

  /* ---------- the page's /api/... requests ---------- */
  var fetchReal = window.fetch.bind(window);
  function reply(status, data) { return new Response(JSON.stringify(data), { status: status, headers: { 'Content-Type': 'application/json' } }); }
  function route(path, method, body) {
    if (path === '/api/state') return Promise.resolve(reply(200, load()));
    if (method !== 'POST' || !body || typeof body !== 'object') return Promise.resolve(reply(400, { error: 'invalid request' }));
    if (path === '/api/run') {
      if (typeof body.code !== 'string') return Promise.resolve(reply(400, { error: 'code must be a string' }));
      return runCode(body.code).then(function (r) { return reply(200, r); });
    }
    if (path === '/api/judge') {
      if (typeof body.code !== 'string' || typeof body.tests !== 'string') return Promise.resolve(reply(400, { error: 'code and tests must be strings' }));
      return judgeCode(body.code, body.tests, Math.max(0, parseInt(body.limit, 10) || 0)).then(function (r) { return reply(200, r); });
    }
    if (path === '/api/progress') return Promise.resolve(writeProgress(body) ? reply(200, { saved: true }) : reply(507, { error: 'storage full' }));
    if (path === '/api/progress-patch') {
      var key = body.key;
      if (PATCHABLE.indexOf(body.section) < 0 || !(key === null || key === undefined || (typeof key === 'string' && key.length > 0 && key.length <= 200)))
        return Promise.resolve(reply(400, { error: 'unknown section or bad key' }));
      return Promise.resolve(patchProgress(body.section, key, body.value) ? reply(200, { saved: true }) : reply(507, { error: 'storage full' }));
    }
    if (path === '/api/tutor') return askTutor(body).then(function (r) { return reply(200, r); });
    return Promise.resolve(reply(404, { error: 'not found' }));
  }
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/') !== 0) return fetchReal(input, init);
    var body = null;
    try { body = init && typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch (e) { return Promise.resolve(reply(400, { error: 'invalid JSON' })); }
    return route(url.split('?')[0], ((init && init.method) || 'GET').toUpperCase(), body);
  };

  /* ---------- Settings: tutor key, progress export / import, Python status ---------- */
  var dlg = null;
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function updatePyInfo() {
    var p = dlg && dlg.querySelector('#hs-py');
    if (!p) return;
    p.textContent = 'Python 3.12 runs inside your browser (Pyodide), so code never leaves this device. Status: ' +
      ({ off: 'not started yet', loading: 'loading', ready: 'ready', failed: 'could not load. Check the internet connection and reload.' }[workerState] || workerState) + '.';
  }
  function keyState() {
    var s = dlg.querySelector('#hs-key-state'), k = readLocal(KEY_STORE);
    if (s) s.textContent = k ? 'A key is saved in this browser (ending in ' + k.slice(-4) + ').' : 'No key saved.';
  }
  function buildSettings() {
    dlg = document.createElement('dialog');
    dlg.className = 'hs';
    dlg.setAttribute('aria-labelledby', 'hs-title');
    var model = esc(H.model || 'openai/gpt-oss-120b');
    var tutor = H.proxy
      ? '<p>The tutor on this site uses Groq (<code>' + model + '</code>). Your questions and code are sent to Groq to answer them.</p>'
      : '<p>The tutor uses Groq (<code>' + model + '</code>) with your own API key. Create one at ' +
        '<a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer">console.groq.com</a>. The key is stored only in this browser and sent only to Groq.</p>' +
        '<div class="hs-row"><input id="hs-key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your Groq API key" aria-label="Groq API key">' +
        '<button type="button" id="hs-save" class="btn sm primary">Save</button><button type="button" id="hs-forget" class="btn sm ghost">Remove</button></div>' +
        '<p id="hs-key-state" class="hs-note"></p>' +
        '<p class="hs-note">Use this only on your own device. Anyone using this browser profile could read the key.</p>';
    dlg.innerHTML =
      '<div class="hs-head"><h2 id="hs-title">Settings</h2><button type="button" class="btn sm ghost" id="hs-close">Close</button></div>' +
      (SYNC ? '<section><h3>Your ID</h3><div id="hs-account"></div></section>' : '') +
      '<section><h3>Tutor</h3>' + tutor + '</section>' +
      '<section><h3>Progress</h3><p id="hs-progress-note"></p>' +
      '<div class="hs-row"><button type="button" id="hs-export" class="btn sm">Export</button><button type="button" id="hs-import" class="btn sm">Import</button>' +
      '<span class="grow"></span><button type="button" id="hs-reset" class="btn sm ghost hs-danger">Reset all</button>' +
      '<input type="file" id="hs-file" accept=".json,application/json" hidden></div></section>' +
      '<section><h3>Python</h3><p id="hs-py"></p></section>';
    document.body.appendChild(dlg);
    dlg.querySelector('#hs-close').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    if (!H.proxy) {
      var input = dlg.querySelector('#hs-key');
      dlg.querySelector('#hs-save').addEventListener('click', function () {
        var v = input.value.trim();
        if (!v) { input.focus(); return; }
        writeLocal(KEY_STORE, v); input.value = ''; keyState();
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); dlg.querySelector('#hs-save').click(); } });
      dlg.querySelector('#hs-forget').addEventListener('click', function () { writeLocal(KEY_STORE, null); keyState(); });
    }
    dlg.querySelector('#hs-export').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(load(), null, 1)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'course-progress-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    var file = dlg.querySelector('#hs-file');
    dlg.querySelector('#hs-import').addEventListener('click', function () { file.value = ''; file.click(); });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      f.text().then(function (text) {
        var data = JSON.parse(text);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not a progress file');
        var where = getSync() ? 'this browser and in your ID "' + getSync().id + '"' : 'this browser';
        if (!confirm('Replace the progress saved in ' + where + ' with the contents of ' + f.name + '?')) return;
        replaceAll(load(), data);
        return push(true).then(function () { location.reload(); });
      }, function () { throw new Error('unreadable'); }).catch(function () { alert('That file is not a progress file exported from this course.'); });
    });
    dlg.querySelector('#hs-reset').addEventListener('click', function () {
      var s = getSync();
      if (!confirm(s ? 'Delete all progress, drafts and solved problems in this browser and in your ID "' + s.id + '", on every device? Export first if you want to keep a copy.'
                     : 'Delete all progress, drafts and solved problems saved in this browser? Export first if you want to keep a copy.')) return;
      if (!s) { writeLocal(STORE, null); location.reload(); return; }
      replaceAll(load(), {});
      push(true).then(function () { location.reload(); });
    });
  }
  function fmtTime(ms) {
    var d = new Date(ms);
    return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString();
  }
  function accountState(s) {
    if (s.error) return 'Not saved: ' + s.error;
    if (hasKeys(s.dirty)) return 'Some changes are waiting to be saved to your ID.';
    return s.at ? 'All progress is saved to your ID (last update ' + fmtTime(s.at) + ').' : '';
  }
  function refreshAccount() {   // update the status line while the dialog is open
    var s = getSync(), line = dlg && dlg.querySelector('#hs-account-state');
    if (s && line) line.textContent = accountState(s);
  }
  function renderAccount() {
    var box = dlg && dlg.querySelector('#hs-account'), note = dlg && dlg.querySelector('#hs-progress-note');
    var s = getSync();
    if (note) note.textContent = s ? 'Your progress and drafts are saved in this browser and to your ID, so they appear on every device where you sign in. Export makes a file copy.'
      : 'Your progress and drafts are saved in this browser only.' + (SYNC ? ' Sign in with an ID above to use them on other devices, or' : ' To continue on another device,') + ' export them here and import the file there.';
    if (!box) return;
    if (s) {
      box.innerHTML = '<p>Signed in as <b>' + esc(s.id) + '</b>. Sign in with the same ID and password on another device to continue there.</p>' +
        '<p id="hs-account-state" class="hs-note" role="status"></p>' +
        '<div class="hs-row"><button type="button" id="hs-sync-now" class="btn sm">Save now</button><span class="grow"></span>' +
        '<button type="button" id="hs-signout" class="btn sm ghost">Sign out</button></div>';
      refreshAccount();
      box.querySelector('#hs-sync-now').addEventListener('click', function () {
        var line = box.querySelector('#hs-account-state'); line.textContent = 'Saving...';
        pull().then(function () { return push(); }).then(refreshAccount, refreshAccount);
      });
      box.querySelector('#hs-signout').addEventListener('click', signOut);
      return;
    }
    box.innerHTML = '<p>Sign in with an ID and password to keep the same progress on all your devices. Without one, progress stays in this browser only.</p>' +
      '<form id="hs-account-form" autocomplete="on">' +
      '<div class="hs-row"><input id="hs-id" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="ID, for example kartik" aria-label="ID">' +
      '<input id="hs-pw" name="password" type="password" autocomplete="current-password" placeholder="Password" aria-label="Password"></div>' +
      '<div class="hs-row" id="hs-pw2-row" hidden><input id="hs-pw2" type="password" autocomplete="new-password" placeholder="Repeat the password" aria-label="Repeat the password"></div>' +
      '<div class="hs-row"><button type="submit" id="hs-signin" class="btn sm primary">Sign in</button><button type="button" id="hs-create" class="btn sm">Create new ID</button></div>' +
      '</form><p id="hs-account-msg" class="hs-note" role="status"></p>' +
      '<p class="hs-note">IDs use 3 to 40 letters, digits, dots, dashes or underscores. Passwords need at least 8 characters. There is no password reset, so keep it somewhere safe.</p>';
    var form = box.querySelector('#hs-account-form'), msg = box.querySelector('#hs-account-msg');
    var idIn = box.querySelector('#hs-id'), pwIn = box.querySelector('#hs-pw'), pw2Row = box.querySelector('#hs-pw2-row'), pw2In = box.querySelector('#hs-pw2');
    var buttons = [box.querySelector('#hs-signin'), box.querySelector('#hs-create')];
    function go(create) {
      var id = idIn.value.trim().toLowerCase(), pw = pwIn.value;
      if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(id)) { msg.textContent = 'The ID needs 3 to 40 letters, digits, dots, dashes or underscores.'; idIn.focus(); return; }
      if (pw.length < 8) { msg.textContent = 'The password needs at least 8 characters.'; pwIn.focus(); return; }
      if (create && pw2Row.hidden) { pw2Row.hidden = false; msg.textContent = 'Repeat the password, then click Create new ID again.'; pw2In.focus(); return; }
      if (create && pw2In.value !== pw) { msg.textContent = 'The two passwords are different.'; pw2In.focus(); return; }
      buttons.forEach(function (b) { b.disabled = true; });
      msg.textContent = create ? 'Creating your ID...' : 'Signing in...';
      signIn(id, pw, create).then(function () {
        msg.textContent = 'Done. Loading your progress...';
        location.reload();
      }, function (err) {
        buttons.forEach(function (b) { b.disabled = false; });
        msg.textContent = err && err.message && !/fetch|network/i.test(err.message) ? err.message : 'Could not reach the sync server. Check the internet connection.';
      });
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); go(false); });
    box.querySelector('#hs-create').addEventListener('click', function () { go(true); });
  }
  function openSettings(focusSel) {
    if (!dlg) buildSettings();
    if (!H.proxy) keyState();
    renderAccount();
    updatePyInfo();
    if (!dlg.open) dlg.showModal();
    var k = focusSel && dlg.querySelector(focusSel);
    if (k) k.focus();
  }
  var theme = document.getElementById('theme-btn');
  if (theme) {
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn sm'; btn.id = 'settings-btn'; btn.textContent = 'Settings';
    btn.title = 'Tutor key, progress export and import';
    btn.addEventListener('click', function () { openSettings(''); });
    theme.parentNode.insertBefore(btn, theme);
  }

  /* ---------- sync: start-up and keeping up with other devices and tabs ---------- */
  if (SYNC) {
    var first = getSync();
    tabAdopt = first ? first.adopt || 0 : 0;
    if (first) pull();
    else if (!readLocal(ASKED)) {   // a new browser: ask for an ID once
      writeLocal(ASKED, '1');
      window.addEventListener('load', function () { openSettings('#hs-id'); });
    }
    var back = function () {
      var s = getSync();
      if (!s) return;
      if ((s.adopt || 0) !== tabAdopt) { location.reload(); return; }   // another tab took in newer progress
      if (Date.now() - lastPull > 15000) pull();
    };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') push(true); else back();
    });
    window.addEventListener('pagehide', function () { push(true); });
  }
})();
