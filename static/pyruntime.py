"""Runs learner code in the hosted (static) version of the course, where Python is Pyodide inside the browser.

A browser gives Python no threads, no processes and no network sockets. This module makes the common teaching
patterns work anyway, and makes the rest fail with a clear message instead of hanging:

  * threading.Thread: threads take turns. start() queues the thread; it runs, start to finish, when someone joins
    it, waits on a Queue/Event/Condition/Semaphore it could satisfy, or when the program ends (like Python, which
    waits for non-daemon threads at exit).
  * ThreadPoolExecutor / ProcessPoolExecutor run each task as it is submitted.
  * asyncio.run() uses a small event loop that sleeps between timers (no I/O).
  * sockets, subprocess and input() raise an error that explains why.

`python app.py --check --browser` runs every example and solution through this module with normal Python, so the
behaviour can be tested without a browser.
"""
import asyncio
import asyncio.selector_events
import builtins
import concurrent.futures as _cf
import io
import json
import linecache
import os
import secrets
import selectors
import shutil
import sys
import threading
import time
import traceback

MAX_KEEP = 50_000   # characters of output kept from one run
HERE = os.path.abspath(__file__)
NO_NET = ("Network sockets are not available when Python runs in the browser. "
          "This example works in the local version of the course (python app.py).")
NO_PROC = ("Starting other programs is not possible when Python runs in the browser. "
           "This example works in the local version of the course (python app.py).")
NO_INPUT = "input() is not available on this page. Put the value in the code instead, for example name = \"Ada\"."
DEADLOCK = ("Every thread is waiting, so nothing can continue. In the browser, threads take turns instead of running "
            "at the same time, and this program needs them to run at the same time. "
            "It works in the local version of the course (python app.py).")

_orig = {}
_pending = []     # started threads that have not run yet
_stack = []       # threads running right now; the innermost is last


class _Parked(BaseException):
    """A thread waits for something that only another (already running) thread could provide: it stops quietly,
    as it would stay blocked forever in normal Python."""


def _blocked():
    if _stack:
        raise _Parked()
    raise RuntimeError(DEADLOCK)


def _run_one():
    """Run the oldest waiting thread to the end. False when there is none."""
    for t in list(_pending):
        if t._go():
            return True
    return False


def _report(thread, exc):
    sys.stderr.write("Exception in thread %s:\n%s\n" % (thread.name, format_exception(exc)))


# ---------- threading ----------

class Thread:
    _count = 0

    def __init__(self, group=None, target=None, name=None, args=(), kwargs=None, *, daemon=None):
        Thread._count += 1
        self._target, self._args, self._kwargs = target, tuple(args), dict(kwargs or {})
        if name is None:
            name = "Thread-%d" % Thread._count
            if target is not None and getattr(target, "__name__", ""):
                name += " (%s)" % target.__name__
        self._name = str(name)
        self._daemon = bool(daemon) if daemon is not None else bool(_stack and _stack[-1].daemon)
        self._state = "new"
        self._ident = None

    name = property(lambda self: self._name, lambda self, v: setattr(self, "_name", str(v)))
    daemon = property(lambda self: self._daemon, lambda self, v: setattr(self, "_daemon", bool(v)))
    ident = property(lambda self: self._ident)
    native_id = ident

    def getName(self):
        return self._name

    def setName(self, name):
        self.name = name

    def isDaemon(self):
        return self._daemon

    def setDaemon(self, value):
        self.daemon = value

    def __repr__(self):
        return "<%s(%s, %s)>" % (type(self).__name__, self._name, self._state)

    def start(self):
        if self._state != "new":
            raise RuntimeError("threads can only be started once")
        self._state = "pending"
        self._ident = _orig["get_ident"]() + Thread._count
        _pending.append(self)

    def run(self):
        try:
            if self._target is not None:
                self._target(*self._args, **self._kwargs)
        finally:
            del self._target, self._args, self._kwargs

    def _go(self):
        if self._state != "pending":
            return False
        _pending.remove(self)
        self._state = "running"
        _stack.append(self)
        try:
            self.run()
        except (_Parked, SystemExit):
            pass
        except BaseException as exc:   # Python prints a thread's uncaught error and carries on
            _report(self, exc)
        finally:
            _stack.pop()
            self._state = "done"
        return True

    def join(self, timeout=None):
        if self._state == "new":
            raise RuntimeError("cannot join thread before it is started")
        if self is current_thread():
            raise RuntimeError("cannot join current thread")
        self._go()

    def is_alive(self):
        return self._state in ("pending", "running")


class Timer(Thread):
    def __init__(self, interval, function, args=None, kwargs=None):
        Thread.__init__(self)
        self.interval, self.function = interval, function
        self.args, self.kwargs = args if args is not None else [], kwargs if kwargs is not None else {}
        self.finished = Event()

    def cancel(self):
        self.finished.set()

    def run(self):
        self.finished.wait(self.interval)
        if not self.finished.is_set():
            self.function(*self.args, **self.kwargs)
        self.finished.set()


class Lock:
    def __init__(self):
        self._locked = False

    def acquire(self, blocking=True, timeout=-1):
        if not self._locked:
            self._locked = True
            return True
        if not blocking:
            return False
        if timeout is not None and timeout >= 0:   # only a running thread can hold it; it will not let go meanwhile
            time.sleep(timeout)
            return False
        _blocked()

    def release(self):
        if not self._locked:
            raise RuntimeError("release unlocked lock")
        self._locked = False

    def locked(self):
        return self._locked

    __enter__ = acquire

    def __exit__(self, *exc):
        self.release()

    def _release_save(self):
        self.release()

    def _acquire_restore(self, saved):
        self.acquire()

    def _is_owned(self):
        return self._locked


class RLock:
    def __init__(self):
        self._owner, self._count = None, 0

    def acquire(self, blocking=True, timeout=-1):
        me = current_thread()
        if self._count and self._owner is not me:
            if not blocking:
                return False
            if timeout is not None and timeout >= 0:
                time.sleep(timeout)
                return False
            _blocked()
        self._owner, self._count = me, self._count + 1
        return True

    def release(self):
        if not self._count or self._owner is not current_thread():
            raise RuntimeError("cannot release un-acquired lock")
        self._count -= 1
        if not self._count:
            self._owner = None

    __enter__ = acquire

    def __exit__(self, *exc):
        self.release()

    def _release_save(self):
        saved = (self._owner, self._count)
        self._owner, self._count = None, 0
        return saved

    def _acquire_restore(self, saved):
        self._owner, self._count = saved

    def _is_owned(self):
        return self._count > 0 and self._owner is current_thread()


class Condition:
    def __init__(self, lock=None):
        self._lock = lock if lock is not None else RLock()
        self.acquire, self.release = self._lock.acquire, self._lock.release

    def __enter__(self):
        return self._lock.__enter__()

    def __exit__(self, *exc):
        return self._lock.__exit__(*exc)

    def wait(self, timeout=None):
        saved = self._lock._release_save() if hasattr(self._lock, "_release_save") else self._lock.release()
        try:
            if _run_one():          # let a waiting thread make progress, then the caller checks again
                return True
            if timeout is None:
                _blocked()
            if timeout > 0:
                time.sleep(timeout)
            return False
        finally:
            if hasattr(self._lock, "_acquire_restore"):
                self._lock._acquire_restore(saved)
            else:
                self._lock.acquire()

    def wait_for(self, predicate, timeout=None):
        end, result = None, predicate()
        while not result:
            if timeout is not None:
                if end is None:
                    end = time.monotonic() + timeout
                wait = end - time.monotonic()
                if wait <= 0:
                    break
                self.wait(wait)
            else:
                self.wait()
            result = predicate()
        return result

    def notify(self, n=1):
        pass

    def notify_all(self):
        pass

    notifyAll = notify_all


class Event:
    def __init__(self):
        self._flag = False

    def is_set(self):
        return self._flag

    isSet = is_set

    def set(self):
        self._flag = True

    def clear(self):
        self._flag = False

    def wait(self, timeout=None):
        while not self._flag and _run_one():
            pass
        if not self._flag:
            if timeout is None:
                _blocked()
            if timeout > 0:
                time.sleep(timeout)
        return self._flag


class Semaphore:
    def __init__(self, value=1):
        if value < 0:
            raise ValueError("semaphore initial value must be >= 0")
        self._value = value

    def acquire(self, blocking=True, timeout=None):
        while self._value == 0:
            if not blocking:
                return False
            if not _run_one():
                if timeout is not None:
                    time.sleep(timeout)
                    return False
                _blocked()
        self._value -= 1
        return True

    __enter__ = acquire

    def release(self, n=1):
        self._value += n

    def __exit__(self, *exc):
        self.release()


class BoundedSemaphore(Semaphore):
    def __init__(self, value=1):
        Semaphore.__init__(self, value)
        self._initial = value

    def release(self, n=1):
        if self._value + n > self._initial:
            raise ValueError("Semaphore released too many times")
        self._value += n


def current_thread():
    return _stack[-1] if _stack else _orig["current_thread"]()


def get_ident():
    return _stack[-1].ident if _stack else _orig["get_ident"]()


def active_count():
    return 1 + len(_pending) + len(_stack)


def enumerate_threads():
    return [_orig["main_thread"]()] + list(_stack) + list(_pending)


# ---------- executors ----------

class SyncExecutor(_cf.Executor):
    """Stands in for ThreadPoolExecutor and ProcessPoolExecutor: each task runs when it is submitted."""

    _made = 0

    def __init__(self, max_workers=None, thread_name_prefix="", *args, **kwargs):
        if max_workers is not None and max_workers <= 0:
            raise ValueError("max_workers must be greater than 0")
        self._max_workers = max_workers or 4
        self._prefix = thread_name_prefix or "ThreadPoolExecutor-%d" % SyncExecutor._made
        SyncExecutor._made += 1
        self._submitted = 0
        self._shutdown = False

    def submit(self, fn, /, *args, **kwargs):
        if self._shutdown:
            raise RuntimeError("cannot schedule new futures after shutdown")
        future = _cf.Future()
        future.set_running_or_notify_cancel()

        def work():
            try:
                result = fn(*args, **kwargs)
            except BaseException as exc:
                future.set_exception(exc)
            else:
                future.set_result(result)

        # Run it inside a worker "thread", so current_thread() shows a pool thread name as in normal Python.
        worker = Thread(target=work, name="%s_%d" % (self._prefix, self._submitted % self._max_workers), daemon=True)
        self._submitted += 1
        worker.start()
        worker._go()
        return future

    def shutdown(self, wait=True, *, cancel_futures=False):
        self._shutdown = True


# ---------- asyncio without I/O ----------

class _SleepSelector(selectors.BaseSelector):
    def register(self, fileobj, events, data=None):
        raise OSError(NO_NET)

    def unregister(self, fileobj):
        raise KeyError(fileobj)

    def select(self, timeout=None):
        if timeout is None:     # nothing is scheduled: maybe a waiting thread will hand the loop a result
            _run_one()
        elif timeout > 0:
            time.sleep(timeout)
        return []

    def get_map(self):
        return {}

    def close(self):
        pass


class EventLoop(asyncio.selector_events.BaseSelectorEventLoop):
    def __init__(self):
        super().__init__(_SleepSelector())

    def _make_self_pipe(self):
        self._ssock = self._csock = None

    def _close_self_pipe(self):
        pass

    def _write_to_self(self):
        pass

    async def shutdown_default_executor(self, timeout=None):
        # The standard version waits for a helper thread; here the executor has nothing left to finish.
        self._executor_shutdown_called = True
        if self._default_executor is not None:
            self._default_executor.shutdown(wait=True)
            self._default_executor = None


def _asyncio_run(main, *, debug=None, loop_factory=None):
    # Pyodide marks its own browser event loop as running, and asyncio.run() refuses to start inside a running loop.
    # Learner code runs synchronously here, so hide that loop for the duration of the call.
    outer = asyncio.events._get_running_loop()
    asyncio.events._set_running_loop(None)
    try:
        return _orig["asyncio_run"](main, debug=debug, loop_factory=loop_factory or EventLoop)
    finally:
        asyncio.events._set_running_loop(outer)


# ---------- the rest of the sandbox ----------

def _no_socketpair(*args, **kwargs):
    raise OSError(NO_NET)


def _no_input(prompt=""):
    raise EOFError(NO_INPUT)


def install():
    """Patch the standard library once, before any learner code runs."""
    if _orig:
        return
    _orig.update(current_thread=threading.current_thread, get_ident=threading.get_ident,
                 main_thread=threading.main_thread, asyncio_run=asyncio.run)
    for name, value in (("Thread", Thread), ("Timer", Timer), ("Lock", Lock), ("RLock", RLock),
                        ("Condition", Condition), ("Event", Event), ("Semaphore", Semaphore),
                        ("BoundedSemaphore", BoundedSemaphore), ("current_thread", current_thread),
                        ("currentThread", current_thread), ("get_ident", get_ident), ("get_native_id", get_ident),
                        ("active_count", active_count), ("activeCount", active_count),
                        ("enumerate", enumerate_threads)):
        setattr(threading, name, value)
    _cf.ThreadPoolExecutor = _cf.ProcessPoolExecutor = SyncExecutor
    asyncio.run = _asyncio_run
    asyncio.new_event_loop = EventLoop
    try:
        import socket

        class _NoSocket(socket.socket):
            def __init__(self, *args, **kwargs):
                raise OSError(NO_NET)

        socket.socket = _NoSocket
        socket.socketpair = _no_socketpair
    except ImportError:
        pass
    try:
        import subprocess

        class _NoPopen(subprocess.Popen):
            def __init__(self, *args, **kwargs):
                raise OSError(NO_PROC)

        subprocess.Popen = _NoPopen
    except ImportError:
        pass
    os.system = lambda command: (_ for _ in ()).throw(OSError(NO_PROC))
    builtins.input = _no_input


def format_exception(exc, filenames=("example.py", "solution.py")):
    """The traceback the learner would see from normal Python: frames of this module are left out."""
    tb = exc.__traceback__
    while tb is not None and tb.tb_frame.f_code.co_filename not in filenames:
        tb = tb.tb_next
    if tb is None:
        tb = exc.__traceback__
        while tb is not None and os.path.abspath(tb.tb_frame.f_code.co_filename) == HERE:
            tb = tb.tb_next
    report = traceback.TracebackException(type(exc), exc, tb)
    report.stack = traceback.StackSummary.from_list(
        [f for f in report.stack if os.path.abspath(f.filename) != HERE] or report.stack)
    return "".join(report.format()).rstrip()


class _Output(io.TextIOBase):
    """Collects stdout and stderr together. `sink`, if given, receives the output so far every quarter second,
    so a program that is stopped for running too long still shows what it printed."""

    encoding = "utf-8"

    def __init__(self, sink=None):
        self._parts, self._size, self._sink, self._last, self._writes = [], 0, sink, time.monotonic(), 0

    def writable(self):
        return True

    def write(self, text):
        text = str(text)
        if self._size < MAX_KEEP:
            self._parts.append(text[:MAX_KEEP - self._size])
            self._size += len(text)
        self._writes += 1
        # The first writes are always passed on, so "print, then loop forever" still shows the print when stopped.
        if self._sink is not None and (self._writes <= 200 or time.monotonic() - self._last > 0.25):
            self._last = time.monotonic()
            self._sink(self.getvalue())
        return len(text)

    def getvalue(self):
        return "".join(self._parts)


def _reset():
    del _pending[:]
    del _stack[:]


def _enter(workdir):
    home = os.getcwd()
    if workdir:
        os.makedirs(workdir, exist_ok=True)
        os.chdir(workdir)
    return home


def _leave(home, workdir):
    os.chdir(home)
    if workdir:
        shutil.rmtree(workdir, ignore_errors=True)


def run(code, workdir=None, sink=None):
    """Run a program like `python example.py` and return everything it printed."""
    install()
    _reset()
    home = _enter(workdir)
    out = _Output(sink)
    saved = sys.stdout, sys.stderr, sys.argv
    sys.stdout = sys.stderr = out
    sys.argv = ["example.py"]
    linecache.cache["example.py"] = (len(code), None, code.splitlines(True), "example.py")
    try:
        try:
            exec(compile(code, "example.py", "exec"), {"__name__": "__main__", "__file__": "example.py",
                                                       "__builtins__": builtins})
            while any(not t.daemon for t in _pending):   # Python waits for the threads that are still to finish
                next(t for t in _pending if not t.daemon)._go()
        except SystemExit as exc:
            if exc.code is not None and not isinstance(exc.code, int):
                out.write(str(exc.code) + "\n")
        except BaseException as exc:
            out.write(format_exception(exc) + "\n")
    finally:
        sys.stdout, sys.stderr, sys.argv = saved
        _reset()
        _leave(home, workdir)
    return out.getvalue()


def judge(program, code, tests, limit=0, workdir=None):
    """Run the judge program (app.py's JUDGE_PROGRAM) on code and tests; return its result as a JSON string."""
    install()
    _reset()
    home = _enter(workdir)
    for name, text in (("solution.py", code), ("tests.py", tests)):
        with open(name, "w", encoding="utf-8") as handle:
            handle.write(text)
    linecache.cache.pop("solution.py", None)   # tracebacks must quote this run's code, not an earlier one
    token = secrets.token_hex(8)
    channel = io.StringIO()
    saved = sys.stdout, sys.stderr, sys.argv, sys.__stdout__
    sys.stdout = sys.stderr = io.StringIO()          # output outside the judged parts is dropped
    sys.__stdout__ = channel
    sys.argv = ["judge.py", token, str(int(limit))]
    result = {"cases": [], "error": "", "stdout": "", "total": 0}
    try:
        exec(compile(program, "judge.py", "exec"), {"__name__": "__main__", "__builtins__": builtins})
        text = channel.getvalue()
        head, found, tail = text.rpartition("\n" + token)
        if found:
            result = json.loads(tail.strip())
        else:
            result["error"] = "The program stopped without a result."
    except SystemExit:
        result["error"] = "The program called exit() before the tests could run."
    except BaseException as exc:
        result["error"] = format_exception(exc)
    finally:
        sys.stdout, sys.stderr, sys.argv, sys.__stdout__ = saved
        _reset()
        _leave(home, workdir)
    return json.dumps(result)
