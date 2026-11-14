(function () {
  'use strict';
  var DATA = window.COURSE;
  var SIMS = window.SIMS || {};
  var TOKEN = window.RUN_TOKEN || '';
  var LAB_KEYS = window.LAB_KEYS || [];   // course tasks that can also be opened in the Python Lab (/python)
  var state = window.SAVED || {};
  var saveTimer = null;
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Course-Token': TOKEN }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  var store = {
    get: function (k, d) { return k in state ? state[k] : d; },
    set: function (k, v) {
      state[k] = v;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { post('/api/progress', state).catch(function () { /* server stopped; progress stays in this tab */ }); }, 250);
    }
  };

  var order = [];
  DATA.modules.forEach(function (m) { m.lessons.forEach(function (id) { order.push(id); }); });
  var done = store.get('done', {});
  var checks = store.get('checks', {});
  var quizScores = store.get('quiz', {});

  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  /* ---------- streak and notices ---------- */
  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function dayDiff(a, b) { function t(s) { var p = s.split('-'); return Date.UTC(+p[0], p[1] - 1, +p[2]); } return Math.round((t(b) - t(a)) / 864e5); }
  function currentStreak() {
    var s = store.get('streak', null);
    if (!s) return 0;
    return dayDiff(s.last, today()) <= 1 ? s.count : 0;
  }
  function bumpStreak() {
    var s = store.get('streak', null), t = today();
    if (s && s.last === t) return;
    store.set('streak', { last: t, count: s && dayDiff(s.last, t) === 1 ? s.count + 1 : 1 });
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function updateChips() {
    var s = currentStreak();
    $('#nav-streak').innerHTML = s ? '<b>' + s + '</b>-day streak' : '';
  }
  function applyTheme(t) { if (t) document.documentElement.setAttribute('data-theme', t); }
  applyTheme(store.get('theme', null));

  /* ---------- syntax highlighting ---------- */
  var KW = {
    python: 'def|class|return|if|elif|else|for|while|in|not|and|or|import|from|as|with|try|except|finally|raise|lambda|yield|async|await|pass|break|continue|None|True|False|is|global|nonlocal|assert|del|match|case',
    js: 'const|let|var|function|return|if|else|for|while|of|in|new|class|extends|import|from|export|default|async|await|try|catch|finally|throw|null|undefined|true|false|this|typeof|switch|case|break|continue',
    sql: 'SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|PRIMARY|KEY|REFERENCES|NOT|NULL|UNIQUE|DEFAULT|AND|OR|AS|WITH|OVER|PARTITION|BEGIN|COMMIT|ROLLBACK|DESC|ASC|CHECK|COUNT|SUM|AVG|MAX|MIN|DISTINCT|UNION|ALL|EXPLAIN|ANALYZE|FOR|IN|EXISTS|CASE|WHEN|THEN|ELSE|END|IF',
    bash: 'if|then|else|fi|for|do|done|while|echo|export|cd|sudo|function|return|exit',
    java: 'public|private|protected|class|interface|extends|implements|static|final|void|int|long|boolean|String|new|return|if|else|for|while|try|catch|throw|throws|null|true|false|this|import|package|enum|abstract'
  };
  var PY_BUILTINS = 'print|len|range|int|str|float|list|dict|set|tuple|bool|type|isinstance|issubclass|enumerate|zip|map|filter|sorted|sum|min|max|abs|open|input|super|any|all|reversed|iter|next|id|hash|repr|format|round|divmod|pow|ord|chr|bytes|bytearray|object|getattr|setattr|hasattr|callable|vars|dir|frozenset|slice|property|staticmethod|classmethod|Exception|ValueError|TypeError|KeyError|IndexError|RuntimeError|StopIteration|AttributeError|NotImplementedError';
  var ALIAS = { py: 'python', javascript: 'js', jsx: 'js', ts: 'js', typescript: 'js', sh: 'bash', shell: 'bash', yaml: 'yaml', yml: 'yaml', dockerfile: 'bash', hcl: 'bash' };
  function highlight(code, lang) {
    lang = ALIAS[lang] || lang;
    var com, str = '"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'';
    if (lang === 'python' || lang === 'bash' || lang === 'yaml') com = '#[^\\n]*';
    else if (lang === 'js' || lang === 'java') { com = '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/'; str += '|`(?:\\\\.|[^`\\\\])*`'; }
    else if (lang === 'sql') com = '--[^\\n]*';
    else return esc(code);
    var py = lang === 'python', never = '(?!)';
    if (py) str = '(?:\\b[rRbBfFuU]{1,2})?(?:' + str + ')';
    var kw = KW[lang] ? '\\b(?:' + KW[lang] + ')\\b' : never;
    var deco = py ? '^[ \\t]*@[\\w.]+' : never;
    var defname = py ? '(?<=\\b(?:def|class)\\s+)\\w+' : never;
    var builtin = py ? '\\b(?:' + PY_BUILTINS + ')\\b(?=\\s*\\()|\\b(?:self|cls)\\b' : never;
    var call = (py || lang === 'js' || lang === 'java') ? '\\b[A-Za-z_]\\w*(?=\\()' : never;
    var num = '\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b|\\b0x[0-9a-fA-F]+\\b';
    var re = new RegExp('(' + com + ')|(' + str + ')|(' + deco + ')|(' + defname + ')|(' + kw + ')|(' + builtin + ')|(' + num + ')|(' + call + ')', (lang === 'sql' ? 'gi' : 'g') + 'm');
    var out = '', last = 0, m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      var cls = m[1] ? 'com' : m[2] ? 'str' : m[3] ? 'deco' : m[4] ? 'def' : m[5] ? (m[0] === 'self' || m[0] === 'cls' ? 'self' : 'kw') : m[6] ? (/^(self|cls)$/.test(m[0]) ? 'self' : 'bi') : m[7] ? 'num' : 'fn';
      out += '<span class="tok-' + cls + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex++;
    }
    return out + esc(code.slice(last));
  }

  /* ---------- markdown ---------- */
  function inline(s) {
    return s.split(/(`[^`]+`)/).map(function (part) {
      if (part.length > 1 && part.charAt(0) === '`' && part.charAt(part.length - 1) === '`') return '<code>' + esc(part.slice(1, -1)) + '</code>';
      var t = esc(part);
      t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      t = t.replace(/\[([^\]]+)\]\(#([a-z0-9-]+)\)/g, '<a href="#$2">$1</a>');
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
      return t;
    }).join('');
  }
  function isBlockStart(l) {
    return /^(#{1,4})\s/.test(l) || /^```/.test(l) || /^>\s?/.test(l) || /^\s*([-*]|\d+\.)\s+/.test(l) || /^\|/.test(l) || /^---\s*$/.test(l);
  }
  function renderMarkdown(md, lessonId) {
    var lines = md.replace(/\r/g, '').split('\n');
    var html = [], i = 0, checkN = 0, blockN = 0, toc = [], inPractice = false;
    function listFrom(start) {
      var items = [], j = start;
      while (j < lines.length) {
        var m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[j]);
        if (m) { items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] }); j++; }
        else if (/^\s{2,}\S/.test(lines[j]) && items.length) { items[items.length - 1].text += ' ' + lines[j].trim(); j++; }
        else break;
      }
      function build(k, indent) {
        var ordered = items[k].ordered, out = ordered ? '<ol>' : '<ul>';
        while (k < items.length && items[k].indent >= indent) {
          if (items[k].indent > indent) { var sub = build(k, items[k].indent); out = out.replace(/<\/li>$/, '') + sub.html + '</li>'; k = sub.next; continue; }
          var t = items[k].text, task = /^\[( |x)\]\s+(.*)$/.exec(t);
          if (task) {
            var id = lessonId + ':' + (checkN++);
            out += '<li class="task"><label><input type="checkbox" data-check="' + id + '"' + (checks[id] ? ' checked' : '') + '><span>' + inline(task[2]) + '</span></label>' +
              (inPractice ? '<button type="button" class="prac-btn" data-prac="' + id + '" aria-expanded="false">Practice</button><div class="prac" hidden></div>' : '') + '</li>';
          } else out += '<li>' + inline(t) + '</li>';
          k++;
        }
        return { html: out + (ordered ? '</ol>' : '</ul>'), next: k };
      }
      html.push(build(0, items[0].indent).html);
      return j;
    }
    while (i < lines.length) {
      var line = lines[i], m;
      if (!line.trim()) { i++; continue; }
      if ((m = /^(`{3,})\s*(\S*)\s*(.*)$/.exec(line))) {
        var lang = m[2], flags = m[3], buf = [], closer = new RegExp('^`{' + m[1].length + ',}\\s*$'); i++;
        while (i < lines.length && !closer.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        var code = buf.join('\n'), bid = lessonId + '-b' + (blockN++);
        if (lang === 'task') html.push('<section class="task-card" data-lesson="' + esc(lessonId) + '" data-spec="' + esc(JSON.stringify(parseTask(code))) + '"></section>');
        else if (lang === 'quiz') html.push('<div class="quiz" data-quiz="' + bid + '" data-src="' + esc(code) + '"></div>');
        else if (lang === 'sim') html.push('<div class="sim" data-sim="' + esc(code.trim()) + '"></div>');
        else if (/\brun\b/.test(flags)) html.push('<div class="codebox" data-run="1"><div class="head"><span>Python. Edit it and run it.</span><span class="grow"></span>' + (TUTOR.backend ? '<button type="button" class="btn sm ghost" data-act="ask" title="Ask the tutor to explain this code">Explain</button>' : '') + '<button type="button" class="btn sm" data-act="reset">Reset</button><button type="button" class="btn sm primary" data-act="run">Run</button></div><div class="editor"><pre class="hl" aria-hidden="true"><code></code></pre><textarea spellcheck="false" wrap="off" aria-label="Editable Python code" rows="' + Math.min(30, buf.length + 1) + '" data-orig="' + esc(code) + '">' + esc(code) + '</textarea></div><pre class="out" aria-live="polite"></pre></div>');
        else html.push('<div class="codebox"><div class="head"><span>' + esc(lang || 'text') + '</span><span class="grow"></span><button type="button" class="btn sm ghost" data-act="copy">Copy</button></div><pre><code>' + highlight(code, lang) + '</code></pre></div>');
        continue;
      }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) {
        var lvl = m[1].length, text = m[2], hid = 'h-' + slug(text);
        if (lvl === 2) { toc.push({ id: hid, text: text }); inPractice = /^practice\b|^exercises?\b/i.test(text); }
        html.push('<h' + lvl + ' id="' + hid + '">' + inline(text) + '</h' + lvl + '>'); i++; continue;
      }
      if (/^---\s*$/.test(line)) { html.push('<hr>'); i++; continue; }
      if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        var cells = function (l) { return l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(function (c) { return c.trim().replace(/\\\|/g, '|'); }); };
        var t = '<div class="tablewrap"><table><thead><tr>' + cells(line).map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
        i += 2;
        while (i < lines.length && /^\|/.test(lines[i])) { t += '<tr>' + cells(lines[i]).map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>'; i++; }
        html.push(t + '</tbody></table></div>'); continue;
      }
      if (/^>\s?/.test(line)) {
        var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
        html.push('<blockquote>' + q.join('\n').split(/\n\s*\n/).map(function (p) { return '<p>' + inline(p.replace(/\n/g, ' ')) + '</p>'; }).join('') + '</blockquote>'); continue;
      }
      if (/^\s*([-*]|\d+\.)\s+/.test(line)) { i = listFrom(i); continue; }
      var para = [line]; i++;
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { para.push(lines[i]); i++; }
      html.push('<p>' + inline(para.join(' ')) + '</p>');
    }
    return { html: html.join('\n'), toc: toc };
  }

  /* ---------- live-highlighted editors ---------- */
  function syncEditor(ta) {
    var pre = ta.parentNode.querySelector('.hl'), codeEl = pre.firstChild;
    codeEl.innerHTML = highlight(ta.value, 'python') + '\n';
    pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft;
  }
  function wireEditor(ta) {
    syncEditor(ta);
    ta.addEventListener('input', function () { syncEditor(ta); });
    ta.addEventListener('scroll', function () { var pre = ta.parentNode.querySelector('.hl'); pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; });
  }
  function mountEditors(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.codebox textarea'), wireEditor);
  }

  /* ---------- python runner (runs on your own machine through app.py) ---------- */
  function runPy(code, out) {
    out.textContent = 'Running…';
    return post('/api/run', { code: code }).then(function (r) {
      var text = (r.output || '(no output)') + (r.timed_out ? '\n[stopped: ran longer than ' + r.limit + ' seconds]' : '');
      out.textContent = text; return text;
    }).catch(function () {
      var msg = 'Could not reach the course server. Check that app.py is still running in your terminal, then reload this page.';
      out.textContent = msg; return msg;
    });
  }

  /* ---------- AI tutor (optional; the server decides which backend, if any) ---------- */
  var TUTOR = window.TUTOR || { backend: '' };
  var OFF_MSG = 'The AI tutor is **switched off**, so nothing is sent anywhere. To turn it on, stop `app.py` and restart it from PowerShell with one of:\n\n```bash\n# Private: a model running on this laptop (needs Ollama installed and running)\n$env:COURSE_LLM = "ollama"; python app.py\n\n# Groq (openai/gpt-oss-120b): needs a key; your code and questions are sent to Groq\n$env:COURSE_LLM = "groq"; $env:GROQ_API_KEY = "your-key"; python app.py\n\n# Anthropic API: needs a key; your code and questions are sent to Anthropic\n$env:COURSE_LLM = "anthropic"; $env:ANTHROPIC_API_KEY = "your-key"; python app.py\n```\n\nCheck your company policy before using an online service.';
  function lessonCtx() {
    var L = DATA.lessons[location.hash.replace(/^#/, '')];
    return L ? { title: L.title, md: L.md.slice(0, 6000) } : { title: '', md: '' };
  }
  function askTutor(payload) {
    var c = lessonCtx(); payload.lesson_title = c.title; payload.lesson_md = c.md;
    return post('/api/tutor', payload).then(function (r) { if (r.error) throw new Error(r.error); return r.reply; });
  }
  function mdInto(node, text) {
    node.innerHTML = renderMarkdown(text, 'ai').html.replace(/ id="h-[^"]*"/g, '');
    mountEditors(node);
  }

  var tutorEl = $('#tutor'), msgs = $('#tutor-msgs'), tutorInput = $('#tutor-input'), fab = $('#tutor-fab'), chat = [];
  function addMsg(role, text) {
    var m = el('div', { 'class': 'msg ' + role });
    if (role === 'bot') mdInto(m, text); else m.textContent = text;
    msgs.appendChild(m); msgs.scrollTop = msgs.scrollHeight; return m;
  }
  function greet() { addMsg('bot', TUTOR.backend ? 'Hi! I can explain this lesson, review your practice code, or quiz you. What would you like to do?' : OFF_MSG); }
  function openTutor(open) {
    tutorEl.hidden = !open; fab.setAttribute('aria-expanded', String(open));
    if (!open) return;
    $('#tutor-status').textContent = TUTOR.backend ? (TUTOR.backend === 'ollama' ? 'private · local model' : 'online · ' + TUTOR.model) : 'off';
    if (!msgs.children.length) greet();
    tutorInput.focus();
  }
  function sendChat(q) {
    q = q.trim(); if (!q) return;
    openTutor(true); addMsg('user', q);
    if (!TUTOR.backend) { addMsg('bot', OFF_MSG); return; }
    var hist = chat.slice(-8), pending = addMsg('bot', 'Thinking…');
    chat.push({ role: 'user', content: q });
    askTutor({ mode: 'chat', question: q, history: hist }).then(function (r) {
      chat.push({ role: 'assistant', content: r }); mdInto(pending, r);
    }).catch(function (e) { chat.pop(); pending.textContent = 'AI tutor error: ' + e.message; })
      .then(function () { msgs.scrollTop = msgs.scrollHeight; });
  }
  fab.addEventListener('click', function () { openTutor(tutorEl.hidden); });
  $('#tutor-close').addEventListener('click', function () { openTutor(false); fab.focus(); });
  $('#tutor-clear').addEventListener('click', function () { msgs.innerHTML = ''; chat = []; greet(); });
  $('#tutor-form').addEventListener('submit', function (e) { e.preventDefault(); var q = tutorInput.value; tutorInput.value = ''; sendChat(q); });
  tutorInput.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#tutor-form').requestSubmit(); } });
  Array.prototype.forEach.call(document.querySelectorAll('.tutor-chips button'), function (b) { b.addEventListener('click', function () { sendChat(b.getAttribute('data-q')); }); });

  /* ---------- practice tasks: statement + editor + tests + AI review ---------- */
  var CODE_HINT = /\b(write|implement|build|extend|given|create|function|script|rebuild|refactor|parse|compute|merge|print|add)\b|`/i;
  function parseTask(text) {
    var spec = { kind: 'code' }, cur = null, sec = {};
    text.split('\n').forEach(function (line) {
      if (line.slice(0, 2) === '@@') { cur = line.slice(2).trim().toLowerCase(); sec[cur] = []; }
      else if (cur === null) { var k = line.indexOf(':'); if (k > 0) spec[line.slice(0, k).trim().toLowerCase()] = line.slice(k + 1).trim(); }
      else sec[cur].push(line);
    });
    Object.keys(sec).forEach(function (k) { spec[k] = sec[k].join('\n').replace(/^\n+|\n+$/g, ''); });
    return spec;
  }
  function lastLine(t) { var l = t.trim().split('\n'); return l[l.length - 1] || ''; }

  /* o = { key, kind ('code'|'text'|undefined for legacy), task, starter, tests, hint, solution, criteria, onPass } */
  function buildBench(box, o) {
    var fixed = o.kind === 'code' || o.kind === 'text', drafts = store.get('drafts', {});
    var d = drafts[o.key] || { kind: fixed ? o.kind : (CODE_HINT.test(o.task) ? 'code' : 'text'), text: '' };
    if (fixed) d.kind = o.kind;
    var aiMain = !o.tests;   // no automatic tests: the AI check is the main check
    box.innerHTML = '<div class="bench"><div class="bench-head"><b>Practice window</b>' +
      (fixed ? '<span class="muted">' + (d.kind === 'code' ? 'Python 3 · runs on your machine' : 'Write your answer below') + '</span>'
             : '<span class="seg"><button type="button" data-k="code">Python code</button><button type="button" data-k="text">Written answer</button></span>') + '</div>' +
      '<div class="editor"><pre class="hl" aria-hidden="true"><code></code></pre><textarea spellcheck="false" rows="12" aria-label="Your answer"></textarea></div>' +
      '<div class="bench-actions">' +
      '<button type="button" data-b="run" class="btn">Run</button>' +
      (o.tests ? '<button type="button" data-b="test" class="btn primary">Run tests</button>' : '') +
      '<button type="button" data-b="ai" class="btn' + (aiMain ? ' primary' : '') + '">' + (aiMain ? 'Check my answer' : 'Ask for a review') + '</button>' +
      '<button type="button" data-b="hint" class="btn">Hint</button>' +
      (o.criteria ? '<button type="button" data-b="crit" class="btn">What a good answer covers</button>' : '') +
      (o.solution ? '<button type="button" data-b="sol" class="btn">Solution</button>' : '') +
      '<button type="button" data-b="err" class="btn" hidden>Explain the error</button>' +
      '<span class="grow"></span><button type="button" data-b="clear" class="btn ghost">Reset</button></div>' +
      '<pre class="out" aria-live="polite"></pre><div class="feedback" aria-live="polite"></div></div>';
    var ta = $('textarea', box), ed = $('.editor', box), out = $('.out', box), fb = $('.feedback', box), act = {}, testState = 'not run';
    Array.prototype.forEach.call(box.querySelectorAll('[data-b]'), function (b) { act[b.getAttribute('data-b')] = b; });
    function starter() { return o.starter || (d.kind === 'code' ? '# ' + o.task.split('\n')[0].slice(0, 160) + '\n\n' : ''); }
    ta.value = d.text || starter();
    wireEditor(ta);
    function save() { d.text = ta.value; var all = store.get('drafts', {}); all[o.key] = d; store.set('drafts', all); }
    ta.addEventListener('input', save);
    function setKind(k) {
      d.kind = k; ed.classList.toggle('plain', k === 'text'); ta.wrap = k === 'code' ? 'off' : 'soft';
      act.run.hidden = k !== 'code';
      Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-k') === k)); });
      syncEditor(ta); save();
    }
    Array.prototype.forEach.call(box.querySelectorAll('[data-k]'), function (b) { b.addEventListener('click', function () { setKind(b.getAttribute('data-k')); }); });
    setKind(d.kind);
    function busy(on) { ['test', 'ai', 'hint', 'err'].forEach(function (k) { if (act[k]) act[k].disabled = on; }); }
    function empty() { return !ta.value.replace(/^\s*#.*$/gm, '').trim() || ta.value.trim() === starter().trim(); }
    function verdict(ok, text) { fb.insertBefore(el('div', { 'class': 'verdict ' + (ok ? 'ok' : 'no') }, text), fb.firstChild); }
    function passed() {
      if (o.onPass) o.onPass();
    }

    function runTests() {
      var sentinel = 'PASS-' + Math.random().toString(36).slice(2, 10), tmp = document.createElement('pre');
      out.textContent = 'Running tests…'; fb.textContent = '';
      return runPy(ta.value + '\n\n' + o.tests + '\nprint(' + JSON.stringify(sentinel) + ')\n', tmp).then(function (text) {
        if (text.indexOf(sentinel) >= 0) {
          out.textContent = text.split(sentinel).join('').trim();
          testState = 'passed'; fb.textContent = 'Every test passed. Nice work! You can still ask for an AI review of your style or approach.';
          verdict(true, 'All tests passed'); passed();
        } else {
          testState = 'failed'; out.textContent = text;
          fb.textContent = 'Your code did not pass yet. The last line of the output says which check failed: ' + lastLine(text);
          verdict(false, 'A test failed');
        }
        return testState;
      });
    }
    function aiCall(mode, outText) {
      if (!TUTOR.backend) { mdInto(fb, OFF_MSG); return Promise.resolve(); }
      fb.textContent = mode === 'hint' ? 'Thinking of a hint…' : 'Reviewing your answer…';
      return askTutor({ mode: mode, task: o.task, code: ta.value, kind: d.kind, output: outText || '', criteria: o.criteria || '', tests: testState }).then(function (reply) {
        if (mode === 'hint') { mdInto(fb, '**Hint.** ' + reply); return; }
        var m = /^\s*VERDICT:\s*(PASS|NEEDS WORK)[^\n]*\n?/i.exec(reply), pass = !!m && /^pass$/i.test(m[1]);
        mdInto(fb, m ? reply.slice(m[0].length) : reply);
        if (m) verdict(pass, pass ? 'Looks correct' : 'Needs more work');
        if (pass) passed();
      }).catch(function (e) { fb.textContent = 'AI tutor error: ' + e.message; });
    }

    act.run.addEventListener('click', function () {
      act.err.hidden = true;
      runPy(ta.value, out).then(function (t) { act.err.hidden = !/Traceback|Error/.test(t) || !TUTOR.backend; });
    });
    if (act.test) act.test.addEventListener('click', function () { if (empty()) { fb.textContent = 'Write your solution first, then run the tests.'; return; } busy(true); runTests().then(function () { busy(false); }); });
    act.ai.addEventListener('click', function () {
      if (empty()) { fb.textContent = 'Write your answer first, then ask for a review.'; return; }
      busy(true);
      (d.kind === 'code' && o.tests ? runTests() : d.kind === 'code' ? runPy(ta.value, out) : Promise.resolve('')).then(function (t) {
        return aiCall('check', d.kind === 'code' && !o.tests ? t : out.textContent);
      }).then(function () { busy(false); });
    });
    act.hint.addEventListener('click', function () {
      if (o.hint) { mdInto(fb, '**Hint.** ' + o.hint); return; }
      busy(true); aiCall('hint', out.textContent).then(function () { busy(false); });
    });
    if (act.crit) act.crit.addEventListener('click', function () { mdInto(fb, '**A good answer covers:**\n\n' + o.criteria); });
    if (act.sol) act.sol.addEventListener('click', function () {
      if (!window.confirm('Try it yourself first: that is where the learning happens. Show the solution anyway?')) return;
      mdInto(fb, '**Reference solution**\n\n' + (d.kind === 'code' ? '```python\n' + o.solution + '\n```' : o.solution));
    });
    act.err.addEventListener('click', function () {
      sendChat('My code gave an error. Task: ' + o.task + '\n\nCode:\n```python\n' + ta.value + '\n```\n\nOutput:\n```\n' + out.textContent.slice(-1500) + '\n```\nWhat is wrong? Explain, and hint without giving the full answer.');
    });
    act.clear.addEventListener('click', function () { ta.value = starter(); syncEditor(ta); save(); out.textContent = ''; fb.textContent = ''; testState = 'not run'; });
    box.hidden = false; ta.focus();
  }
  function tickTask(root, key, id) {
    var cb = $('input[data-check]', root);
    if (cb && !cb.checked) { cb.checked = true; checks[id || key] = 1; store.set('checks', checks); bumpStreak(); updateChips(); toast('Task marked as solved'); }
  }
  /* A task written in a ```task block in the lesson */
  function mountTask(box) {
    var spec; try { spec = JSON.parse(box.getAttribute('data-spec')); } catch (e) { box.textContent = 'Task data error.'; return; }
    var key = box.getAttribute('data-lesson') + ':t:' + spec.id;
    var level = /^(easy|medium|hard)$/.test(spec.level || '') ? spec.level : '';
    box.innerHTML = '<div class="task-head"><label class="task-done"><input type="checkbox" data-check="' + esc(key) + '"' + (checks[key] ? ' checked' : '') + '><span class="task-title">' + esc(spec.title || 'Task') + '</span></label>' +
      '<span class="badges">' + (level ? '<span class="badge ' + level + '">' + level + '</span>' : '') + '<span class="badge kind">' + (spec.kind === 'text' ? 'written' : 'code') + '</span></span></div>' +
      '<div class="task-body"></div><div class="task-actions"><button type="button" class="btn start" aria-expanded="false">Open the editor</button>' +
      (LAB_KEYS.indexOf(key) >= 0 ? '<a class="lab-link" href="/python#/problem/' + encodeURIComponent(key) + '" title="The same exercise in the Python Lab. Your status and draft are shared.">Open in Python Lab</a>' : '') +
      '</div><div class="prac" hidden></div>';
    $('.task-body', box).innerHTML = renderMarkdown(spec.statement || '', 'ts').html.replace(/ id="h-[^"]*"/g, '');
    var btn = $('.start', box), prac = $('.prac', box);
    btn.addEventListener('click', function () {
      if (!prac.firstChild) {
        buildBench(prac, { key: key, kind: spec.kind === 'text' ? 'text' : 'code', task: (spec.title || '') + '\n' + (spec.statement || ''), starter: spec.starter, tests: spec.tests, hint: spec.hint, solution: spec.solution, criteria: spec.criteria, onPass: function () { tickTask(box, key); } });
        btn.setAttribute('aria-expanded', 'true'); btn.textContent = 'Hide the editor'; return;
      }
      prac.hidden = !prac.hidden; btn.setAttribute('aria-expanded', String(!prac.hidden)); btn.textContent = prac.hidden ? 'Open the editor' : 'Hide the editor';
    });
  }
  /* Older plain checklist items under a Practice heading */
  function openBench(btn) {
    var li = btn.closest('li'), box = $('.prac', li), id = btn.getAttribute('data-prac');
    if (box.firstChild) { box.hidden = !box.hidden; btn.setAttribute('aria-expanded', String(!box.hidden)); return; }
    buildBench(box, { key: id, task: $('label span', li).textContent, onPass: function () { tickTask(li, id); } });
    btn.setAttribute('aria-expanded', 'true');
  }

  /* ---------- quizzes ---------- */
  function mountQuiz(box) {
    var qs; try { qs = JSON.parse(box.getAttribute('data-src')); } catch (e) { box.textContent = 'Quiz data error.'; return; }
    var id = box.getAttribute('data-quiz'), answered = 0, right = 0;
    box.innerHTML = '<h3>Check yourself</h3><div class="score"></div><div class="qbar"><span></span></div>';
    var score = $('.score', box);
    function show() {
      $('.qbar span', box).style.width = Math.round(100 * answered / qs.length) + '%'; score.textContent = answered ? right + ' of ' + qs.length + ' correct' + (answered === qs.length ? '' : ' so far') : qs.length + ' questions' + (quizScores[id] != null ? ' · last score ' + quizScores[id] + '/' + qs.length : ''); }
    qs.forEach(function (q) {
      var wrap = el('div', { 'class': 'q' }, '<p>' + inline(q.q) + '</p>');
      var opts = el('div', { 'class': 'opts' }), why = el('div', { 'class': 'why' });
      q.options.forEach(function (o, k) {
        var b = el('button', { type: 'button' }, inline(o));
        b.addEventListener('click', function () {
          if (wrap.getAttribute('data-done')) return;
          wrap.setAttribute('data-done', '1'); answered++;
          if (k === q.answer) { right++; b.className = 'right'; }
          else { b.className = 'wrong'; opts.children[q.answer].className = 'right'; }
          Array.prototype.forEach.call(opts.children, function (x) { x.disabled = true; });
          why.className = 'why show';
          why.innerHTML = (k === q.answer ? 'Correct. ' : 'Not quite. ') + inline(q.why || '');
          if (answered === qs.length) {
            quizScores[id] = right; store.set('quiz', quizScores);
            var res = el('div', { 'class': 'result' }, '<span>' + (right === qs.length ? 'All ' + qs.length + ' correct.' : right + ' of ' + qs.length + ' correct. Re-read the sections you missed, then try again.') + '</span>');
            var again = el('button', { type: 'button', 'class': 'btn sm' }, 'Retry');
            again.addEventListener('click', function () { mountQuiz(box); });
            res.appendChild(again); box.appendChild(res);
            bumpStreak(); updateChips();
          }
          show();
        });
        opts.appendChild(b);
      });
      wrap.appendChild(opts); wrap.appendChild(why); box.appendChild(wrap);
    });
    show();
  }

  /* ---------- views ---------- */
  var main = $('#main'), navList = $('#nav-list'), tocBox = $('#toc'), searchInput = $('#search-input');
  function lessonCount(m) { return m.lessons.filter(function (id) { return done[id]; }).length; }
  function renderNav(current) {
    var openMods = store.get('open', {});
    navList.innerHTML = '';
    DATA.modules.forEach(function (m, mi) {
      var has = m.lessons.indexOf(current) >= 0, open = has || openMods[m.id];
      var box = el('div', { 'class': 'mod' });
      var btn = el('button', { type: 'button', 'aria-expanded': open ? 'true' : 'false' }, '<span class="chev" aria-hidden="true"></span><span class="name">' + esc(m.title) + '</span><span class="count">' + lessonCount(m) + '/' + m.lessons.length + '</span>');
      var ul = el('ul'); ul.hidden = !open;
      m.lessons.forEach(function (id) {
        var L = DATA.lessons[id];
        ul.appendChild(el('li', null, '<a href="#' + id + '"' + (id === current ? ' class="current" aria-current="page"' : '') + '><span class="dot' + (done[id] ? ' done' : '') + '" aria-hidden="true"></span><span>' + esc(L.title) + '</span></a>'));
      });
      btn.addEventListener('click', function () { ul.hidden = !ul.hidden; btn.setAttribute('aria-expanded', String(!ul.hidden)); openMods[m.id] = !ul.hidden; store.set('open', openMods); });
      box.appendChild(btn); box.appendChild(ul); navList.appendChild(box);
    });
    var n = order.filter(function (id) { return done[id]; }).length;
    $('#overall-text').innerHTML = '<b>' + n + '</b> / ' + order.length + ' lessons';
    $('#overall-bar').style.width = (order.length ? Math.round(100 * n / order.length) : 0) + '%';
    updateChips();
  }
  function renderHome() {
    var last = store.get('last', null), mins = 0;
    order.forEach(function (id) { mins += DATA.lessons[id].minutes || 0; });
    var hasLast = last && DATA.lessons[last], nDone = order.filter(function (k) { return done[k]; }).length;
    var tasks = 0, tasksDone = 0;
    order.forEach(function (id) {
      var re = /^(`{4,})task[ \t]*\n([\s\S]*?)\n\1[ \t]*$/gm, mm;
      while ((mm = re.exec(DATA.lessons[id].md))) {
        var sp = parseTask(mm[2]);
        if (sp.id) { tasks++; if (checks[id + ':t:' + sp.id]) tasksDone++; }
      }
    });
    var firstOpen = order.filter(function (k) { return !done[k]; })[0];
    var h = '<div class="article home"><div class="eyebrow">Course overview</div><h1>Software and AI Engineering</h1>' +
      '<p class="lede">' + order.length + ' lessons in ' + DATA.modules.length + ' modules, about ' + Math.round(mins / 60) + ' hours of reading. Python and data structures first, then backend, system design, operations and applied AI. Every lesson has runnable code, a quiz and practice tasks.</p>' +
      '<div class="resume"><div><div class="eyebrow">' + (hasLast ? 'Last opened' : 'Start here') + '</div><div class="what">' + esc(DATA.lessons[hasLast ? last : order[0]].title) + '</div></div><span class="grow"></span>' +
      (firstOpen && firstOpen !== (hasLast ? last : order[0]) ? '<a class="btn" href="#' + firstOpen + '">Next unfinished lesson</a>' : '') +
      '<a class="btn primary" href="#' + (hasLast ? last : order[0]) + '">' + (hasLast ? 'Continue' : 'Start') + '</a></div>' +
      '<div class="summary"><div><b>' + nDone + '</b><span>of ' + order.length + ' lessons completed</span></div>' +
      '<div><b>' + tasksDone + '</b><span>of ' + tasks + ' practice tasks solved</span></div>' +
      '<div><b>' + currentStreak() + '</b><span>day streak</span></div></div>' +
      '<h2 class="list-title">Modules</h2><div class="rows">';
    DATA.modules.forEach(function (m, k) {
      var c = lessonCount(m), p = m.lessons.length ? Math.round(100 * c / m.lessons.length) : 0;
      h += '<a class="row' + (p === 100 ? ' done' : '') + '" href="#' + m.lessons[0] + '"><span class="n">' + (k < 9 ? '0' : '') + (k + 1) + '</span>' +
        '<span class="body"><span class="t">' + esc(m.title) + '</span><span class="b">' + esc(m.blurb) + '</span></span>' +
        '<span class="prog"><span class="track"><span class="fill" style="width:' + p + '%"></span></span><span class="meta">' + c + ' / ' + m.lessons.length + '</span></span></a>';
    });
    main.innerHTML = h + '</div><p class="credit">Developed by Kartik</p></div>'; tocBox.innerHTML = '';
  }
  function renderLesson(id) {
    var L = DATA.lessons[id], mod = DATA.modules.filter(function (m) { return m.lessons.indexOf(id) >= 0; })[0];
    var r = renderMarkdown(L.md, id), k = order.indexOf(id);
    var prev = order[k - 1], next = order[k + 1];
    main.innerHTML = '<article class="article"><div class="eyebrow">' + esc(mod.title) + ' / Lesson ' + (k + 1) + ' of ' + order.length + '</div><h1>' + esc(L.title) + '</h1><p class="meta">About ' + (L.minutes || 20) + ' minutes</p>' + r.html +
      '<div class="done-row"><button type="button" class="btn" id="done-btn"></button><span class="grow"></span>' +
      (prev ? '<a class="btn" href="#' + prev + '">Previous: ' + esc(DATA.lessons[prev].title) + '</a>' : '') + (next ? '<a class="btn primary" href="#' + next + '">Next: ' + esc(DATA.lessons[next].title) + '</a>' : '') + '</div></article>';
    tocBox.innerHTML = r.toc.length ? '<strong>On this page</strong>' + r.toc.map(function (t) { return '<a href="#' + id + '" data-jump="' + t.id + '">' + esc(t.text) + '</a>'; }).join('') : '';
    var btn = $('#done-btn');
    function label() { btn.textContent = done[id] ? 'Completed. Click to undo' : 'Mark lesson as completed'; btn.classList.toggle('is-done', !!done[id]); }
    btn.addEventListener('click', function () {
      if (done[id]) delete done[id];
      else {
        done[id] = 1; bumpStreak();
        var left = order.filter(function (x) { return !done[x]; }).length;
        toast(left === 0 ? 'Lesson completed. That was the last one.' : 'Lesson completed. ' + left + ' to go.');
      }
      store.set('done', done); label(); renderNav(id);
    });
    label();
    mountEditors(main);
    Array.prototype.forEach.call(main.querySelectorAll('.task-card'), mountTask);
    Array.prototype.forEach.call(main.querySelectorAll('.quiz'), mountQuiz);
    Array.prototype.forEach.call(main.querySelectorAll('.sim'), function (box) {
      var name = box.getAttribute('data-sim');
      if (SIMS[name]) { try { SIMS[name](box); } catch (e) { box.textContent = 'This simulator failed to start.'; } }
      else box.textContent = 'Unknown simulator: ' + name;
    });
    store.set('last', id);
    setupScrollSpy();
  }
  function setupScrollSpy() {
    var links = Array.prototype.slice.call(tocBox.querySelectorAll('a[data-jump]'));
    if (!links.length) return;
    var heads = links.map(function (a) { return document.getElementById(a.getAttribute('data-jump')); });
    spy = function () {
      var cur = 0;
      heads.forEach(function (h, i) { if (h && h.getBoundingClientRect().top < 120) cur = i; });
      links.forEach(function (a, i) { a.classList.toggle('active', i === cur); });
    };
    spy();
  }
  var spy = null;
  function onScroll() {
    var h = document.documentElement, max = h.scrollHeight - h.clientHeight;
    $('#read-progress').style.width = (max > 0 && location.hash.length > 1 && DATA.lessons[location.hash.slice(1)] ? Math.min(100, 100 * h.scrollTop / max) : 0) + '%';
    $('#to-top').hidden = h.scrollTop < 600;
    if (spy) spy();
  }
  function renderSearch(q) {
    var ql = q.toLowerCase(), hits = [];
    order.forEach(function (id) {
      var L = DATA.lessons[id], pos = L.md.toLowerCase().indexOf(ql), inTitle = L.title.toLowerCase().indexOf(ql) >= 0;
      if (pos < 0 && !inTitle) return;
      var snip = pos >= 0 ? L.md.slice(Math.max(0, pos - 70), pos + 110).replace(/[#`*|>\n]+/g, ' ') : '';
      hits.push({ id: id, title: L.title, snip: snip, rank: inTitle ? 0 : 1 });
    });
    hits.sort(function (a, b) { return a.rank - b.rank; });
    var re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    main.innerHTML = '<div class="article"><div class="crumb">Search</div><h1>' + hits.length + ' lesson' + (hits.length === 1 ? '' : 's') + ' mention “' + esc(q) + '”</h1>' +
      (hits.length ? hits.map(function (h) { return '<a class="result" href="#' + h.id + '"><strong>' + esc(h.title) + '</strong><small>…' + esc(h.snip).replace(re, '<mark>$1</mark>') + '…</small></a>'; }).join('') : '<p>No lesson contains that text. Try a shorter or different term.</p>') + '</div>';
    tocBox.innerHTML = '';
  }
  function route() {
    var id = (location.hash || '').replace(/^#/, '');
    var q = searchInput.value.trim();
    $('#sidebar-nav').classList.remove('open'); $('#menu-btn').setAttribute('aria-expanded', 'false');
    if (q.length >= 2 && route.fromSearch) { route.fromSearch = false; renderSearch(q); renderNav(null); return; }
    if (DATA.lessons[id]) { renderLesson(id); renderNav(id); } else { spy = null; renderHome(); renderNav(null); }
    window.scrollTo(0, 0); onScroll();
  }

  /* ---------- events ---------- */
  window.addEventListener('hashchange', function () { searchInput.value = ''; route(); });
  searchInput.addEventListener('input', function () {
    var q = searchInput.value.trim();
    if (q.length >= 2) { renderSearch(q); } else { route(); }
  });
  $('#menu-btn').addEventListener('click', function () {
    var open = $('#sidebar-nav').classList.toggle('open'); this.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.matches && t.matches('[data-jump]')) { e.preventDefault(); var h = document.getElementById(t.getAttribute('data-jump')); if (h) h.scrollIntoView(); return; }
    if (t.matches && t.matches('[data-prac]')) { openBench(t); return; }
    var act = t.getAttribute && t.getAttribute('data-act');
    if (!act) return;
    var box = t.closest('.codebox');
    if (act === 'ask') { sendChat('Explain this code step by step, briefly:\n```python\n' + $('textarea', box).value + '\n```'); return; }
    if (act === 'copy') {
      var txt = $('pre', box).textContent;
      try { navigator.clipboard.writeText(txt).then(function () { t.textContent = 'Copied'; setTimeout(function () { t.textContent = 'Copy'; }, 1200); }, function () { t.textContent = 'Select and copy'; }); }
      catch (err) { t.textContent = 'Select and copy'; }
    } else if (act === 'run') { runPy($('textarea', box).value, $('.out', box)); }
    else if (act === 'reset') { var ta = $('textarea', box); ta.value = ta.getAttribute('data-orig'); syncEditor(ta); $('.out', box).textContent = ''; }
  });
  document.addEventListener('change', function (e) {
    var id = e.target.getAttribute && e.target.getAttribute('data-check');
    if (!id) return;
    if (e.target.checked) checks[id] = 1; else delete checks[id];
    store.set('checks', checks);
  });
  /* Progress can also change in the Python Lab (another tab). Pick it up when this tab gets focus again. */
  window.addEventListener('focus', function () {
    fetch('/api/state', { headers: { 'X-Course-Token': TOKEN } }).then(function (r) { return r.ok ? r.json() : null; }).then(function (fresh) {
      if (!fresh) return;
      var k, theirs = fresh.checks || {};
      for (k in checks) { if (Object.prototype.hasOwnProperty.call(checks, k)) delete checks[k]; }
      for (k in theirs) { if (Object.prototype.hasOwnProperty.call(theirs, k)) checks[k] = theirs[k]; }
      state.checks = checks;
      if (fresh.drafts) state.drafts = fresh.drafts;
      if (fresh.streak) state.streak = fresh.streak;
      Array.prototype.forEach.call(document.querySelectorAll('input[data-check]'), function (cb) { cb.checked = !!checks[cb.getAttribute('data-check')]; });
      updateChips(false);
    }).catch(function () { /* server stopped: keep what we have */ });
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  $('#to-top').addEventListener('click', function () { window.scrollTo({ top: 0 }); });
  $('#theme-btn').addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    var next = cur === 'dark' ? 'light' : 'dark'; applyTheme(next); store.set('theme', next);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !tutorEl.hidden) { openTutor(false); return; }
    var tag = e.target.tagName, typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === '/') { e.preventDefault(); searchInput.focus(); return; }
      var cur = location.hash.slice(1), k = order.indexOf(cur);
      if (k >= 0 && e.key === 'ArrowRight' && order[k + 1]) location.hash = order[k + 1];
      if (k >= 0 && e.key === 'ArrowLeft' && order[k - 1]) location.hash = order[k - 1];
    }
    if (e.target.matches && e.target.matches('.codebox textarea, .editor textarea') && !e.target.parentNode.classList.contains('plain')) codeKey(e, e.target);
  });
  /* Code-editor behaviour for the Python textareas: auto-indent, Tab / Shift+Tab, smart Backspace */
  function replaceRange(ta, a, b, text, selA, selB) {
    ta.setSelectionRange(a, b);
    var ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (err) { ok = false; }   // keeps Ctrl+Z working
    if (!ok) { ta.setRangeText(text, a, b, 'end'); ta.dispatchEvent(new Event('input')); }
    ta.setSelectionRange(selA, selB);
  }
  function codeKey(e, ta) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var IND = '    ', v = ta.value, s = ta.selectionStart, en = ta.selectionEnd, ls = v.lastIndexOf('\n', s - 1) + 1;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (s === en && !e.shiftKey) { replaceRange(ta, s, en, IND, s + 4, s + 4); return; }
      var le = v.indexOf('\n', en > s && v.charAt(en - 1) === '\n' ? en - 1 : en); if (le < 0) le = v.length;
      var block = v.slice(ls, le).split('\n');
      var out = block.map(function (l) { return e.shiftKey ? l.replace(/^( {1,4}|\t)/, '') : IND + l; }).join('\n');
      var first = out.split('\n')[0].length - block[0].length;
      replaceRange(ta, ls, le, out, Math.max(ls, s + first), en + (out.length - (le - ls)));
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      var line = v.slice(ls, s), indent = /^[ \t]*/.exec(line)[0];
      if (/:\s*$/.test(line.replace(/\s+#.*$/, ''))) indent += IND;
      replaceRange(ta, s, en, '\n' + indent, s + 1 + indent.length, s + 1 + indent.length);
    } else if (e.key === 'Backspace' && s === en) {
      var before = v.slice(ls, s);
      if (before.length >= 4 && /^ +$/.test(before) && before.length % 4 === 0) { e.preventDefault(); replaceRange(ta, s - 4, s, '', s - 4, s - 4); }
    }
  }
  route();
})();
