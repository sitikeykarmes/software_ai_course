/* Hosted version only: runs Python in the browser with Pyodide (CPython compiled to WebAssembly).
   It runs in a Web Worker, so a long-running program never freezes the page, and hosted.js can stop it after the
   time limit by ending the worker. Messages in:  {id, type: 'run', code}  or  {id, type: 'judge', code, tests, limit}
   Messages out: {id, phase: 'start'} when the code starts, {id, partial} with output so far, {id, result} or {id, error}. */
'use strict';
var PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
importScripts(PYODIDE + 'pyodide.js');

var runs = 0;
var ready = (async function () {
  var py = await loadPyodide({ indexURL: PYODIDE });
  var files = await Promise.all(['pyruntime.py', 'judge.py'].map(function (name) {
    return fetch(name).then(function (r) { if (!r.ok) throw new Error(name + ': HTTP ' + r.status); return r.text(); });
  }));
  py.FS.mkdirTree('/course');
  py.FS.writeFile('/course/pyruntime.py', files[0]);
  py.runPython("import sys\nsys.path.insert(0, '/course')\nimport pyruntime\npyruntime.install()");
  return { py: py, judge: files[1], runtime: py.pyimport('pyruntime') };
})();
ready.then(function () { postMessage({ phase: 'ready' }); }, function (err) { postMessage({ phase: 'failed', error: String(err && err.message || err) }); });

onmessage = async function (e) {
  var job = e.data, env;
  try { env = await ready; } catch (err) {
    postMessage({ id: job.id, error: 'Python could not be loaded in this browser (' + (err && err.message || err) + '). Check the internet connection and reload the page.' });
    return;
  }
  var source = job.code + '\n' + (job.tests || '');
  try {   // packages such as numpy or sqlite3 are downloaded the first time a program imports them
    if (!env.fullHashlib && /\bhashlib\b/.test(source)) {
      // Without this optional package (about 3.7 MB), hashlib has only the basic hashes: no pbkdf2_hmac or scrypt.
      // hashlib and hmac were already imported at start-up, so reload them to pick up the full version.
      await env.py.loadPackage('hashlib', { messageCallback: function () {} });
      env.py.runPython('import importlib, hashlib, hmac\nimportlib.reload(hashlib)\nimportlib.reload(hmac)');
      env.fullHashlib = true;
    }
    await env.py.loadPackagesFromImports(source, { messageCallback: function () {} });
  } catch (err) { /* the import itself will then report what is missing */ }
  var dir = '/tmp/run' + (++runs);
  postMessage({ id: job.id, phase: 'start' });
  try {
    var result = job.type === 'judge'
      ? env.runtime.judge(env.judge, job.code, job.tests || '', job.limit || 0, dir)
      : env.runtime.run(job.code, dir, function (text) { postMessage({ id: job.id, partial: text }); });
    postMessage({ id: job.id, result: result });
  } catch (err) {
    postMessage({ id: job.id, error: String(err && err.message || err) });
  }
};
