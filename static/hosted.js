/* Hosted version only (made by `python app.py --build`). There is no server behind the hosted site, so this file
   answers the page's /api/... requests itself:
     /api/run, /api/judge      Python runs in this browser (static/pyworker.js, Pyodide), with the same time limit
     /api/state, /api/progress, /api/progress-patch
                               progress is kept in this browser's localStorage (Settings has Export and Import)
     /api/tutor                the Groq API, with the visitor's own key, or through the site's tutor proxy
   It loads after course.js / python.js and before app.js / py.js. */
(function () {
  'use strict';
  var H = window.HOSTED || {};
  var PROMPTS = H.prompts || {};
  var LIMIT = H.timeout || 10, MAX_OUT = H.maxOutput || 20000;
  var STORE = 'sae-progress', KEY_STORE = 'sae-groq-key';
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
    return save(data);
  }
  function patchProgress(section, key, value) {
    var data = load();
    if (key === null || key === undefined) {
      if (value === null || value === undefined) delete data[section]; else data[section] = value;
    } else {
      var b = data[section];
      if (!b || typeof b !== 'object' || Array.isArray(b)) b = data[section] = {};
      if (value === null || value === undefined) delete b[key]; else b[key] = value;
    }
    return save(data);
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
      openSettings(true);
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
      '<section><h3>Tutor</h3>' + tutor + '</section>' +
      '<section><h3>Progress</h3><p>Your progress and drafts are saved in this browser only. To continue on another device, export them here and import the file there.</p>' +
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
        if (!confirm('Replace the progress saved in this browser with the contents of ' + f.name + '?')) return;
        save(data); location.reload();
      }).catch(function () { alert('That file is not a progress file exported from this course.'); });
    });
    dlg.querySelector('#hs-reset').addEventListener('click', function () {
      if (!confirm('Delete all progress, drafts and solved problems saved in this browser? Export first if you want to keep a copy.')) return;
      writeLocal(STORE, null); location.reload();
    });
  }
  function openSettings(focusKey) {
    if (!dlg) buildSettings();
    if (!H.proxy) keyState();
    updatePyInfo();
    if (!dlg.open) dlg.showModal();
    var k = focusKey && dlg.querySelector('#hs-key');
    if (k) k.focus();
  }
  var theme = document.getElementById('theme-btn');
  if (theme) {
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'btn sm'; btn.id = 'settings-btn'; btn.textContent = 'Settings';
    btn.title = 'Tutor key, progress export and import';
    btn.addEventListener('click', function () { openSettings(false); });
    theme.parentNode.insertBefore(btn, theme);
  }
})();
