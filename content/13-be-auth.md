---
id: be-auth
title: Authentication and authorization
minutes: 55
---

Authentication answers "who are you?". Authorization answers "what may you do?". Most serious security incidents in web applications come from getting the second one wrong, so this lesson covers both with working code.

## Storing passwords

Never store passwords, and never encrypt them. Store a **slow, salted hash**.

- **Hash**: a one-way function. You cannot recover the password; you hash the login attempt and compare.
- **Salt**: random bytes, unique per user, mixed in before hashing. Two users with the same password get different hashes, and precomputed tables become useless.
- **Slow on purpose**: a password hash should take tens of milliseconds so that guessing billions of passwords is too expensive. MD5 and SHA-256 are fast and therefore wrong for passwords. Use Argon2id, bcrypt or scrypt.

The standard library has `scrypt` and PBKDF2, so this runs anywhere:

```python run
import hashlib, hmac, os

def hash_password(password):
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return salt.hex() + "$" + digest.hex()                 # store this string

def verify_password(password, stored):
    salt_hex, digest_hex = stored.split("$")
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 200_000)
    return hmac.compare_digest(digest.hex(), digest_hex)   # constant-time comparison

record = hash_password("s3cret!")
print(record[:40] + "...")
print(verify_password("s3cret!", record), verify_password("guess", record))
print("same password, different hash:", hash_password("s3cret!")[:20], hash_password("s3cret!")[:20])
```

With the `argon2-cffi` package the production version is two lines: `PasswordHasher().hash(pw)` and `.verify(stored, pw)`.

Three different things that are often confused:

| | Reversible? | Needs a key? | Purpose |
| --- | --- | --- | --- |
| Encoding (Base64, URL encoding) | Yes, by anyone | No | Represent bytes as text. No security at all |
| Hashing (SHA-256, Argon2) | No | No | Fingerprints, integrity, password storage |
| Encryption (AES, RSA) | Yes, with the key | Yes | Confidentiality |

## Sessions

The classic web login.

1. The user submits email and password.
2. The server verifies them, creates a random **session ID**, and stores `session_id → user_id` in a server-side store such as Redis.
3. The server sets a cookie holding the session ID.
4. The browser sends the cookie on every request; the server looks the session up.
5. Logout deletes the session, which takes effect immediately.

Cookie attributes that matter:

- `HttpOnly`: JavaScript cannot read the cookie, which blunts token theft through XSS.
- `Secure`: sent only over HTTPS.
- `SameSite=Lax` or `Strict`: not sent on most cross-site requests, which blunts CSRF.

```python run
import secrets, time

SESSIONS = {}                       # in production: Redis with an expiry

def login(user_id):
    sid = secrets.token_urlsafe(32)                # unguessable
    SESSIONS[sid] = {"user_id": user_id, "expires": time.time() + 3600}
    return f"Set-Cookie: session={sid}; HttpOnly; Secure; SameSite=Lax; Max-Age=3600"

def current_user(cookie_value):
    s = SESSIONS.get(cookie_value)
    if not s or s["expires"] < time.time():
        return None
    return s["user_id"]

header = login(42)
sid = header.split("session=")[1].split(";")[0]
print(header[:60] + "...")
print(current_user(sid), current_user("forged-value"))
del SESSIONS[sid]                                  # logout
print(current_user(sid))
```

## JSON Web Tokens

A JWT is a signed token that carries its own data, so the server can verify it without a lookup. It has three Base64URL parts: `header.payload.signature`.

- **Header**: the algorithm.
- **Payload**: claims such as `sub` (user ID), `exp` (expiry), `role`. Anyone can decode it, so never put secrets in it.
- **Signature**: computed over the first two parts with a key. Change one character of the payload and verification fails.

Build one by hand to remove the mystery:

```python run
import base64, hashlib, hmac, json, time

SECRET = b"load-this-from-an-environment-variable"

def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def unb64(text):
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))

def issue(user_id, role, ttl=900):
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = b64(json.dumps({"sub": user_id, "role": role, "exp": int(time.time()) + ttl}).encode())
    signature = b64(hmac.new(SECRET, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"

def verify(token):
    header, payload, signature = token.split(".")
    expected = b64(hmac.new(SECRET, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected):
        raise ValueError("bad signature")
    claims = json.loads(unb64(payload))
    if claims["exp"] < time.time():
        raise ValueError("expired")
    return claims

token = issue(42, "viewer")
print(token)
print(verify(token))

# An attacker edits the payload to become admin, keeping the old signature:
h, p, s = token.split(".")
forged = h + "." + b64(json.dumps({"sub": 42, "role": "admin", "exp": int(time.time()) + 900}).encode()) + "." + s
try:
    verify(forged)
except ValueError as exc:
    print("forgery rejected:", exc)
```

In real projects use a maintained library (`PyJWT`), always pass the list of allowed algorithms, and never accept `alg: none`.

- **HS256** uses one shared secret to sign and verify. Fine inside one service.
- **RS256 / ES256** sign with a private key and verify with a public key, so many services can verify tokens while only the auth service can issue them.

### Sessions vs JWT

| | Server session | JWT |
| --- | --- | --- |
| The client holds | A random ID | A signed token with claims |
| The truth lives | In the server's store | In the token |
| Check per request | A store lookup | A signature check, no lookup |
| Logout or revoke | Instant: delete the session | Hard: the token is valid until it expires |
| Fits | Traditional web apps | APIs, mobile apps, many services |

### Access and refresh tokens

The standard answer to the revocation problem:

- A short-lived **access token** (about 15 minutes) is sent with every API call.
- A long-lived **refresh token** (days or weeks) is stored server-side and exchanged for a new access token.
- **Rotation**: each refresh issues a new refresh token and invalidates the old one. If an old one is ever presented again, someone stole it, so revoke the whole family.

Where the browser keeps tokens: an `HttpOnly` cookie is safer than `localStorage`, which any script on the page can read.

## OAuth 2.0 and OpenID Connect

**OAuth 2.0** lets a user grant an application limited access to their data on another service without sharing their password. **OpenID Connect (OIDC)** adds identity on top; it is what "Sign in with Google" uses.

The four roles: the **resource owner** (the user), the **client** (your app), the **authorization server** (Google's login), the **resource server** (Google's API).

The authorization code flow with PKCE:

1. Your app creates a random `code_verifier`, hashes it into a `code_challenge`, and redirects the user to the provider with its client ID, the requested **scopes** and the challenge.
2. The user logs in at the provider and approves the scopes.
3. The provider redirects back to your registered URL with a short-lived **authorization code**.
4. Your backend sends the code plus the original `code_verifier` to the provider's token endpoint.
5. The provider returns an **access token** (to call its APIs) and, with OIDC, an **ID token** (a JWT stating who the user is).

PKCE ensures that someone who intercepts the code in step 3 cannot use it, because they lack the verifier. Scopes such as `read:calendar` limit what the token can do.

Other flows: **client credentials** for server-to-server calls with no user; **device code** for TVs and command-line tools.

## Other mechanisms

- **API keys**: long random strings identifying a calling program. Store only their hash, show the key once, allow rotation, attach scopes and rate limits.
- **Multi-factor authentication**: something you know plus something you have. TOTP apps generate a 6-digit code from a shared secret and the current time.
- **Passkeys (WebAuthn)**: the device holds a private key and signs a challenge. Nothing reusable crosses the network, so phishing fails.
- **Single sign-on**: one company login for many apps, through OIDC or the older XML-based SAML.
- **mTLS**: both sides present certificates. Used between internal services.

## Authorization

- **RBAC** (role-based): users have roles; roles have permissions. Simple and the most common.
- **ABAC** (attribute-based): rules over attributes. "Managers may approve expenses under 50,000 in their own department."
- **Ownership checks**: the most frequently missed check. `GET /orders/981` must confirm that order 981 belongs to the caller. Skipping it is called IDOR (insecure direct object reference) and sits at the top of the OWASP list as broken access control.

```python run
ROLE_PERMISSIONS = {
    "viewer":   {"order:read"},
    "operator": {"order:read", "order:create"},
    "admin":    {"order:read", "order:create", "order:delete", "user:manage"},
}
ORDERS = {981: {"owner": 7, "item": "gearbox"}, 982: {"owner": 8, "item": "axle"}}

class Forbidden(Exception): pass

def require(user, permission):
    if permission not in ROLE_PERMISSIONS[user["role"]]:
        raise Forbidden(f"{user['role']} lacks {permission}")

def get_order(user, order_id):
    require(user, "order:read")                           # role check
    order = ORDERS[order_id]
    if order["owner"] != user["id"] and user["role"] != "admin":
        raise Forbidden("not your order")                 # ownership check
    return order

alice = {"id": 7, "role": "operator"}
print(get_order(alice, 981))
for attempt in (lambda: get_order(alice, 982), lambda: require(alice, "order:delete")):
    try:
        attempt()
    except Forbidden as exc:
        print("403:", exc)
```

Enforce authorization on the server for every request. Hiding a button in the frontend protects nothing.

## Attacks tied to authentication

| Attack | What happens | Defence |
| --- | --- | --- |
| Credential stuffing | Passwords leaked elsewhere are tried at scale | Rate limits, MFA, checking against breached-password lists |
| Brute force | Many guesses against one account | Lockouts with backoff, slow hashes |
| XSS | Injected script runs in your page and steals tokens | Escape output, Content Security Policy, HttpOnly cookies |
| CSRF | Another site makes the browser send a request carrying your cookie | SameSite cookies, CSRF tokens |
| Session fixation | Attacker plants a known session ID before login | Issue a new session ID at login |
| Token leakage | Tokens in URLs, logs or error messages | Send tokens in headers; never log them |
| Timing attack | Comparison time reveals how many characters matched | Constant-time comparison (`hmac.compare_digest`) |

In production most teams use an identity provider (Keycloak, Auth0, AWS Cognito, Microsoft Entra ID) instead of writing login from scratch. Build it by hand once, as above, so you understand what the provider does for you.

## Check yourself

```quiz
[
  {"q": "Why is SHA-256 a poor choice for storing passwords?", "options": ["It is reversible", "It is fast, so attackers can test billions of guesses per second", "It produces short output"], "answer": 1, "why": "Password hashing must be deliberately slow and salted."},
  {"q": "What does a salt prevent?", "options": ["Slow logins", "Identical passwords producing identical hashes, and precomputed lookup tables", "SQL injection"], "answer": 1, "why": "Each user's hash must be attacked separately."},
  {"q": "Can anyone read the payload of a JWT?", "options": ["No, it is encrypted", "Yes, it is only Base64-encoded; the signature prevents changing it", "Only the issuer"], "answer": 1, "why": "Signing gives integrity, not secrecy. Keep secrets out of the payload."},
  {"q": "A user changes `/orders/981` to `/orders/982` and sees another customer's order. Which check is missing?", "options": ["Password hashing", "An ownership (object-level authorization) check", "TLS"], "answer": 1, "why": "This is IDOR, a form of broken access control."},
  {"q": "Why use short-lived access tokens with a refresh token?", "options": ["They are smaller", "A stolen access token is useful only for minutes, and refresh tokens can be revoked server-side", "They avoid HTTPS"], "answer": 1, "why": "It bounds the damage of theft while keeping stateless verification."},
  {"q": "In OAuth, what do scopes do?", "options": ["Encrypt the token", "Limit what the token is allowed to access", "Identify the user's device"], "answer": 1, "why": "The user approves specific permissions, not full access."}
]
```

## Practice

Each task below has a problem statement, examples and starter code. Press **Start practicing**, write your solution, then **Run tests**.

````task
id: auth-service
title: Tiny login system
kind: code
level: medium
@@statement
Build a class `AuthService` that combines password hashing, sessions and a protected action. Everything lives in memory.

**Methods**
- `signup(username, password)` returns `True` if the user was created. Return `False` if the username already exists or the password is shorter than 8 characters.
- `login(username, password)` returns a random session token (a `str`) if the credentials are right, otherwise `None`. Unknown users and wrong passwords both return `None`.
- `logout(token)` ends the session. Logging out an unknown token does nothing.
- `whoami(token)` returns the username for a valid session, otherwise `None`.
- `protected_action(token)` returns the string `"secret for <username>"` for a valid session and raises `PermissionError` otherwise.

**Rules**
- Never store the plain password. Store a random per-user salt and `hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 1000)`.
- Compare hashes with `hmac.compare_digest`.
- Two logins create two different tokens; logging out one does not end the other.

**Example**

```
s = AuthService()
s.signup("ana", "correcthorse")   -> True
t = s.login("ana", "correcthorse")
s.whoami(t)                       -> "ana"
s.logout(t)
s.whoami(t)                       -> None
```
@@starter
import hashlib
import hmac
import secrets

class AuthService:
    def __init__(self):
        pass

    def signup(self, username, password):
        pass

    def login(self, username, password):
        pass

    def logout(self, token):
        pass

    def whoami(self, token):
        pass

    def protected_action(self, token):
        pass
@@tests
_s = AuthService()
assert _s.signup("ana", "correcthorse") is True, "signup works"
assert _s.signup("ana", "anotherpassword") is False, "duplicate username"
assert _s.signup("bob", "short") is False, "password too short"
assert _s.login("ana", "wrongpassword") is None, "wrong password"
assert _s.login("nobody", "correcthorse") is None, "unknown user"
_t1 = _s.login("ana", "correcthorse")
_t2 = _s.login("ana", "correcthorse")
assert isinstance(_t1, str) and _t1 != _t2, "tokens are random strings"
assert _s.whoami(_t1) == "ana", "whoami"
assert _s.protected_action(_t1) == "secret for ana", "protected action"
_s.logout(_t1)
assert _s.whoami(_t1) is None and _s.whoami(_t2) == "ana", "logout ends only that session"
_s.logout("unknown-token")
try:
    _s.protected_action(_t1)
    _ok = False
except PermissionError:
    _ok = True
assert _ok, "protected action needs a valid session"
assert "correcthorse" not in repr(vars(_s)), "plain password must not be stored"
@@hint
Keep two dicts: `username -> (salt, hash)` and `token -> username`. `secrets.token_bytes(16)` makes the salt and `secrets.token_hex(16)` makes the token.
@@solution
import hashlib
import hmac
import secrets

class AuthService:
    def __init__(self):
        self._users = {}
        self._sessions = {}

    def _hash(self, password, salt):
        return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 1000)

    def signup(self, username, password):
        if username in self._users or len(password) < 8:
            return False
        salt = secrets.token_bytes(16)
        self._users[username] = (salt, self._hash(password, salt))
        return True

    def login(self, username, password):
        record = self._users.get(username)
        if record is None:
            return None
        salt, stored = record
        if not hmac.compare_digest(stored, self._hash(password, salt)):
            return None
        token = secrets.token_hex(16)
        self._sessions[token] = username
        return token

    def logout(self, token):
        self._sessions.pop(token, None)

    def whoami(self, token):
        return self._sessions.get(token)

    def protected_action(self, token):
        user = self.whoami(token)
        if user is None:
            raise PermissionError("login required")
        return "secret for " + user
````

````task
id: refresh-rotation
title: Refresh tokens with reuse detection
kind: code
level: hard
@@statement
Write a class `RefreshTokens` that implements refresh-token rotation. Every token belongs to a **family** (one login). Using a token gives you a new one and burns the old one. If a burned token is presented again, someone stole it, so the whole family is revoked.

**Methods**
- `issue(user)` starts a new family and returns a new token (`str`).
- `rotate(token)` returns a new token in the same family and marks the old token as used. It returns `None` if the token is unknown, or its family is revoked. If the token was **already used**, revoke the whole family and return `None`.
- `is_valid(token)` is `True` only for an unused token in a family that is not revoked.

**Example**

```
r = RefreshTokens()
t1 = r.issue("ana")
t2 = r.rotate(t1)      # a new token
r.is_valid(t1)         -> False
r.rotate(t1)           -> None    (reuse detected, family revoked)
r.is_valid(t2)         -> False   (even the newest token is now dead)
```
@@starter
import secrets

class RefreshTokens:
    def __init__(self):
        pass

    def issue(self, user):
        pass

    def rotate(self, token):
        pass

    def is_valid(self, token):
        pass
@@tests
_r = RefreshTokens()
_t1 = _r.issue("ana")
assert isinstance(_t1, str) and _r.is_valid(_t1), "fresh token is valid"
_t2 = _r.rotate(_t1)
assert isinstance(_t2, str) and _t2 != _t1, "rotate returns a new token"
assert _r.is_valid(_t2) and not _r.is_valid(_t1), "old token is burned"
_t3 = _r.rotate(_t2)
assert _r.is_valid(_t3), "chain continues"
assert _r.rotate(_t1) is None, "reuse of an old token is refused"
assert not _r.is_valid(_t3), "reuse revokes the whole family"
assert _r.rotate(_t3) is None, "revoked family cannot rotate"
assert _r.rotate("unknown") is None and not _r.is_valid("unknown"), "unknown token"
_b = _r.issue("bob")
assert _r.is_valid(_b), "other families are not affected"
@@hint
Store for each token: its family id, and whether it was used. Keep a set of revoked family ids.
@@solution
import secrets

class RefreshTokens:
    def __init__(self):
        self._tokens = {}
        self._revoked = set()

    def _new(self, family, user):
        token = secrets.token_hex(16)
        self._tokens[token] = {"family": family, "user": user, "used": False}
        return token

    def issue(self, user):
        return self._new(secrets.token_hex(8), user)

    def rotate(self, token):
        rec = self._tokens.get(token)
        if rec is None or rec["family"] in self._revoked:
            return None
        if rec["used"]:
            self._revoked.add(rec["family"])
            return None
        rec["used"] = True
        return self._new(rec["family"], rec["user"])

    def is_valid(self, token):
        rec = self._tokens.get(token)
        return rec is not None and not rec["used"] and rec["family"] not in self._revoked
````

````task
id: note-ownership
title: Users cannot touch each other's notes
kind: code
level: medium
@@statement
Write a class `NoteService` where every note belongs to the user who created it. This is the check that stops "user A reads user B's data" (broken object-level authorization).

**Methods**
- `create(user, text)` returns a new integer note id (1, 2, 3 ...).
- `read(user, note_id)` returns the note text.
- `update(user, note_id, text)` replaces the text and returns `None`.
- `delete(user, note_id)` removes the note and returns `None`.

**Errors**
- Unknown `note_id`: raise `KeyError`.
- The note belongs to someone else: raise `PermissionError`, and change nothing.

**Example**

```
n = NoteService()
i = n.create("ana", "dentist at 5")   -> 1
n.read("ana", i)                      -> "dentist at 5"
n.read("bob", i)                      -> raises PermissionError
```
@@starter
class NoteService:
    def __init__(self):
        pass

    def create(self, user, text):
        pass

    def read(self, user, note_id):
        pass

    def update(self, user, note_id, text):
        pass

    def delete(self, user, note_id):
        pass
@@tests
def _raises(exc, fn, *args):
    try:
        fn(*args)
    except exc:
        return True
    except Exception:
        return False
    return False

_n = NoteService()
_a = _n.create("ana", "dentist at 5")
_b = _n.create("bob", "bob's secret")
assert _a != _b and isinstance(_a, int), "ids are distinct integers"
assert _n.read("ana", _a) == "dentist at 5", "owner can read"
assert _raises(PermissionError, _n.read, "ana", _b), "A cannot read B's note"
assert _raises(PermissionError, _n.update, "ana", _b, "hacked"), "A cannot update B's note"
assert _raises(PermissionError, _n.delete, "ana", _b), "A cannot delete B's note"
assert _n.read("bob", _b) == "bob's secret", "B's note is unchanged"
assert _raises(KeyError, _n.read, "ana", 999), "unknown id"
_n.update("ana", _a, "dentist at 6")
assert _n.read("ana", _a) == "dentist at 6", "owner can update"
_n.delete("ana", _a)
assert _raises(KeyError, _n.read, "ana", _a), "deleted note is gone"
@@hint
Store `note_id -> (owner, text)`. Write one private helper that looks up the note and checks the owner, and call it from all three methods.
@@solution
class NoteService:
    def __init__(self):
        self._notes = {}
        self._next = 1

    def _get(self, user, note_id):
        if note_id not in self._notes:
            raise KeyError(note_id)
        owner, text = self._notes[note_id]
        if owner != user:
            raise PermissionError("not your note")
        return text

    def create(self, user, text):
        note_id = self._next
        self._next += 1
        self._notes[note_id] = (user, text)
        return note_id

    def read(self, user, note_id):
        return self._get(user, note_id)

    def update(self, user, note_id, text):
        self._get(user, note_id)
        self._notes[note_id] = (user, text)

    def delete(self, user, note_id):
        self._get(user, note_id)
        del self._notes[note_id]
````

````task
id: login-rate-limit
title: Lock an account after 5 failed logins
kind: code
level: easy
@@statement
Write a class `LoginLimiter(max_failures=5, lock_seconds=60)`. The time is passed in by the caller (as a number of seconds) so the class is easy to test.

**Methods**
- `record_failure(user, now)`: count one failed login. When the user reaches `max_failures` failures, lock the account until `now + lock_seconds`.
- `record_success(user)`: reset that user's failure count.
- `is_locked(user, now)`: `True` while `now` is **before** the lock end time, otherwise `False`.

**Rules**
- Failures are counted per user.
- When a lock has ended, the failure count starts again from 0.

**Example**

```
lim = LoginLimiter()
for i in range(5): lim.record_failure("ana", 100)
lim.is_locked("ana", 159)   -> True
lim.is_locked("ana", 160)   -> False
```
@@starter
class LoginLimiter:
    def __init__(self, max_failures=5, lock_seconds=60):
        pass

    def record_failure(self, user, now):
        pass

    def record_success(self, user):
        pass

    def is_locked(self, user, now):
        pass
@@tests
_l = LoginLimiter()
for _i in range(4):
    _l.record_failure("ana", 100)
assert not _l.is_locked("ana", 100), "4 failures do not lock"
_l.record_failure("ana", 100)
assert _l.is_locked("ana", 100), "5th failure locks"
assert _l.is_locked("ana", 159.9), "still locked"
assert not _l.is_locked("ana", 160), "unlocked after 60 seconds"
assert not _l.is_locked("bob", 100), "other users are not affected"
for _i in range(4):
    _l.record_failure("ana", 200)
assert not _l.is_locked("ana", 200), "count restarted after the lock ended"
_l.record_success("ana")
_l.record_failure("ana", 201)
assert not _l.is_locked("ana", 201), "success resets the counter"
_s = LoginLimiter(max_failures=2, lock_seconds=10)
_s.record_failure("x", 0)
_s.record_failure("x", 1)
assert _s.is_locked("x", 10) and not _s.is_locked("x", 11), "custom limits"
@@hint
Keep two dicts: `failures[user]` and `locked_until[user]`. In `record_failure`, first clear the old lock if it has ended.
@@solution
class LoginLimiter:
    def __init__(self, max_failures=5, lock_seconds=60):
        self.max_failures = max_failures
        self.lock_seconds = lock_seconds
        self.failures = {}
        self.locked_until = {}

    def is_locked(self, user, now):
        return now < self.locked_until.get(user, float("-inf"))

    def record_failure(self, user, now):
        if user in self.locked_until and not self.is_locked(user, now):
            del self.locked_until[user]
            self.failures[user] = 0
        self.failures[user] = self.failures.get(user, 0) + 1
        if self.failures[user] >= self.max_failures:
            self.locked_until[user] = now + self.lock_seconds

    def record_success(self, user):
        self.failures[user] = 0
        self.locked_until.pop(user, None)
````

````task
id: pkce-flow
title: Authorization code flow with PKCE
kind: text
level: medium
@@statement
A single-page app (`https://app.example`) lets users sign in with an identity provider (`https://idp.example`) and then calls your API (`https://api.example`). The app cannot keep a client secret.

Describe the **authorization code flow with PKCE** step by step, as a numbered list of 8-12 lines. For every step say:
- who sends what to whom (browser, app, IdP, API),
- which values travel in the request or redirect (name the parameters),
- whether it goes through the browser URL (front channel) or directly server to server (back channel).

Finish with 2 sentences: what attack does PKCE stop, and why does a stolen authorization `code` not help the attacker?
@@hint
Start from the moment the user clicks "Sign in". Remember that the `code_verifier` is created first, and only its hash (the challenge) is sent in the first redirect.
@@solution
1. The user clicks "Sign in". The app creates a random `code_verifier` and computes `code_challenge = base64url(SHA256(code_verifier))`. It also creates a random `state`.
2. The app redirects the browser to `https://idp.example/authorize` with `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge` and `code_challenge_method=S256` (front channel).
3. The IdP shows its own login page. The user types the password there, never in the app.
4. The IdP checks the user, stores the `code_challenge` with a new short-lived authorization `code`, and may ask for consent.
5. The IdP redirects the browser back to `https://app.example/callback?code=...&state=...` (front channel).
6. The app checks that `state` equals the value from step 1 (protects against CSRF).
7. The app sends a POST to the IdP token endpoint with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id` and the original `code_verifier` (back channel, no secret).
8. The IdP hashes the `code_verifier`, compares it with the stored challenge, checks the code is unused and not expired, then returns an access token (and maybe a refresh token and ID token).
9. The app calls `https://api.example` with `Authorization: Bearer <access_token>`.
10. The API validates the token signature, expiry, issuer, audience and scope.

PKCE stops an attacker who intercepts the redirect with the `code` (for example through a malicious app or browser extension) from exchanging it. Without the secret `code_verifier`, which never traveled in the browser URL, the stolen code is useless.
@@criteria
- Shows the verifier and S256 challenge created before the first redirect, and only the challenge is sent first.
- Names the front-channel redirect to `/authorize` with `client_id`, `redirect_uri`, `scope`, `state` and `code_challenge`.
- Shows the redirect back with `code` and `state`, and checks `state`.
- Shows the back-channel token request carrying `code` and `code_verifier`, and the IdP verifying it against the challenge.
- Shows the access token used as a Bearer token against the API.
- Explains that a stolen code is useless without the verifier.
````
