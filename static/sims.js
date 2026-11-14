/* Small interactive simulators used inside lessons with a ```sim block. */
(function () {
  'use strict';
  function h(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (html != null) e.innerHTML = html;
    return e;
  }
  function q(root, sel) { return root.querySelector(sel); }
  var uid = 0;
  function fnv(str) { var x = 2166136261; for (var i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  var SIMS = {};

  SIMS['binary-search'] = function (box) {
    var arr = [2, 5, 8, 12, 16, 23, 38, 42, 56, 61, 72, 77, 84, 91, 97], id = 'bs' + (uid++);
    box.innerHTML = '<h3>Simulator: binary search</h3><p>Pick a target and step. Each step halves the part that can still contain it.</p>' +
      '<div class="row"><label for="' + id + '">Target <input id="' + id + '" type="number" value="72"></label><button type="button" data-a="step">Step</button><button type="button" data-a="reset">Reset</button></div><div class="cells"></div><p class="msg"></p>';
    var lo, hi, steps, found, over;
    function reset() { lo = 0; hi = arr.length - 1; steps = 0; found = -1; over = false; draw('Range is the whole array: lo=0, hi=' + hi + '.'); }
    function draw(msg, mid) {
      q(box, '.cells').innerHTML = arr.map(function (v, i) { return '<span class="cell' + (i === found ? ' hit' : i === mid ? ' mid' : (i < lo || i > hi) ? ' dim' : '') + '">' + v + '</span>'; }).join('');
      q(box, '.msg').textContent = msg;
    }
    box.addEventListener('click', function (e) {
      var a = e.target.getAttribute('data-a');
      if (a === 'reset') return reset();
      if (a !== 'step' || over) return;
      var t = Number(q(box, 'input').value);
      if (lo > hi) { over = true; return draw(t + ' is not in the array. Took ' + steps + ' steps for ' + arr.length + ' items.'); }
      var mid = (lo + hi) >> 1; steps++;
      if (arr[mid] === t) { found = mid; over = true; return draw('Step ' + steps + ': arr[' + mid + '] = ' + t + '. Found in ' + steps + ' steps; a linear scan needs ' + (mid + 1) + '.'); }
      var msg = 'Step ' + steps + ': mid=' + mid + ', arr[mid]=' + arr[mid] + (arr[mid] < t ? ' is too small, so discard the left half (lo = mid + 1).' : ' is too big, so discard the right half (hi = mid - 1).');
      draw(msg, mid);
      if (arr[mid] < t) lo = mid + 1; else hi = mid - 1;
    });
    reset();
  };

  SIMS['sorting'] = function (box) {
    var id = 'so' + (uid++);
    box.innerHTML = '<h3>Simulator: sorting algorithms</h3><div class="row"><label for="' + id + '">Algorithm <select id="' + id + '"><option value="bubble">Bubble sort</option><option value="insertion">Insertion sort</option><option value="selection">Selection sort</option><option value="quick">Quick sort</option></select></label>' +
      '<button type="button" data-a="step">Step</button><button type="button" data-a="play">Play</button><button type="button" data-a="new">New array</button></div><div class="bars"></div><p class="msg"></p>';
    var arr, gen, timer = null, ops, finished;
    function draw(a, b) { q(box, '.bars').innerHTML = arr.map(function (v, i) { return '<div class="' + (finished ? 'done' : (i === a || i === b) ? 'a' : '') + '" style="height:' + v + '%"></div>'; }).join(''); q(box, '.msg').textContent = finished ? 'Sorted ' + arr.length + ' items with ' + ops + ' comparisons.' : ops + ' comparisons so far.'; }
    function swap(i, j) { var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    var algos = {
      bubble: function* () { for (var n = arr.length; n > 1; n--) for (var i = 0; i < n - 1; i++) { ops++; if (arr[i] > arr[i + 1]) swap(i, i + 1); yield [i, i + 1]; } },
      insertion: function* () { for (var i = 1; i < arr.length; i++) for (var j = i; j > 0; j--) { ops++; if (arr[j - 1] > arr[j]) { swap(j - 1, j); yield [j - 1, j]; } else { yield [j - 1, j]; break; } } },
      selection: function* () { for (var i = 0; i < arr.length - 1; i++) { var m = i; for (var j = i + 1; j < arr.length; j++) { ops++; if (arr[j] < arr[m]) m = j; yield [m, j]; } swap(i, m); } },
      quick: function* () { var stack = [[0, arr.length - 1]]; while (stack.length) { var r = stack.pop(), lo = r[0], hi = r[1]; if (lo >= hi) continue; var p = arr[hi], i = lo; for (var j = lo; j < hi; j++) { ops++; if (arr[j] < p) { swap(i, j); i++; } yield [j, hi]; } swap(i, hi); stack.push([lo, i - 1]); stack.push([i + 1, hi]); } }
    };
    function fresh(newArr) { stop(); if (newArr || !arr) { arr = []; for (var i = 0; i < 24; i++) arr.push(8 + Math.floor(Math.random() * 90)); } ops = 0; finished = false; gen = algos[q(box, 'select').value](); draw(); }
    function step() { if (finished) return; var r = gen.next(); if (r.done) { finished = true; stop(); draw(); } else draw(r.value[0], r.value[1]); }
    function stop() { if (timer) { clearInterval(timer); timer = null; q(box, '[data-a=play]').textContent = 'Play'; } }
    box.addEventListener('click', function (e) {
      var a = e.target.getAttribute('data-a');
      if (a === 'step') step(); else if (a === 'new') fresh(true);
      else if (a === 'play') { if (timer) stop(); else { if (finished) fresh(true); timer = setInterval(step, 60); e.target.textContent = 'Pause'; } }
    });
    q(box, 'select').addEventListener('change', function () { fresh(true); });
    fresh(true);
  };

  SIMS['token-bucket'] = function (box) {
    var a = 'tb' + (uid++), b = 'tb' + (uid++);
    box.innerHTML = '<h3>Simulator: token bucket rate limiter</h3><p>Tokens refill at a steady rate up to the capacity. Each request spends one. No token means HTTP 429.</p>' +
      '<div class="row"><label for="' + a + '">Capacity <input id="' + a + '" type="number" min="1" max="20" value="5"></label><label for="' + b + '">Refill per second <input id="' + b + '" type="number" min="0.2" max="10" step="0.2" value="1"></label>' +
      '<button type="button" data-a="one">Send 1 request</button><button type="button" data-a="burst">Send burst of 8</button></div><div class="cells"></div><div class="log" aria-live="polite"></div>';
    var tokens = 5, last = Date.now(), ok = 0, no = 0, log = [];
    function cap() { return Math.max(1, Number(q(box, '#' + a).value) || 1); }
    function refill() { var now = Date.now(); tokens = Math.min(cap(), tokens + (now - last) / 1000 * (Number(q(box, '#' + b).value) || 1)); last = now; }
    function draw() { var c = cap(), s = ''; for (var i = 0; i < c; i++) s += '<span class="cell' + (i < Math.floor(tokens) ? ' hit' : ' dim') + '">●</span>'; q(box, '.cells').innerHTML = s; q(box, '.log').textContent = 'allowed ' + ok + ' · rejected ' + no + '\n' + log.slice(-6).join('\n'); }
    function send() { refill(); if (tokens >= 1) { tokens -= 1; ok++; log.push('200 OK       tokens left ' + tokens.toFixed(1)); } else { no++; log.push('429 Too Many Requests'); } }
    box.addEventListener('click', function (e) { var x = e.target.getAttribute('data-a'); if (x === 'one') send(); else if (x === 'burst') for (var i = 0; i < 8; i++) send(); if (x) draw(); });
    var t = setInterval(function () { if (!document.body.contains(box)) return clearInterval(t); refill(); draw(); }, 400);
    draw();
  };

  SIMS['hash-ring'] = function (box) {
    box.innerHTML = '<h3>Simulator: consistent hashing</h3><p>60 keys are placed on a ring. Each key belongs to the next server clockwise. Add or remove a server and compare how many keys move against plain <code>hash(key) % N</code>.</p>' +
      '<div class="row"><button type="button" data-a="add">Add a server</button><button type="button" data-a="remove">Remove a server</button><label><input type="checkbox" data-a="vn"> 20 virtual nodes per server</label></div><svg viewBox="0 0 320 320" width="300" height="300" role="img" aria-label="Hash ring"></svg><div class="log" aria-live="polite"></div>';
    var servers = ['A', 'B', 'C'], next = 3, keys = [], colors = ['#0a5f8a', '#b4500b', '#1b7a45', '#8a2f8f', '#a08a00', '#b3261e', '#3a6ea5', '#5a7d2a'];
    for (var i = 0; i < 60; i++) keys.push('key-' + i);
    function points() { var vn = q(box, '[data-a=vn]').checked ? 20 : 1, pts = []; servers.forEach(function (s) { for (var v = 0; v < vn; v++) pts.push({ pos: fnv(s + '#' + v), s: s }); }); return pts.sort(function (x, y) { return x.pos - y.pos; }); }
    function owner(pts, k) { var p = fnv(k); for (var i = 0; i < pts.length; i++) if (pts[i].pos >= p) return pts[i].s; return pts[0].s; }
    function assign() { var pts = points(), m = {}; keys.forEach(function (k) { m[k] = owner(pts, k); }); return m; }
    function modAssign(list) { var m = {}; keys.forEach(function (k) { m[k] = list[fnv(k) % list.length]; }); return m; }
    function col(s) { return colors[(s.charCodeAt(0) - 65) % colors.length]; }
    function draw(msg) {
      var pts = points(), map = assign(), svg = '<circle cx="160" cy="160" r="120" fill="none" stroke="currentColor" stroke-opacity="0.3"/>';
      function xy(pos, r) { var ang = pos / 4294967296 * 2 * Math.PI - Math.PI / 2; return [160 + r * Math.cos(ang), 160 + r * Math.sin(ang)]; }
      keys.forEach(function (k) { var p = xy(fnv(k), 120); svg += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + col(map[k]) + '"/>'; });
      pts.forEach(function (pt) { var p = xy(pt.pos, 138); svg += '<rect x="' + (p[0] - 5).toFixed(1) + '" y="' + (p[1] - 5).toFixed(1) + '" width="10" height="10" fill="' + col(pt.s) + '"/>'; });
      q(box, 'svg').innerHTML = svg;
      var counts = servers.map(function (s) { return s + ': ' + keys.filter(function (k) { return map[k] === s; }).length; }).join('   ');
      q(box, '.log').textContent = 'Servers (squares) and their key counts → ' + counts + (msg ? '\n' + msg : '');
    }
    function change(fn) {
      var before = assign(), modBefore = modAssign(servers.slice()); fn(); var after = assign(), modAfter = modAssign(servers.slice());
      var moved = keys.filter(function (k) { return before[k] !== after[k]; }).length, modMoved = keys.filter(function (k) { return modBefore[k] !== modAfter[k]; }).length;
      draw('Last change moved ' + moved + ' of 60 keys on the ring. hash % N would have moved ' + modMoved + '.');
    }
    box.addEventListener('click', function (e) {
      var a = e.target.getAttribute('data-a');
      if (a === 'add' && servers.length < 8) change(function () { servers.push(String.fromCharCode(65 + next++ % 26)); });
      else if (a === 'remove' && servers.length > 1) change(function () { servers.splice(Math.floor(servers.length / 2), 1); });
    });
    q(box, '[data-a=vn]').addEventListener('change', function () { draw('Virtual nodes spread each server around the ring, which evens out the counts.'); });
    draw();
  };

  SIMS['lru-cache'] = function (box) {
    var a = 'lr' + (uid++), b = 'lr' + (uid++);
    box.innerHTML = '<h3>Simulator: LRU cache (capacity 3)</h3><p>Reading or writing a key makes it the most recently used. When the cache is full, the least recently used key is evicted.</p>' +
      '<div class="row"><label for="' + a + '">Key <input id="' + a + '" type="text" value="a" maxlength="6"></label><label for="' + b + '">Value <input id="' + b + '" type="text" value="1" maxlength="6"></label><button type="button" data-a="put">put(key, value)</button><button type="button" data-a="get">get(key)</button></div>' +
      '<p>Most recent → least recent</p><div class="cells"></div><div class="log" aria-live="polite"></div>';
    var order = [], vals = {}, log = [];
    function touch(k) { var i = order.indexOf(k); if (i >= 0) order.splice(i, 1); order.unshift(k); }
    function draw() { q(box, '.cells').innerHTML = order.map(function (k) { return '<span class="cell">' + k.replace(/</g, '&lt;') + '=' + String(vals[k]).replace(/</g, '&lt;') + '</span>'; }).join('') || '<span class="cell dim">empty</span>'; q(box, '.log').textContent = log.slice(-5).join('\n'); }
    box.addEventListener('click', function (e) {
      var x = e.target.getAttribute('data-a'), k = q(box, '#' + a).value.trim(); if (!x || !k) return;
      if (x === 'get') { if (k in vals) { touch(k); log.push('get(' + k + ') → ' + vals[k] + '   hit, moved to front'); } else log.push('get(' + k + ') → miss'); }
      else { if (!(k in vals) && order.length === 3) { var old = order.pop(); delete vals[old]; log.push('cache full: evicted ' + old); } vals[k] = q(box, '#' + b).value; touch(k); log.push('put(' + k + ')'); }
      draw();
    });
    draw();
  };

  SIMS['estimator'] = function (box) {
    var f = [['dau', 'Daily active users', 10000000], ['req', 'Requests per user per day', 20], ['peak', 'Peak factor', 4], ['wr', 'Writes, % of requests', 10], ['size', 'Bytes stored per write', 1000], ['yrs', 'Years to keep data', 5]];
    var pre = 'es' + (uid++);
    box.innerHTML = '<h3>Calculator: back-of-envelope capacity</h3><div class="row">' + f.map(function (x) { return '<label for="' + pre + x[0] + '">' + x[1] + ' <input id="' + pre + x[0] + '" type="number" min="0" value="' + x[2] + '"></label>'; }).join('') + '</div><dl class="kv"></dl>';
    function fmt(n, units) { var i = 0; while (n >= 1000 && i < units.length - 1) { n /= 1000; i++; } return (n >= 100 ? Math.round(n) : n.toFixed(1)) + ' ' + units[i]; }
    function calc() {
      var v = {}; f.forEach(function (x) { v[x[0]] = Number(q(box, '#' + pre + x[0]).value) || 0; });
      var perDay = v.dau * v.req, avg = perDay / 86400, writes = perDay * v.wr / 100, bytes = writes * v.size * 365 * v.yrs;
      q(box, '.kv').innerHTML = '<dt>Requests per day</dt><dd>' + fmt(perDay, ['', 'thousand', 'million', 'billion', 'trillion']) + '</dd><dt>Average requests per second</dt><dd>' + Math.round(avg).toLocaleString() + '</dd><dt>Peak requests per second</dt><dd>' + Math.round(avg * v.peak).toLocaleString() + '</dd><dt>Writes per second (average)</dt><dd>' + Math.round(writes / 86400).toLocaleString() + '</dd><dt>Reads per write</dt><dd>' + (v.wr ? ((100 - v.wr) / v.wr).toFixed(1) : '∞') + ' : 1</dd><dt>Storage for ' + v.yrs + ' years</dt><dd>' + fmt(bytes, ['B', 'KB', 'MB', 'GB', 'TB', 'PB']) + '</dd>';
    }
    box.addEventListener('input', calc); calc();
  };

  window.SIMS = SIMS;
})();
