/* Marlowe — Worker in front of the static app.
   Serves the site from ASSETS and a small account API from D1:
   email + password accounts, cookie sessions, per-user settings.
   No third-party services, no secrets. */

const COOKIE = "marlowe_session";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const ITERATIONS = 60000; // PBKDF2-SHA256; see README "Passwords"
const THEMES = ["system", "light", "dark"];
const MOTIONS = ["auto", "reduce"];

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

/* ------------------------------------------------------------------ utils */

const enc = new TextEncoder();

const toHex = (buffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

const fromHex = (hex) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

const sha256Hex = async (text) => toHex(await crypto.subtle.digest("SHA-256", enc.encode(text)));

const randomHex = (bytes) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));

async function derive(password, saltHex, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex), iterations, hash: "SHA-256" },
    key,
    256
  );
  return toHex(bits);
}

/* Length-independent comparison of two hex digests. */
function sameDigest(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });

const fail = (status, message, field) => json(field ? { error: message, field } : { error: message }, status);

const now = () => Date.now();

const isEmail = (value) =>
  typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

const cleanText = (value, max) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const normaliseEmail = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

const defaultName = (email) => {
  const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  return local ? local.slice(0, 40).replace(/\b\w/g, (c) => c.toUpperCase()) : "You";
};

/* --------------------------------------------------------------- database */

let schemaPromise = null;

function ensureSchema(env) {
  if (!env.DB) return Promise.reject(new Error("The DB binding is missing"));
  if (!schemaPromise) {
    schemaPromise = env.DB.batch([
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS users (
           id TEXT PRIMARY KEY,
           email TEXT NOT NULL UNIQUE,
           name TEXT NOT NULL,
           salt TEXT NOT NULL,
           hash TEXT NOT NULL,
           created_at INTEGER NOT NULL
         )`
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS sessions (
           token_hash TEXT PRIMARY KEY,
           user_id TEXT NOT NULL,
           created_at INTEGER NOT NULL,
           expires_at INTEGER NOT NULL
         )`
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS prefs (
           user_id TEXT PRIMARY KEY,
           theme TEXT NOT NULL DEFAULT 'system',
           motion TEXT NOT NULL DEFAULT 'auto',
           suggestions INTEGER NOT NULL DEFAULT 1,
           updated_at INTEGER NOT NULL
         )`
      ),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)")
    ]).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

const publicUser = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  createdAt: row.created_at
});

/* ------------------------------------------------------------ brute force */

const attempts = new Map();

function tooManyAttempts(key) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (now() - entry.first > 10 * 60 * 1000) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= 8;
}

function noteAttempt(key, ok) {
  if (ok) {
    attempts.delete(key);
    return;
  }
  const entry = attempts.get(key);
  if (!entry) attempts.set(key, { first: now(), count: 1 });
  else entry.count += 1;
}

/* ---------------------------------------------------------------- session */

function cookieHeader(token, maxAge, secure) {
  const parts = [`${COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

const clearCookie = (secure) => cookieHeader("", 0, secure);

function readToken(request) {
  const raw = request.headers.get("cookie") || "";
  for (const chunk of raw.split(";")) {
    const [name, ...rest] = chunk.trim().split("=");
    if (name === COOKIE) return rest.join("=") || null;
  }
  return null;
}

async function currentSession(request, env) {
  const token = readToken(request);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.created_at, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`
  )
    .bind(tokenHash)
    .first();
  if (!row) return null;
  if (row.expires_at < now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  return { tokenHash, user: publicUser(row) };
}

async function startSession(env, userId) {
  const token = randomHex(32);
  const tokenHash = await sha256Hex(token);
  const created = now();
  await env.DB.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  )
    .bind(tokenHash, userId, created, created + SESSION_TTL * 1000)
    .run();
  return token;
}

/* ---------------------------------------------------------------- prefs */

const DEFAULT_PREFS = { theme: "system", motion: "auto", suggestions: true };

async function readPrefs(env, userId) {
  const row = await env.DB.prepare(
    "SELECT theme, motion, suggestions FROM prefs WHERE user_id = ?"
  )
    .bind(userId)
    .first();
  if (!row) return { ...DEFAULT_PREFS };
  return { theme: row.theme, motion: row.motion, suggestions: row.suggestions === 1 };
}

/* ------------------------------------------------------------------- api */

async function api(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (!path.startsWith("/api/")) return null;

  if (method === "GET" && path === "/api/health") {
    return json({ ok: true, db: Boolean(env.DB), time: new Date().toISOString() });
  }

  if (!env.DB) return fail(503, "Accounts are unavailable right now.");

  // Mutations must come from our own origin. SameSite=Lax covers the rest.
  if (method !== "GET" && method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return fail(403, "Cross-origin request refused.");
    const site = request.headers.get("sec-fetch-site");
    if (site && site !== "same-origin") return fail(403, "Cross-origin request refused.");
  }

  try {
    await ensureSchema(env);
  } catch (error) {
    console.error("schema", error);
    return fail(503, "Accounts are unavailable right now.");
  }

  const secure = url.protocol === "https:";

  try {
    if (method === "POST" && path === "/api/auth/signup") {
      const body = await readJson(request);
      if (!body) return fail(400, "Send a JSON body.");

      const email = normaliseEmail(body.email);
      const password = typeof body.password === "string" ? body.password : "";

      if (!isEmail(email)) return fail(400, "That does not look like an email address.", "email");
      if (password.length < 8) return fail(400, "Use at least 8 characters.", "password");
      if (password.length > 200) return fail(400, "That password is too long.", "password");

      const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
      if (existing) return fail(409, "An account with that email already exists.", "email");

      const salt = randomHex(16);
      const hash = await derive(password, salt);
      const user = {
        id: crypto.randomUUID(),
        email,
        name: cleanText(body.name, 40) || defaultName(email),
        createdAt: now()
      };

      await env.DB.prepare(
        "INSERT INTO users (id, email, name, salt, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
        .bind(user.id, user.email, user.name, salt, hash, user.createdAt)
        .run();

      const token = await startSession(env, user.id);
      return json({ user }, 201, { "set-cookie": cookieHeader(token, SESSION_TTL, secure) });
    }

    if (method === "POST" && path === "/api/auth/login") {
      const body = await readJson(request);
      if (!body) return fail(400, "Send a JSON body.");

      const email = normaliseEmail(body.email);
      const password = typeof body.password === "string" ? body.password : "";
      const throttleKey = `${request.headers.get("cf-connecting-ip") || "local"}:${email}`;

      if (tooManyAttempts(throttleKey)) {
        return fail(429, "Too many attempts. Wait a few minutes and try again.");
      }
      if (!isEmail(email) || !password) {
        noteAttempt(throttleKey, false);
        return fail(401, "That email and password do not match.");
      }

      const row = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
      // Hash even when the account is missing, so timing does not reveal it.
      const hash = await derive(password, row ? row.salt : "00".repeat(16));
      const ok = Boolean(row) && sameDigest(hash, row.hash);
      noteAttempt(throttleKey, ok);

      if (!ok) return fail(401, "That email and password do not match.");
      const token = await startSession(env, row.id);
      return json({ user: publicUser(row) }, 200, {
        "set-cookie": cookieHeader(token, SESSION_TTL, secure)
      });
    }

    if (method === "POST" && path === "/api/auth/logout") {
      const token = readToken(request);
      if (token) {
        await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
          .bind(await sha256Hex(token))
          .run();
      }
      return json({ ok: true }, 200, { "set-cookie": clearCookie(secure) });
    }

    if (method === "GET" && path === "/api/auth/me") {
      const session = await currentSession(request, env);
      return json({ user: session ? session.user : null });
    }

    // Unknown API paths answer 404 before the auth gate, so a typo never looks
    // like a permission problem.
    if (!["/api/settings", "/api/account"].includes(path)) return fail(404, "No such endpoint.");

    const session = await currentSession(request, env);
    if (!session) return fail(401, "Sign in to continue.");

    if (method === "GET" && path === "/api/settings") {
      return json({ settings: await readPrefs(env, session.user.id) });
    }

    if (method === "PUT" && path === "/api/settings") {
      const body = await readJson(request);
      if (!body) return fail(400, "Send a JSON body.");
      const current = await readPrefs(env, session.user.id);
      const next = {
        theme: THEMES.includes(body.theme) ? body.theme : current.theme,
        motion: MOTIONS.includes(body.motion) ? body.motion : current.motion,
        suggestions: typeof body.suggestions === "boolean" ? body.suggestions : current.suggestions
      };
      await env.DB.prepare(
        `INSERT INTO prefs (user_id, theme, motion, suggestions, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           theme = excluded.theme,
           motion = excluded.motion,
           suggestions = excluded.suggestions,
           updated_at = excluded.updated_at`
      )
        .bind(session.user.id, next.theme, next.motion, next.suggestions ? 1 : 0, now())
        .run();
      return json({ settings: next });
    }

    if (method === "PATCH" && path === "/api/account") {
      const body = await readJson(request);
      const name = cleanText(body && body.name, 40);
      if (!name) return fail(400, "Enter a display name.", "name");
      await env.DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind(name, session.user.id).run();
      return json({ user: { ...session.user, name } });
    }

    if (method === "DELETE" && path === "/api/account") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(session.user.id),
        env.DB.prepare("DELETE FROM prefs WHERE user_id = ?").bind(session.user.id),
        env.DB.prepare("DELETE FROM users WHERE id = ?").bind(session.user.id)
      ]);
      return json({ ok: true }, 200, { "set-cookie": clearCookie(secure) });
    }

    return fail(404, "No such endpoint.");
  } catch (error) {
    console.error("api", path, error);
    return fail(500, "Something went wrong on our side.");
  }
}

async function readJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) return null;
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- worker */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const handled = await api(request, env, url);
      if (handled) return handled;
    }

    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "same-origin");
    // The preview proxy caches by path; keep the app itself uncached so a new
    // deploy is visible immediately.
    headers.set("cache-control", "no-store");
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
  }
};
