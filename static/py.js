/* Python Lab: the separate Python learning portal served at /python.
   Progress is stored in the same progress.json as the main course. A problem that also exists in the main course
   uses the same key there and here, so solving it (or typing a draft) in one place shows up in the other. */
(function () {
  'use strict';
  var T = window.TRACK;
  if (!T) return;
  var TOKEN = window.RUN_TOKEN || '', TUTOR = window.TUTOR || { backend: '' }, state = window.SAVED || {};
  var app = document.getElementById('app');

  /* ---------- small helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function bucket(name) { if (!state[name] || typeof state[name] !== 'object') state[name] = {}; return state[name]; }
  function api(url, body) {
    var opts = { method: 'GET', headers: { 'X-Course-Token': TOKEN } };
    if (body !== undefined) { opts.method = 'POST'; opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); opts.keepalive = true; }
    return fetch(url, opts).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function patch(section, key, value) {
    return api('/api/progress-patch', { section: section, key: key, value: value })
      .catch(function () { toast('Could not save. Check that app.py is still running.'); });
  }
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ---------- index of lessons and problems ---------- */
  var lessonOrder = [], unitOf = {}, probOrder = [];
  T.units.forEach(function (u) { u.lessons.forEach(function (id) { lessonOrder.push(id); unitOf[id] = u; }); });
  lessonOrder.forEach(function (id) {
    T.lessons[id].problems.forEach(function (k) { if (probOrder.indexOf(k) < 0) probOrder.push(k); });
  });
  function solved(key) { return !!bucket('checks')[key]; }
  function tried(key) {
    var d = bucket('drafts')[key], p = T.problems[key];
    return !!(d && d.text && p && d.text.trim() !== (p.starter || '').trim());
  }
  function lessonDone(id) { return !!bucket('pydone')[id]; }
  function probHref(key) { return '#/problem/' + encodeURIComponent(key); }
  function levelOf(p) { return /^(easy|medium|hard)$/.test(p.level) ? p.level : 'medium'; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function nextUnsolved(after) {
    var start = after ? probOrder.indexOf(after) + 1 : 0;
    for (var i = 0; i < probOrder.length; i++) {
      var k = probOrder[(start + i) % probOrder.length];
      if (!solved(k) && k !== after) return k;
    }
    return null;
  }
  function statusDot(key) { return '<span class="dot' + (solved(key) ? ' done' : tried(key) ? ' tried' : '') + '" title="' + (solved(key) ? 'Solved' : tried(key) ? 'Attempted' : 'Not started') + '"></span>'; }

  /* ---------- streak (same record as the main course) ---------- */
  function today() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function dayDiff(a, b) {
    function t(s) { var p = String(s).split('-'); return Date.UTC(+p[0], p[1] - 1, +p[2]); }
    return Math.round((t(b) - t(a)) / 864e5);
  }
  function streakNow() { var s = state.streak; return s && s.last && dayDiff(s.last, today()) <= 1 ? s.count : 0; }
  function bumpStreak() {
    var s = state.streak, t = today();
    if (s && s.last === t) return;
    state.streak = { last: t, count: s && s.last && dayDiff(s.last, t) === 1 ? s.count + 1 : 1 };
    patch('streak', null, state.streak);
  }

  /* ---------- top navigation ---------- */
  function refreshNav(section) {
    var n = probOrder.filter(solved).length, s = streakNow();
    $('#nav-solved').innerHTML = '<b>' + n + '</b> / ' + probOrder.length + ' solved';
    $('#nav-streak').innerHTML = s ? '<b>' + s + '</b>-day streak' : '';
    if (section !== undefined) $$('.nav-links a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-nav') === section); });
  }
  function applyTheme() { if (state.theme) document.documentElement.setAttribute('data-theme', state.theme); }
  applyTheme();
  $('#theme-btn').addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    state.theme = cur === 'dark' ? 'light' : 'dark';
    applyTheme(); patch('theme', null, state.theme);
  });

  /* ---------- Python syntax highlighting ---------- */
  var PY_KW = 'def|class|return|if|elif|else|for|while|in|not|and|or|import|from|as|with|try|except|finally|raise|lambda|yield|async|await|pass|break|continue|None|True|False|is|global|nonlocal|assert|del';
  var PY_BI = 'print|len|range|int|str|float|list|dict|set|tuple|bool|type|isinstance|issubclass|enumerate|zip|map|filter|sorted|sum|min|max|abs|open|input|super|any|all|reversed|iter|next|id|hash|repr|format|round|divmod|pow|ord|chr|bytes|object|getattr|setattr|hasattr|callable|frozenset|property|staticmethod|classmethod|Exception|ValueError|TypeError|KeyError|IndexError|RuntimeError|StopIteration|AttributeError|NotImplementedError|ZeroDivisionError';
  var PY_STR = '"""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'|"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'';
  var PY_RE = new RegExp(
    '(#[^\\n]*)' +
    '|((?:\\b[rRbBfFuU]{1,2})?(?:' + PY_STR + '))' +
    '|(^[ \\t]*@[\\w.]+)' +
    '|((?<=\\b(?:def|class)\\s+)\\w+)' +
    '|(\\b(?:' + PY_KW + ')\\b)' +
    '|(\\b(?:' + PY_BI + ')\\b(?=\\s*\\()|\\b(?:self|cls)\\b)' +
    '|(\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b)' +
    '|(\\b[A-Za-z_]\\w*(?=\\())', 'gm');
  var TOK = ['', 'com', 'str', 'deco', 'def', 'kw', 'bi', 'num', 'fn'];
  function highlight(code) {
    var out = '', last = 0, m;
    PY_RE.lastIndex = 0;
    while ((m = PY_RE.exec(code))) {
      if (m[0].length === 0) { PY_RE.lastIndex++; continue; }
      var cls = 'fn';
      for (var g = 1; g < TOK.length; g++) { if (m[g] !== undefined) { cls = TOK[g]; break; } }
      if (cls === 'bi' && (m[0] === 'self' || m[0] === 'cls')) cls = 'self';
      out += esc(code.slice(last, m.index)) + '<span class="tok-' + cls + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    return out + esc(code.slice(last));
  }

  /* ---------- Markdown ---------- */
  function inline(s) {
    return s.split(/(`[^`]+`)/).map(function (part) {
      if (part.length > 1 && part.charAt(0) === '`' && part.charAt(part.length - 1) === '`') return '<code>' + esc(part.slice(1, -1)) + '</code>';
      var t = esc(part);
      t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
      return t;
    }).join('');
  }
  function isBlockStart(l) {
    return /^(#{1,4})\s/.test(l) || /^```/.test(l) || /^>\s?/.test(l) || /^\s*([-*]|\d+\.)\s+/.test(l) || /^\|/.test(l) || /^---\s*$/.test(l) || /^\{\{task:/.test(l);
  }
  function problemCard(key) {
    var p = T.problems[key];
    if (!p) return '';
    var lv = levelOf(p);
    return '<a class="prob" href="' + probHref(key) + '">' + statusDot(key) +
      '<span class="t">' + esc(p.title) + (p.shared ? '<span class="sub">Shared with the main course: ' + esc(p.shared_title) + '</span>' : '') + '</span>' +
      '<span class="tag ' + lv + '">' + cap(lv) + '</span><span class="go">' + (solved(key) ? 'Review' : 'Solve') + '</span></a>';
  }
  function renderMd(src) {
    var lines = String(src || '').replace(/\r/g, '').split('\n'), html = [], i = 0, m;
    function cells(l) { return l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(function (c) { return c.trim().replace(/\\\|/g, '|'); }); }
    function listFrom(start) {
      var items = [], j = start, mm;
      while (j < lines.length) {
        if ((mm = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[j]))) { items.push({ indent: mm[1].length, ordered: /\d/.test(mm[2]), text: mm[3] }); j++; }
        else if (/^\s{2,}\S/.test(lines[j]) && items.length) { items[items.length - 1].text += ' ' + lines[j].trim(); j++; }
        else break;
      }
      function build(k, indent) {
        var ordered = items[k].ordered, out = ordered ? '<ol>' : '<ul>';
        while (k < items.length && items[k].indent >= indent) {
          if (items[k].indent > indent) { var sub = build(k, items[k].indent); out = out.replace(/<\/li>$/, '') + sub.html + '</li>'; k = sub.next; continue; }
          out += '<li>' + inline(items[k].text) + '</li>'; k++;
        }
        return { html: out + (ordered ? '</ol>' : '</ul>'), next: k };
      }
      html.push(build(0, items[0].indent).html);
      return j;
    }
    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim()) { i++; continue; }
      if ((m = /^\{\{task:(.+)\}\}\s*$/.exec(line))) { html.push(problemCard(m[1])); i++; continue; }
      if ((m = /^(`{3,})\s*(\S*)\s*(.*)$/.exec(line))) {
        var lang = m[2], flags = m[3], buf = [], closer = new RegExp('^`{' + m[1].length + ',}\\s*$'); i++;
        while (i < lines.length && !closer.test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        var code = buf.join('\n');
        if (lang === 'quiz') html.push('<div class="quiz" data-src="' + esc(code) + '"></div>');
        else if (/\brun\b/.test(flags)) html.push('<div class="runbox" data-code="' + esc(code) + '"></div>');
        else html.push('<div class="code"><button type="button" class="btn sm copy">Copy</button><pre><code>' + (lang === 'python' || lang === 'py' ? highlight(code) : esc(code)) + '</code></pre></div>');
        continue;
      }
      if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) { var lvl = Math.min(4, m[1].length + 0); html.push('<h' + lvl + '>' + inline(m[2]) + '</h' + lvl + '>'); i++; continue; }
      if (/^---\s*$/.test(line)) { html.push('<hr>'); i++; continue; }
      if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        var t = '<div class="tablewrap"><table><thead><tr>' + cells(line).map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
        i += 2;
        while (i < lines.length && /^\|/.test(lines[i])) { t += '<tr>' + cells(lines[i]).map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>'; i++; }
        html.push(t + '</tbody></table></div>'); continue;
      }
      if (/^>\s?/.test(line)) {
        var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
        html.push('<blockquote><p>' + inline(q.join(' ')) + '</p></blockquote>'); continue;
      }
      if (/^\s*([-*]|\d+\.)\s+/.test(line)) { i = listFrom(i); continue; }
      var para = [line]; i++;
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { para.push(lines[i]); i++; }
      html.push('<p>' + inline(para.join(' ')) + '</p>');
    }
    return html.join('\n');
  }

  /* ---------- code editor ---------- */
  function replaceRange(ta, a, b, text, selA, selB) {
    ta.setSelectionRange(a, b);
    var ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch (err) { ok = false; }   // keeps undo history
    if (!ok) { ta.setRangeText(text, a, b, 'end'); ta.dispatchEvent(new Event('input')); }
    ta.setSelectionRange(selA, selB);
  }
  function codeKey(e, ta) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var IND = '    ', v = ta.value, s = ta.selectionStart, en = ta.selectionEnd, ls = v.lastIndexOf('\n', s - 1) + 1;
    if (s === 0) ls = 0;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (s === en && !e.shiftKey) { replaceRange(ta, s, en, IND, s + 4, s + 4); return; }
      var le = v.indexOf('\n', en > s && v.charAt(en - 1) === '\n' ? en - 1 : en);
      if (le < 0) le = v.length;
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
  /* opts: value, inline (grows with its content, no gutter), label, onChange(text), onKey(event) */
  function createEditor(host, opts) {
    var isInline = !!opts.inline;
    host.innerHTML = '<div class="ed' + (isInline ? ' inline' : '') + '">' + (isInline ? '' : '<pre class="ed-gutter" aria-hidden="true"></pre>') +
      '<div class="ed-main"><pre class="ed-hl" aria-hidden="true"><code></code></pre>' +
      '<textarea spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off" aria-label="' + esc(opts.label || 'Python code') + '"></textarea></div></div>';
    var ta = $('textarea', host), hl = $('.ed-hl', host), code = $('code', hl), gutter = $('.ed-gutter', host), shown = 0;
    function sync() { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; if (gutter) gutter.scrollTop = ta.scrollTop; }
    function paint() {
      var v = ta.value, n = v.split('\n').length;
      code.innerHTML = highlight(v) + '\n';
      if (isInline) ta.rows = n + 1;
      if (gutter && n !== shown) { var s = ''; for (var i = 1; i <= n; i++) s += i + '\n'; gutter.textContent = s; shown = n; }
      sync();
    }
    ta.addEventListener('input', function () { paint(); if (opts.onChange) opts.onChange(ta.value); });
    ta.addEventListener('scroll', sync);
    ta.addEventListener('keydown', function (e) { if (opts.onKey) opts.onKey(e); if (!e.defaultPrevented) codeKey(e, ta); });
    ta.value = opts.value || '';
    paint();
    return { get: function () { return ta.value; }, set: function (v) { ta.value = v; paint(); }, focus: function () { ta.focus(); } };
  }

  /* ---------- interactive pieces inside rendered Markdown ---------- */
  function mountRunbox(box) {
    var src = box.getAttribute('data-code');
    box.innerHTML = '<div class="bar"><span>Example. Edit it and run it.</span><span class="grow"></span>' +
      '<button type="button" class="btn sm" data-a="reset">Reset</button><button type="button" class="btn sm primary" data-a="run">Run</button></div>' +
      '<div class="host"></div><pre class="out" aria-live="polite"></pre>';
    var out = $('.out', box);
    function run() {
      out.textContent = 'Running...';
      api('/api/run', { code: ed.get() }).then(function (r) {
        out.textContent = (r.output || '(no output)') + (r.timed_out ? '\n[stopped after ' + r.limit + ' seconds]' : '');
      }).catch(function () { out.textContent = 'Could not reach the server. Check that app.py is still running.'; });
    }
    var ed = createEditor($('.host', box), {
      value: src, inline: true, label: 'Editable Python example',
      onKey: function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); } }
    });
    $('[data-a="run"]', box).addEventListener('click', run);
    $('[data-a="reset"]', box).addEventListener('click', function () { ed.set(src); out.textContent = ''; });
  }
  function mountQuiz(box) {
    var qs;
    try { qs = JSON.parse(box.getAttribute('data-src')); } catch (e) { box.textContent = 'Quiz data error.'; return; }
    box.innerHTML = '';
    qs.forEach(function (q) {
      var wrap = document.createElement('div'); wrap.className = 'q';
      wrap.innerHTML = '<p>' + inline(q.q) + '</p><div class="opts"></div><div class="why"></div>';
      var opts = $('.opts', wrap), why = $('.why', wrap);
      q.options.forEach(function (o, k) {
        var b = document.createElement('button'); b.type = 'button'; b.innerHTML = inline(o);
        b.addEventListener('click', function () {
          $$('button', opts).forEach(function (x) { x.disabled = true; });
          b.className = k === q.answer ? 'right' : 'wrong';
          opts.children[q.answer].className = 'right';
          why.innerHTML = (k === q.answer ? 'Correct. ' : 'Not quite. ') + inline(q.why || '');
        });
        opts.appendChild(b);
      });
      box.appendChild(wrap);
    });
  }
  function hydrate(root) {
    $$('.runbox', root).forEach(mountRunbox);
    $$('.quiz', root).forEach(mountQuiz);
    $$('.code .copy', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var text = $('pre', b.parentNode).textContent;
        try { navigator.clipboard.writeText(text).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1200); }); }
        catch (err) { b.textContent = 'Select the text to copy'; }
      });
    });
  }

  /* ---------- views ---------- */
  var current = { name: '', arg: '' }, leave = null;
  function shell(name, arg, section, isWorkspace) {
    current = { name: name, arg: arg };
    app.className = 'app' + (isWorkspace ? ' workspace' : '');
    refreshNav(section);
  }
  function remember(type, id) { state.pylast = { type: type, id: id }; patch('pylast', null, state.pylast); }

  function lessonRow(id) {
    var L = T.lessons[id], keys = L.problems, n = keys.filter(solved).length, done = lessonDone(id);
    return '<a class="row' + (done ? ' done' : '') + '" href="#/lesson/' + id + '"><span class="n">' + pad2(lessonOrder.indexOf(id) + 1) + '</span>' +
      '<span class="t">' + esc(L.title) + '</span><span class="meta opt">' + L.minutes + ' min</span>' +
      '<span class="meta">' + (done ? '<span class="check" title="Lesson completed">&#10003;</span> ' : '') + n + ' / ' + keys.length + ' exercises</span></a>';
  }
  function resumeHtml() {
    var last = state.pylast, label = 'Start here', what = T.lessons[lessonOrder[0]].title, href = '#/lesson/' + lessonOrder[0], verb = 'Start';
    if (last && last.type === 'problem' && T.problems[last.id]) { label = 'Last problem'; what = T.problems[last.id].title; href = probHref(last.id); verb = 'Continue'; }
    else if (last && last.type === 'lesson' && T.lessons[last.id]) { label = 'Last lesson'; what = T.lessons[last.id].title; href = '#/lesson/' + last.id; verb = 'Continue'; }
    var nk = nextUnsolved(null);
    return '<div class="resume"><div><div class="eyebrow">' + label + '</div><div class="what">' + esc(what) + '</div></div><span class="grow"></span>' +
      (nk ? '<a class="btn" href="' + probHref(nk) + '">Next unsolved exercise</a>' : '') + '<a class="btn primary" href="' + href + '">' + verb + '</a></div>';
  }
  function meter(label, cls, done, total) {
    return '<div class="meter"><span>' + label + '</span><span class="track"><span class="fill ' + cls + '" style="width:' + (total ? Math.round(100 * done / total) : 0) + '%"></span></span><span class="num">' + done + '/' + total + '</span></div>';
  }
  function viewHome() {
    shell('home', '', 'learn', false);
    var total = probOrder.length, done = probOrder.filter(solved).length, by = { easy: [0, 0], medium: [0, 0], hard: [0, 0] };
    probOrder.forEach(function (k) { var l = levelOf(T.problems[k]); by[l][1]++; if (solved(k)) by[l][0]++; });
    var lessonsDone = lessonOrder.filter(lessonDone).length, shared = probOrder.filter(function (k) { return T.problems[k].shared; }).length, streak = streakNow();
    var h = '<div class="page"><div class="cols"><div>' +
      '<div class="eyebrow">Python track</div><h1 class="page-title">Python, from the first line to production code</h1>' +
      '<p class="lede">' + lessonOrder.length + ' lessons and ' + total + ' exercises. Every example on these pages runs when you press Run, and every exercise is checked against test cases when you submit it.</p>' + resumeHtml();
    T.units.forEach(function (u) {
      var keys = [];
      u.lessons.forEach(function (id) { T.lessons[id].problems.forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
      h += '<section class="unit"><div class="unit-head"><h2>' + esc(u.title) + '</h2>' + (u.level ? '<span class="tag">' + esc(u.level) + '</span>' : '') +
        '<span class="count">' + keys.filter(solved).length + ' / ' + keys.length + ' solved</span></div><p>' + esc(u.blurb || '') + '</p><div class="rows">' +
        u.lessons.map(lessonRow).join('') + '</div></section>';
    });
    h += '</div><aside><div class="card"><h3>Your progress</h3><div class="big">' + done + ' <small>/ ' + total + ' solved</small></div>' +
      meter('Easy', 'easy', by.easy[0], by.easy[1]) + meter('Medium', 'medium', by.medium[0], by.medium[1]) + meter('Hard', 'hard', by.hard[0], by.hard[1]) +
      '</div><div class="card"><h3>Overview</h3><ul class="facts"><li><span>Lessons completed</span><b>' + lessonsDone + ' / ' + lessonOrder.length + '</b></li>' +
      '<li><span>Current streak</span><b>' + streak + (streak === 1 ? ' day' : ' days') + '</b></li>' +
      '<li><span>Exercises shared with the main course</span><b>' + shared + '</b></li></ul></div>' +
      '<div class="card"><h3>How it works</h3><p class="muted" style="margin:0;font-size:.9rem">Read a lesson, run its examples, then open an exercise. <b>Run</b> tries the sample cases. <b>Submit</b> runs every test case and marks the exercise solved. Exercises that also appear in the main course keep one shared status and one shared draft.</p></div>' +
      '</aside></div></div>';
    app.innerHTML = h;
  }

  function tocHtml(activeId) {
    return T.units.map(function (u) {
      return '<h4>' + esc(u.title) + '</h4>' + u.lessons.map(function (id) {
        return '<a href="#/lesson/' + id + '"' + (id === activeId ? ' class="on" aria-current="page"' : '') + '><span class="dot' + (lessonDone(id) ? ' done' : '') + '"></span><span>' + esc(T.lessons[id].title) + '</span></a>';
      }).join('');
    }).join('');
  }
  function viewLesson(id) {
    var L = T.lessons[id];
    if (!L) { viewMissing(); return; }
    shell('lesson', id, 'learn', false);
    var k = lessonOrder.indexOf(id), prev = lessonOrder[k - 1], next = lessonOrder[k + 1], u = unitOf[id];
    app.innerHTML = '<div class="lesson-layout"><nav class="toc" aria-label="Lessons">' + tocHtml(id) + '</nav><article class="prose">' +
      '<div class="eyebrow">' + esc(u.title) + ' / Lesson ' + (k + 1) + ' of ' + lessonOrder.length + '</div><h1>' + esc(L.title) + '</h1>' +
      '<p class="muted">About ' + L.minutes + ' minutes. ' + L.problems.length + ' exercises.</p>' + renderMd(L.md) +
      '<div class="lesson-foot"><button type="button" class="btn" id="done-btn"></button><span class="grow"></span>' +
      (prev ? '<a class="btn" href="#/lesson/' + prev + '">Previous: ' + esc(T.lessons[prev].title) + '</a>' : '') +
      (next ? '<a class="btn primary" href="#/lesson/' + next + '">Next: ' + esc(T.lessons[next].title) + '</a>' : '') + '</div></article></div>';
    hydrate(app);
    var btn = $('#done-btn');
    function label() { btn.textContent = lessonDone(id) ? 'Completed. Click to undo' : 'Mark lesson as completed'; }
    btn.addEventListener('click', function () {
      var done = bucket('pydone');
      if (done[id]) { delete done[id]; patch('pydone', id, null); }
      else { done[id] = 1; patch('pydone', id, 1); bumpStreak(); toast('Lesson completed'); }
      label(); refreshNav();
      $('.toc', app).innerHTML = tocHtml(id);
    });
    label();
    remember('lesson', id);
  }

  var filters = { q: '', level: '', status: '', unit: '' };
  function viewProblems() {
    shell('problems', '', 'problems', false);
    app.innerHTML = '<div class="page"><div class="eyebrow">Practice</div><h1 class="page-title">Problems</h1>' +
      '<p class="lede">Every exercise from the lessons in one list. Each has a full statement, sample cases and a test suite.</p>' +
      '<div class="filters"><input type="search" id="f-q" placeholder="Search by title" aria-label="Search problems">' +
      '<select id="f-level" aria-label="Difficulty"><option value="">All difficulties</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>' +
      '<select id="f-status" aria-label="Status"><option value="">Any status</option><option value="todo">Not solved</option><option value="tried">Attempted</option><option value="done">Solved</option></select>' +
      '<select id="f-unit" aria-label="Topic"><option value="">All topics</option>' + T.units.map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(u.title) + '</option>'; }).join('') + '</select>' +
      '<button type="button" class="btn" id="f-random">Pick one for me</button></div>' +
      '<div class="tablewrap"><table class="ptable"><thead><tr><th></th><th>#</th><th>Title</th><th>Lesson</th><th>Difficulty</th></tr></thead><tbody id="p-body"></tbody></table></div>' +
      '<div id="p-empty" class="empty" hidden>No problems match these filters.</div></div>';
    var body = $('#p-body');
    function matches(k) {
      var p = T.problems[k];
      if (filters.q && p.title.toLowerCase().indexOf(filters.q.toLowerCase()) < 0) return false;
      if (filters.level && levelOf(p) !== filters.level) return false;
      if (filters.unit && unitOf[p.lesson].id !== filters.unit) return false;
      if (filters.status === 'done' && !solved(k)) return false;
      if (filters.status === 'todo' && solved(k)) return false;
      if (filters.status === 'tried' && (solved(k) || !tried(k))) return false;
      return true;
    }
    function draw() {
      var rows = '';
      probOrder.forEach(function (k, i) {
        if (!matches(k)) return;
        var p = T.problems[k], lv = levelOf(p);
        rows += '<tr data-href="' + probHref(k) + '"><td>' + statusDot(k) + '</td><td class="num">' + (i + 1) + '</td>' +
          '<td><a href="' + probHref(k) + '">' + esc(p.title) + '</a>' + (p.shared ? ' <span class="tag shared" title="Also an exercise in the main course">Shared</span>' : '') + '</td>' +
          '<td class="topic">' + esc(T.lessons[p.lesson].title) + '</td><td><span class="tag ' + lv + '">' + cap(lv) + '</span></td></tr>';
      });
      body.innerHTML = rows;
      $('#p-empty').hidden = !!rows;
    }
    [['f-q', 'q', 'input'], ['f-level', 'level', 'change'], ['f-status', 'status', 'change'], ['f-unit', 'unit', 'change']].forEach(function (f) {
      var node = $('#' + f[0]);
      node.value = filters[f[1]];
      node.addEventListener(f[2], function () { filters[f[1]] = node.value; draw(); });
    });
    body.addEventListener('click', function (e) {
      var tr = e.target.closest ? e.target.closest('tr') : null;
      if (tr && e.target.tagName !== 'A') location.hash = tr.getAttribute('data-href');
    });
    $('#f-random').addEventListener('click', function () {
      var pool = probOrder.filter(function (k) { return matches(k) && !solved(k); });
      if (!pool.length) { toast('Nothing unsolved matches these filters'); return; }
      location.hash = probHref(pool[Math.floor(Math.random() * pool.length)]);
    });
    draw();
  }

  function viewMissing() {
    shell('missing', '', '', false);
    app.innerHTML = '<div class="page"><h1 class="page-title">Page not found</h1><p class="lede">That lesson or problem does not exist. <a href="#/">Back to the track</a></p></div>';
  }

  /* ---------- the problem workspace ---------- */
  var revealed = {};     // hints and solutions opened in this session
  function field(label, text, bad) { return '<div class="field' + (bad ? ' diff' : '') + '"><div class="lbl">' + label + '</div><pre>' + esc(text) + '</pre></div>'; }
  function viewProblem(key) {
    var p = T.problems[key];
    if (!p) { viewMissing(); return; }
    shell('problem', key, 'problems', true);
    var idx = probOrder.indexOf(key), prev = probOrder[idx - 1], next = probOrder[idx + 1], lv = levelOf(p), L = T.lessons[p.lesson];
    app.innerHTML = '<div class="ws"><section class="ws-left">' +
      '<div class="ws-bar"><a href="#/problems">Problems</a><span>/</span><span>' + (idx + 1) + ' of ' + probOrder.length + '</span><span class="grow"></span>' +
      (prev ? '<a class="btn sm" href="' + probHref(prev) + '" title="' + esc(T.problems[prev].title) + '">Previous</a>' : '') +
      (next ? '<a class="btn sm" href="' + probHref(next) + '" title="' + esc(T.problems[next].title) + '">Next</a>' : '') + '</div>' +
      '<div class="ws-head"><h1>' + esc(p.title) + '</h1><div class="tags" id="ws-tags"></div></div>' +
      '<div class="tabs" role="tablist"><button type="button" data-tab="desc" class="on">Description</button><button type="button" data-tab="hint">Hint</button><button type="button" data-tab="sol">Solution</button>' +
      (TUTOR.backend ? '<button type="button" data-tab="tutor">Tutor</button>' : '') + '</div>' +
      '<div class="ws-body" id="ws-body"></div></section>' +
      '<div class="ws-split" id="ws-split" role="separator" aria-orientation="vertical" title="Drag to resize"></div>' +
      '<section class="ws-right"><div class="ws-bar"><span class="lang">Python 3</span><span id="save-state"></span><span class="grow"></span>' +
      '<button type="button" class="btn sm" id="ws-reset">Reset code</button></div>' +
      '<div class="ws-editor" id="ws-editor"></div>' +
      '<div class="ws-console"><div class="tabs"><button type="button" data-ctab="result" class="on">Test results</button><button type="button" data-ctab="output">Output</button>' +
      '<span class="grow"></span><span class="muted kbd-hint"><kbd>Ctrl</kbd> <kbd>Enter</kbd> run &nbsp; <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>Enter</kbd> submit</span></div>' +
      '<div class="console-body" id="console-body"></div></div>' +
      '<div class="ws-actions"><button type="button" class="btn" id="ws-run">Run</button><button type="button" class="btn primary" id="ws-submit">Submit</button></div>' +
      '</section></div>';

    var body = $('#ws-body'), consoleBody = $('#console-body'), lastResult = null, submittedOnce = solved(key), testState = 'not run', busy = false;
    function drawTags() {
      $('#ws-tags').innerHTML = '<span class="tag ' + lv + '">' + cap(lv) + '</span>' + (solved(key) ? '<span class="tag solved">Solved</span>' : '') +
        '<a class="tag" href="#/lesson/' + p.lesson + '">Lesson: ' + esc(L.title) + '</a>' +
        (p.shared ? '<a class="tag shared" href="/#' + esc(p.shared) + '" title="This exercise is also in the main course. Status and draft are shared.">Main course: ' + esc(p.shared_title) + '</a>' : '');
    }
    drawTags();

    /* left tabs */
    function showTab(name) {
      $$('[data-tab]', app).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === name); });
      if (name === 'desc') { body.innerHTML = '<div class="prose">' + renderMd(p.statement) + '</div>'; hydrate(body); }
      else if (name === 'hint') {
        if (!p.hint) body.innerHTML = '<p class="muted">There is no hint for this problem.</p>';
        else if (revealed['h:' + key]) body.innerHTML = '<div class="prose">' + renderMd(p.hint) + '</div>';
        else {
          body.innerHTML = '<p class="muted">A hint points you in a direction without giving the solution. Try for a few minutes first.</p><p><button type="button" class="btn" id="reveal">Show the hint</button></p>';
          $('#reveal').addEventListener('click', function () { revealed['h:' + key] = 1; showTab('hint'); });
        }
      } else if (name === 'sol') {
        if (revealed['s:' + key] || solved(key)) {
          body.innerHTML = '<p class="muted">Reference solution. There are usually several good answers: compare the approach, not the exact lines.</p>' +
            '<div class="code"><button type="button" class="btn sm copy">Copy</button><pre><code>' + highlight(p.solution || '') + '</code></pre></div>';
          hydrate(body);
        } else {
          body.innerHTML = '<p class="muted">' + (submittedOnce ? 'You have made an attempt. You can look at the reference solution now.' : 'The solution is most useful after you have tried. Submit at least once, or reveal it anyway.') + '</p>' +
            '<p><button type="button" class="btn" id="reveal">Show the solution</button></p>';
          $('#reveal').addEventListener('click', function () { revealed['s:' + key] = 1; showTab('sol'); });
        }
      } else if (name === 'tutor') {
        body.innerHTML = '<p class="muted">The tutor reads this problem and the code in your editor. Model: ' + esc(TUTOR.model || TUTOR.backend) + '.</p>' +
          '<p><button type="button" class="btn" data-t="hint">Ask for a hint</button> <button type="button" class="btn" data-t="check">Review my code</button></p><div id="tutor-out" class="prose"></div>';
        $$('[data-t]', body).forEach(function (b) {
          b.addEventListener('click', function () {
            var outBox = $('#tutor-out'), mode = b.getAttribute('data-t');
            outBox.innerHTML = '<p class="muted">Thinking...</p>';
            api('/api/tutor', { mode: mode, task: p.title + '\n' + p.statement, code: ed.get(), kind: 'code', output: '', tests: testState, lesson_title: L.title, lesson_md: '' })
              .then(function (r) {
                if (r.error) { outBox.innerHTML = '<p class="muted">' + esc(r.error) + '</p>'; return; }
                var reply = r.reply, m = /^\s*VERDICT:\s*(PASS|NEEDS WORK)[^\n]*\n?/i.exec(reply), head = '';
                if (m) { reply = reply.slice(m[0].length); head = '<p><span class="tag ' + (/pass/i.test(m[1]) ? 'easy' : 'medium') + '">' + (/pass/i.test(m[1]) ? 'Looks correct' : 'Needs work') + '</span></p>'; }
                outBox.innerHTML = head + renderMd(reply); hydrate(outBox);
              }).catch(function () { outBox.innerHTML = '<p class="muted">Could not reach the server.</p>'; });
          });
        });
      }
    }
    $$('[data-tab]', app).forEach(function (b) { b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); }); });
    showTab('desc');

    /* editor with a saved draft (shared with the main course's practice window) */
    var saved = bucket('drafts')[key], startText = saved && saved.text ? saved.text : (p.starter || ''), lastSaved = startText, saveTimer = null;
    function flush() {
      clearTimeout(saveTimer); saveTimer = null;
      var v = ed.get();
      if (v === lastSaved) return;
      lastSaved = v;
      var d = { kind: 'code', text: v };
      bucket('drafts')[key] = d;
      patch('drafts', key, d).then(function () { var s = $('#save-state'); if (s && current.arg === key) s.textContent = 'Draft saved'; });
    }
    var ed = createEditor($('#ws-editor'), {
      value: startText, label: 'Your solution',
      onChange: function () { $('#save-state').textContent = 'Editing'; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 700); },
      onKey: function (e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (e.shiftKey) judge(true); else judge(false); }
      }
    });
    leave = flush;
    $('#ws-reset').addEventListener('click', function () {
      if (!window.confirm('Replace your code with the starter code?')) return;
      ed.set(p.starter || ''); lastSaved = p.starter || '';
      delete bucket('drafts')[key]; patch('drafts', key, null);
      $('#save-state').textContent = 'Reset to starter code';
    });

    /* console */
    var ctab = 'result';
    function showCtab(name) {
      ctab = name;
      $$('[data-ctab]', app).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-ctab') === name); });
      if (name === 'output') {
        consoleBody.innerHTML = lastResult ? field('Printed by your code', lastResult.stdout || '(nothing was printed)') : '<p class="muted">Anything your code prints appears here after a run.</p>';
      } else drawResult();
    }
    $$('[data-ctab]', app).forEach(function (b) { b.addEventListener('click', function () { showCtab(b.getAttribute('data-ctab')); }); });
    function showCase(i) {
      var c = lastResult.cases[i];
      $$('[data-case]', consoleBody).forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-case') === i); });
      $('#case-detail').innerHTML = (c.label ? '<p class="muted" style="margin:0 0 8px">' + esc(c.label) + '</p>' : '') + field('Input', c.input) +
        (c.error ? field('Error', c.error, true) : field('Your output', c.got, !c.passed)) + field('Expected', c.expected) +
        (c.stdout ? field('Printed while running this case', c.stdout) : '');
    }
    function drawResult() {
      var res = lastResult;
      if (!res) { consoleBody.innerHTML = '<p class="muted">Press <b>Run</b> to try the sample cases, or <b>Submit</b> to run every test case.</p>'; return; }
      var cases = res.cases || [], pass = cases.filter(function (c) { return c.passed; }).length, total = Math.max(res.total || 0, cases.length), h;
      if (res.timed_out) {
        h = '<div class="verdict warn"><strong>Time Limit Exceeded</strong><span class="muted">Stopped after ' + res.limit + ' seconds. Look for a loop that never ends, or an approach that repeats work.</span></div>';
      } else if (res.error) {
        h = '<div class="verdict bad"><strong>' + (/SyntaxError|IndentationError|TabError/.test(res.error) ? 'Syntax Error' : 'Runtime Error') + '</strong><span class="muted">Your code stopped before the tests could run.</span></div>' + field('Error', res.error, true);
      } else {
        var all = cases.length > 0 && pass === cases.length, crashed = cases.some(function (c) { return !!c.error; });
        var title = all ? (res.submitted ? 'Accepted' : 'Sample cases passed') : (crashed ? 'Runtime Error' : 'Wrong Answer');
        var sub = res.submitted ? pass + ' / ' + total + ' test cases passed' : pass + ' / ' + cases.length + ' sample cases passed';
        h = '<div class="verdict ' + (all ? 'ok' : 'bad') + '"><strong>' + title + '</strong><span class="muted">' + sub + '</span></div>';
        if (all && res.submitted) {
          var nk = nextUnsolved(key);
          h += '<div class="solved-bar"><span>All ' + total + ' test cases passed. This problem is marked as solved' + (p.shared ? ', here and in the main course' : '') + '.</span><span class="grow"></span>' +
            (nk ? '<a class="btn sm primary" href="' + probHref(nk) + '">Next problem</a>' : '<a class="btn sm primary" href="#/problems">All problems</a>') + '</div>';
        } else if (all) {
          h += '<div class="note">The samples pass. Press <b>Submit</b> to run all ' + total + ' test cases.</div>';
        }
        h += '<div class="cases">' + cases.map(function (c, i) { return '<button type="button" data-case="' + i + '"><span class="pip' + (c.passed ? '' : ' fail') + '"></span>Case ' + (i + 1) + '</button>'; }).join('') + '</div><div id="case-detail"></div>';
      }
      consoleBody.innerHTML = h;
      if (!res.timed_out && !res.error && cases.length) {
        $$('[data-case]', consoleBody).forEach(function (b) { b.addEventListener('click', function () { showCase(+b.getAttribute('data-case')); }); });
        var firstFail = 0;
        for (var i = 0; i < cases.length; i++) { if (!cases[i].passed) { firstFail = i; break; } }
        showCase(firstFail);
      }
    }
    function judge(submit) {
      if (busy) return;
      busy = true; flush();
      $('#ws-run').disabled = true; $('#ws-submit').disabled = true;
      showCtab('result');
      consoleBody.innerHTML = '<p class="muted">' + (submit ? 'Running every test case...' : 'Running the sample cases...') + '</p>';
      api('/api/judge', { code: ed.get(), tests: p.tests || '', limit: submit ? 0 : 3 }).then(function (res) {
        res.submitted = submit;
        lastResult = res;
        var cases = res.cases || [], all = !res.error && !res.timed_out && cases.length > 0 && cases.every(function (c) { return c.passed; });
        testState = all ? 'passed' : 'failed';
        if (submit) submittedOnce = true;
        if (submit && all && !solved(key)) {
          bucket('checks')[key] = 1;
          patch('checks', key, 1);
          bumpStreak();
          toast('Solved: ' + p.title);
        }
        drawTags(); refreshNav(); drawResult();
      }).catch(function () {
        consoleBody.innerHTML = '<p class="muted">Could not reach the server. Check that app.py is still running in your terminal, then try again.</p>';
      }).then(function () {
        busy = false;
        var r = $('#ws-run'), s = $('#ws-submit');
        if (r) r.disabled = false;
        if (s) s.disabled = false;
      });
    }
    $('#ws-run').addEventListener('click', function () { judge(false); });
    $('#ws-submit').addEventListener('click', function () { judge(true); });
    drawResult();

    /* resizable split between statement and editor */
    var ws = $('.ws', app), split = $('#ws-split'), pct = 44;
    try { pct = parseFloat(window.localStorage.getItem('pylab-split')) || 44; } catch (err) { pct = 44; }
    function setSplit(v) { pct = Math.max(25, Math.min(70, v)); ws.style.gridTemplateColumns = pct + '% 7px minmax(0, 1fr)'; }
    setSplit(pct);
    split.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      split.classList.add('drag');
      try { split.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      function move(ev) { setSplit(100 * ev.clientX / window.innerWidth); }
      function up() {
        split.classList.remove('drag');
        split.removeEventListener('pointermove', move); split.removeEventListener('pointerup', up);
        try { window.localStorage.setItem('pylab-split', String(pct)); } catch (err) { /* storage unavailable */ }
      }
      split.addEventListener('pointermove', move); split.addEventListener('pointerup', up);
    });

    remember('problem', key);
  }

  /* ---------- router ---------- */
  function route() {
    if (leave) { try { leave(); } catch (err) { /* nothing to save */ } leave = null; }
    var parts = location.hash.replace(/^#\/?/, '').split('/');
    var arg = '';
    try { arg = decodeURIComponent(parts.slice(1).join('/')); } catch (err) { arg = ''; }
    if (parts[0] === 'lesson') viewLesson(arg);
    else if (parts[0] === 'problems') viewProblems();
    else if (parts[0] === 'problem') viewProblem(arg);
    else viewHome();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', function () { if (leave) leave(); });

  /* When the tab regains focus, pick up progress made in the main course in another tab. */
  window.addEventListener('focus', function () {
    api('/api/state').then(function (fresh) {
      ['checks', 'pydone', 'streak', 'theme'].forEach(function (k) { if (fresh[k] !== undefined) state[k] = fresh[k]; });
      var mine = bucket('drafts'), theirs = fresh.drafts || {};
      Object.keys(theirs).forEach(function (k) { if (!(current.name === 'problem' && current.arg === k)) mine[k] = theirs[k]; });
      refreshNav();
      if (current.name === 'home') viewHome();
      else if (current.name === 'problems') viewProblems();
    }).catch(function () { /* server stopped: keep what we have */ });
  });

  route();
})();
