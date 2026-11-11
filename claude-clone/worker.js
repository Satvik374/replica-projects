/* Alcove — Worker in front of the static app.
   Serves the site from ASSETS and a JSON API from D1: accounts, sessions,
   chats, messages, projects, knowledge, styles, shares, usage and export.
   No third-party services. No secrets. Every row is scoped by the session user. */

const COOKIE = "alcove_session";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days
const ITERATIONS = 60000; // PBKDF2-SHA256, a deliberate CPU-budget choice for a demo
const MAX_BODY = 1_500_000; // bytes of JSON we will read
const MAX_CONTENT = 60_000; // characters of a message
const MAX_DOC = 200_000; // characters of project knowledge / an attachment
const FREE_PROJECTS = 5;
const PLAN_LIMIT = 60; // messages per window
const WINDOW_MS = 5 * 60 * 60 * 1000; // five hours

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
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

const id = () => crypto.randomUUID();

const now = () => Date.now();

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });

const fail = (status, message, field) =>
  json(field ? { error: message, field } : { error: message }, status);

const isEmail = (value) =>
  typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

const normaliseEmail = (value) => (typeof value === "string" ? value.trim().toLowerCase() : "");

const cleanText = (value, max) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const cleanBody = (value, max) =>
  typeof value === "string" ? value.replace(/\r\n/g, "\n").slice(0, max) : "";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const defaultName = (email) => {
  const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  return local ? local.slice(0, 40).replace(/\b\w/g, (c) => c.toUpperCase()) : "You";
};

async function derive(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex), iterations: ITERATIONS, hash: "SHA-256" },
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

async function readJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) return null;
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_BODY) return null;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return null;
    const body = JSON.parse(text);
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- database */

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
           plan TEXT NOT NULL DEFAULT 'free',
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
           font_size TEXT NOT NULL DEFAULT 'md',
           motion TEXT NOT NULL DEFAULT 'auto',
           suggestions INTEGER NOT NULL DEFAULT 1,
           model TEXT NOT NULL DEFAULT 'sonnet',
           style_id TEXT NOT NULL DEFAULT 'normal',
           thinking INTEGER NOT NULL DEFAULT 0,
           instructions TEXT NOT NULL DEFAULT '',
           updated_at INTEGER NOT NULL
         )`
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS projects (
           id TEXT PRIMARY KEY,
           user_id TEXT NOT NULL,
           name TEXT NOT NULL,
           description TEXT NOT NULL DEFAULT '',
           instructions TEXT NOT NULL DEFAULT '',
           starred INTEGER NOT NULL DEFAULT 0,
           archived INTEGER NOT NULL DEFAULT 0,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL
         )`
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS project_docs (
           id TEXT PRIMARY KEY,
           project_id TEXT NOT NULL,
           user_id TEXT NOT NULL,
           name TEXT NOT NULL,
           content TEXT NOT NULL,
           size INTEGER NOT NULL,
           created_at INTEGER NOT NULL
         )`
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS chats (
           id TEXT PRIMARY KEY,
           user_id TEXT NOT NULL,
           project_id TEXT,
           title TEXT NOT NULL,
           model TEXT NOT NULL DEFAULT 'sonnet',
           style_id TEXT NOT NULL DEFAULT 'normal',
           thinking INTEGER NOT NULL DEFAULT 0,
           starred INTEGER NOT NULL DEFAULT 0,
           share_token TEXT,
           shared_at INTEGER,
           shared_seq INTEGER,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL
         )`
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS messages (
           id TEXT PRIMARY KEY,
           chat_id TEXT NOT NULL,
           user_id TEXT NOT NULL,
           role TEXT NOT NULL,
           content TEXT NOT NULL,
           thinking TEXT,
           artifacts TEXT,
           attachments TEXT,
           feedback TEXT,
           seq INTEGER NOT NULL,
           created_at INTEGER NOT NULL
         )`
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS styles (
           id TEXT PRIMARY KEY,
           user_id TEXT NOT NULL,
           name TEXT NOT NULL,
           description TEXT NOT NULL DEFAULT '',
           instructions TEXT NOT NULL DEFAULT '',
           created_at INTEGER NOT NULL
         )`
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS usage (
           user_id TEXT NOT NULL,
           window_start INTEGER NOT NULL,
           messages_used INTEGER NOT NULL DEFAULT 0,
           PRIMARY KEY (user_id, window_start)
         )`
      ),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id, updated_at)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS docs_project ON project_docs(project_id)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS chats_user ON chats(user_id, updated_at)"),
      env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS chats_share ON chats(share_token)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, seq)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS styles_user ON styles(user_id)")
    ]).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

/* ------------------------------------------------------------- serialising */

const publicUser = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  plan: row.plan || "free",
  createdAt: row.created_at
});

const chatRow = (row) => ({
  id: row.id,
  projectId: row.project_id || null,
  title: row.title,
  model: row.model,
  styleId: row.style_id,
  thinking: Boolean(row.thinking),
  starred: Boolean(row.starred),
  shared: Boolean(row.share_token),
  shareToken: row.share_token || null,
  sharedAt: row.shared_at || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  preview: row.preview || ""
});

const messageRow = (row) => ({
  id: row.id,
  role: row.role,
  content: row.content,
  thinking: row.thinking || "",
  artifacts: safeParse(row.artifacts, []),
  attachments: safeParse(row.attachments, []),
  feedback: row.feedback || null,
  seq: row.seq,
  createdAt: row.created_at
});

const projectRow = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  instructions: row.instructions,
  starred: Boolean(row.starred),
  archived: Boolean(row.archived),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  chatCount: row.chat_count || 0,
  docCount: row.doc_count || 0
});

const styleRow = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  instructions: row.instructions,
  createdAt: row.created_at
});

function safeParse(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

const CLIENT_IDS = /^[a-zA-Z0-9-]{8,64}$/;

function cleanArtifacts(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).map((artifact) => {
    const versions = Array.isArray(artifact && artifact.versions) ? artifact.versions : [];
    return {
      id: CLIENT_IDS.test(String(artifact && artifact.id)) ? artifact.id : id(),
      title: cleanText(artifact && artifact.title, 120) || "Untitled",
      kind: ["html", "markdown", "svg"].includes(artifact && artifact.kind) ? artifact.kind : "markdown",
      language: cleanText(artifact && artifact.language, 24) || "text",
      code: cleanBody(artifact && artifact.code, MAX_CONTENT),
      versions: versions.slice(0, 12).map((version) => ({
        code: cleanBody(version && version.code, MAX_CONTENT),
        at: Number(version && version.at) || now()
      }))
    };
  });
}

function cleanAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map((file) => ({
    name: cleanText(file && file.name, 120) || "attachment",
    size: clamp(Number(file && file.size) || 0, 0, 50_000_000),
    kind: cleanText(file && file.kind, 24) || "text",
    text: cleanBody(file && file.text, MAX_DOC)
  }));
}

/* -------------------------------------------------------------- throttling */

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
    `SELECT u.id, u.email, u.name, u.plan, u.created_at, s.expires_at
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

/* ------------------------------------------------------------------ prefs */

const THEMES = ["system", "light", "dark"];
const SIZES = ["sm", "md", "lg"];
const MOTIONS = ["auto", "reduce"];
const MODELS = ["opus", "sonnet", "haiku"];
const DEFAULT_PREFS = {
  theme: "system",
  fontSize: "md",
  motion: "auto",
  suggestions: true,
  model: "sonnet",
  styleId: "normal",
  thinking: false,
  instructions: ""
};

async function readPrefs(env, userId) {
  const row = await env.DB.prepare("SELECT * FROM prefs WHERE user_id = ?").bind(userId).first();
  if (!row) return { ...DEFAULT_PREFS };
  return {
    theme: THEMES.includes(row.theme) ? row.theme : DEFAULT_PREFS.theme,
    fontSize: SIZES.includes(row.font_size) ? row.font_size : DEFAULT_PREFS.fontSize,
    motion: MOTIONS.includes(row.motion) ? row.motion : DEFAULT_PREFS.motion,
    suggestions: row.suggestions === 1,
    model: MODELS.includes(row.model) ? row.model : DEFAULT_PREFS.model,
    styleId: row.style_id || DEFAULT_PREFS.styleId,
    thinking: row.thinking === 1,
    instructions: row.instructions || ""
  };
}

/* ------------------------------------------------------------------ usage */

async function readUsage(env, userId) {
  const stamp = now();
  const row = await env.DB.prepare(
    "SELECT window_start, messages_used FROM usage WHERE user_id = ? ORDER BY window_start DESC LIMIT 1"
  )
    .bind(userId)
    .first();

  if (!row || stamp - row.window_start > WINDOW_MS) {
    return {
      used: 0,
      limit: PLAN_LIMIT,
      remaining: PLAN_LIMIT,
      windowStart: stamp,
      resetsAt: stamp + WINDOW_MS,
      blocked: false
    };
  }
  const used = row.messages_used;
  return {
    used,
    limit: PLAN_LIMIT,
    remaining: Math.max(0, PLAN_LIMIT - used),
    windowStart: row.window_start,
    resetsAt: row.window_start + WINDOW_MS,
    blocked: used >= PLAN_LIMIT
  };
}

async function noteUsage(env, userId, windowStart) {
  await env.DB.prepare(
    `INSERT INTO usage (user_id, window_start, messages_used) VALUES (?, ?, 1)
     ON CONFLICT(user_id, window_start) DO UPDATE SET messages_used = messages_used + 1`
  )
    .bind(userId, windowStart)
    .run();
  return readUsage(env, userId);
}

/* ----------------------------------------------------------------- access */

async function ownChat(env, userId, chatId) {
  return env.DB.prepare("SELECT * FROM chats WHERE id = ? AND user_id = ?")
    .bind(chatId, userId)
    .first();
}

async function ownProject(env, userId, projectId) {
  return env.DB.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?")
    .bind(projectId, userId)
    .first();
}

/* ------------------------------------------------------------------ routes */

async function api(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (!path.startsWith("/api/")) return null;

  if (method === "GET" && path === "/api/health") {
    return json({ ok: true, db: Boolean(env.DB), time: new Date().toISOString() });
  }

  if (!env.DB) return fail(503, "This workspace is unavailable right now.");

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
    return fail(503, "This workspace is unavailable right now.");
  }

  const secure = url.protocol === "https:";

  try {
    /* ------------------------------------------------------------- public */

    const shareMatch = path.match(/^\/api\/share\/([a-f0-9]{24,64})$/);
    if (method === "GET" && shareMatch) {
      return await readShare(env, shareMatch[1]);
    }

    /* --------------------------------------------------------------- auth */

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
        id: id(),
        email,
        name: cleanText(body.name, 40) || defaultName(email),
        plan: "free",
        createdAt: now()
      };

      await env.DB.prepare(
        "INSERT INTO users (id, email, name, salt, hash, plan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
        .bind(user.id, user.email, user.name, salt, hash, "free", user.createdAt)
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

    /* ------------------------------------------------------------ session */

    const session = await currentSession(request, env);
    if (!session) return fail(401, "Sign in to continue.");
    const userId = session.user.id;

    if (method === "POST" && path === "/api/auth/logout-all") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
        env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(session.tokenHash)
      ]);
      return json({ ok: true }, 200, { "set-cookie": clearCookie(secure) });
    }

    /* ----------------------------------------------------------- settings */

    if (method === "GET" && path === "/api/settings") {
      return json({ settings: await readPrefs(env, userId) });
    }

    if (method === "PUT" && path === "/api/settings") {
      const body = await readJson(request);
      if (!body) return fail(400, "Send a JSON body.");
      const current = await readPrefs(env, userId);
      const next = {
        theme: THEMES.includes(body.theme) ? body.theme : current.theme,
        fontSize: SIZES.includes(body.fontSize) ? body.fontSize : current.fontSize,
        motion: MOTIONS.includes(body.motion) ? body.motion : current.motion,
        suggestions: typeof body.suggestions === "boolean" ? body.suggestions : current.suggestions,
        model: MODELS.includes(body.model) ? body.model : current.model,
        styleId: cleanText(body.styleId, 64) || current.styleId,
        thinking: typeof body.thinking === "boolean" ? body.thinking : current.thinking,
        instructions: typeof body.instructions === "string" ? body.instructions.slice(0, 4000) : current.instructions
      };
      await env.DB.prepare(
        `INSERT INTO prefs (user_id, theme, font_size, motion, suggestions, model, style_id, thinking, instructions, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           theme = excluded.theme,
           font_size = excluded.font_size,
           motion = excluded.motion,
           suggestions = excluded.suggestions,
           model = excluded.model,
           style_id = excluded.style_id,
           thinking = excluded.thinking,
           instructions = excluded.instructions,
           updated_at = excluded.updated_at`
      )
        .bind(
          userId,
          next.theme,
          next.fontSize,
          next.motion,
          next.suggestions ? 1 : 0,
          next.model,
          next.styleId,
          next.thinking ? 1 : 0,
          next.instructions,
          now()
        )
        .run();
      return json({ settings: next });
    }

    /* ------------------------------------------------------------ account */

    if (method === "PATCH" && path === "/api/account") {
      const body = await readJson(request);
      if (!body) return fail(400, "Send a JSON body.");
      const name = cleanText(body.name, 40);
      if (!name) return fail(400, "Enter a display name.", "name");
      await env.DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind(name, userId).run();
      return json({ user: { ...session.user, name } });
    }

    if (method === "PATCH" && path === "/api/account/password") {
      const body = await readJson(request);
      if (!body) return fail(400, "Send a JSON body.");
      const current = typeof body.current === "string" ? body.current : "";
      const next = typeof body.next === "string" ? body.next : "";
      if (next.length < 8) return fail(400, "Use at least 8 characters.", "next");
      const row = await env.DB.prepare("SELECT salt, hash FROM users WHERE id = ?").bind(userId).first();
      const hash = await derive(current, row.salt);
      if (!sameDigest(hash, row.hash)) {
        return fail(400, "That is not your current password.", "current");
      }
      const salt = randomHex(16);
      const fresh = await derive(next, salt);
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET salt = ?, hash = ? WHERE id = ?").bind(salt, fresh, userId),
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?")
          .bind(userId, session.tokenHash)
      ]);
      return json({ ok: true });
    }

    if (method === "DELETE" && path === "/api/account") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
        env.DB.prepare("DELETE FROM prefs WHERE user_id = ?").bind(userId),
        env.DB.prepare("DELETE FROM messages WHERE user_id = ?").bind(userId),
        env.DB.prepare("DELETE FROM chats WHERE user_id = ?").bind(userId),
        env.DB.prepare("DELETE FROM project_docs WHERE user_id = ?").bind(userId),
        env.DB.prepare("DELETE FROM projects WHERE user_id = ?").bind(userId),
        env.DB.prepare("DELETE FROM styles WHERE user_id = ?").bind(userId),
        env.DB.prepare("DELETE FROM usage WHERE user_id = ?").bind(userId),
        env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId)
      ]);
      return json({ ok: true }, 200, { "set-cookie": clearCookie(secure) });
    }

    /* ----------------------------------------------------------- overview */

    if (method === "GET" && path === "/api/overview") {
      const [chats, projects, usage, styles] = await Promise.all([
        env.DB.prepare(
          `SELECT c.*, (
             SELECT substr(m.content, 1, 140) FROM messages m
              WHERE m.chat_id = c.id AND m.role = 'user' AND m.seq = 1 LIMIT 1
           ) AS preview
             FROM chats c
            WHERE c.user_id = ?
            ORDER BY c.updated_at DESC
            LIMIT 200`
        )
          .bind(userId)
          .all(),
        env.DB.prepare(
          `SELECT p.*, 
             (SELECT COUNT(*) FROM chats c WHERE c.project_id = p.id) AS chat_count,
             (SELECT COUNT(*) FROM project_docs d WHERE d.project_id = p.id) AS doc_count
             FROM projects p
            WHERE p.user_id = ?
            ORDER BY p.updated_at DESC`
        )
          .bind(userId)
          .all(),
        readUsage(env, userId),
        env.DB.prepare("SELECT * FROM styles WHERE user_id = ? ORDER BY created_at ASC")
          .bind(userId)
          .all()
      ]);

      return json({
        chats: (chats.results || []).map(chatRow),
        projects: (projects.results || []).map(projectRow),
        usage,
        styles: (styles.results || []).map(styleRow)
      });
    }

    /* -------------------------------------------------------------- chats */

    if (method === "GET" && path === "/api/chats") {
      const q = cleanText(url.searchParams.get("q"), 120);
      const project = url.searchParams.get("project");
      const starred = url.searchParams.get("starred") === "1";
      let sql = `SELECT c.* FROM chats c WHERE c.user_id = ?`;
      const binds = [userId];
      if (starred) sql += " AND c.starred = 1";
      if (project) {
        sql += " AND c.project_id = ?";
        binds.push(project);
      }
      if (q) {
        sql += " AND (c.title LIKE ? OR EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = c.id AND m.content LIKE ?))";
        binds.push(`%${q}%`, `%${q}%`);
      }
      sql += " ORDER BY c.updated_at DESC LIMIT 100";
      const rows = await env.DB.prepare(sql).bind(...binds).all();
      return json({ chats: (rows.results || []).map(chatRow) });
    }

    if (method === "POST" && path === "/api/chats") {
      const body = await readJson(request);
      if (!body) return fail(400, "Send a JSON body.");
      const stamp = now();
      let projectId = null;
      if (body.projectId) {
        const project = await ownProject(env, userId, body.projectId);
        if (!project) return fail(404, "That project is not yours.");
        projectId = project.id;
      }
      const row = {
        id: id(),
        user_id: userId,
        project_id: projectId,
        title: cleanText(body.title, 120) || "New chat",
        model: MODELS.includes(body.model) ? body.model : "sonnet",
        style_id: cleanText(body.styleId, 64) || "normal",
        thinking: body.thinking ? 1 : 0,
        starred: 0,
        created_at: stamp,
        updated_at: stamp
      };
      await env.DB.prepare(
        `INSERT INTO chats (id, user_id, project_id, title, model, style_id, thinking, starred, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      )
        .bind(row.id, row.user_id, row.project_id, row.title, row.model, row.style_id, row.thinking, stamp, stamp)
        .run();
      return json({ chat: chatRow(row) }, 201);
    }

    const chatMatch = path.match(/^\/api\/chats\/([a-zA-Z0-9-]{8,64})(\/[a-z-]+)?$/);
    if (chatMatch) {
      const chatId = chatMatch[1];
      const action = chatMatch[2] || "";
      const chat = await ownChat(env, userId, chatId);
      if (!chat) return fail(404, "That chat is gone.");

      if (method === "GET" && !action) {
        const rows = await env.DB.prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY seq ASC")
          .bind(chatId)
          .all();
        const project = chat.project_id ? await ownProject(env, userId, chat.project_id) : null;
        return json({
          chat: chatRow(chat),
          messages: (rows.results || []).map(messageRow),
          project: project ? projectRow(project) : null
        });
      }

      if (method === "PATCH" && !action) {
        const body = await readJson(request);
        if (!body) return fail(400, "Send a JSON body.");
        const patch = {
          title: body.title !== undefined ? cleanText(body.title, 120) || "Untitled chat" : chat.title,
          starred: body.starred !== undefined ? (body.starred ? 1 : 0) : chat.starred,
          model: MODELS.includes(body.model) ? body.model : chat.model,
          style_id: body.styleId !== undefined ? cleanText(body.styleId, 64) || "normal" : chat.style_id,
          thinking: body.thinking !== undefined ? (body.thinking ? 1 : 0) : chat.thinking,
          project_id: chat.project_id,
          updated_at: now()
        };
        if (body.projectId !== undefined) {
          if (body.projectId === null) patch.project_id = null;
          else {
            const project = await ownProject(env, userId, body.projectId);
            if (!project) return fail(404, "That project is not yours.");
            patch.project_id = project.id;
          }
        }
        await env.DB.prepare(
          `UPDATE chats SET title = ?, starred = ?, model = ?, style_id = ?, thinking = ?, project_id = ?, updated_at = ?
            WHERE id = ? AND user_id = ?`
        )
          .bind(
            patch.title,
            patch.starred,
            patch.model,
            patch.style_id,
            patch.thinking,
            patch.project_id,
            patch.updated_at,
            chatId,
            userId
          )
          .run();
        const fresh = await ownChat(env, userId, chatId);
        return json({ chat: chatRow(fresh) });
      }

      if (method === "DELETE" && !action) {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM messages WHERE chat_id = ? AND user_id = ?").bind(chatId, userId),
          env.DB.prepare("DELETE FROM chats WHERE id = ? AND user_id = ?").bind(chatId, userId)
        ]);
        return json({ ok: true });
      }

      if (method === "POST" && action === "/share") {
        const max = await env.DB.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM messages WHERE chat_id = ?")
          .bind(chatId)
          .first();
        const token = chat.share_token || randomHex(16);
        const stamp = now();
        await env.DB.prepare("UPDATE chats SET share_token = ?, shared_at = ?, shared_seq = ? WHERE id = ?")
          .bind(token, stamp, max.seq || 0, chatId)
          .run();
        return json({ token, sharedAt: stamp, sharedSeq: max.seq || 0 });
      }

      if (method === "DELETE" && action === "/share") {
        await env.DB.prepare("UPDATE chats SET share_token = NULL, shared_at = NULL, shared_seq = NULL WHERE id = ?")
          .bind(chatId)
          .run();
        return json({ ok: true });
      }

      if (method === "POST" && action === "/truncate") {
        const body = await readJson(request);
        const seq = Number(body && body.seq);
        if (!Number.isFinite(seq) || seq < 1) return fail(400, "Send the message sequence to keep.");
        await env.DB.prepare("DELETE FROM messages WHERE chat_id = ? AND user_id = ? AND seq > ?")
          .bind(chatId, userId, seq)
          .run();
        await env.DB.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").bind(now(), chatId).run();
        return json({ ok: true });
      }

      if (method === "POST" && action === "/messages") {
        const body = await readJson(request);
        if (!body) return fail(400, "Send a JSON body.");
        const role = body.role === "assistant" ? "assistant" : "user";
        const content = cleanBody(body.content, MAX_CONTENT).trim();
        if (!content && role === "user") return fail(400, "Write something first.", "content");
        if (role === "assistant" && !content) return fail(400, "Empty reply.");

        if (role === "user") {
          const usage = await readUsage(env, userId);
          if (usage.blocked) {
            return json(
              {
                error: "You have used this window's messages. It resets soon.",
                usage
              },
              429
            );
          }
        }

        const last = await env.DB.prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM messages WHERE chat_id = ?")
          .bind(chatId)
          .first();
        const seq = (last.seq || 0) + 1;
        const message = {
          id: id(),
          chat_id: chatId,
          user_id: userId,
          role,
          content,
          thinking: cleanBody(body.thinking, MAX_CONTENT),
          artifacts: JSON.stringify(cleanArtifacts(body.artifacts)),
          attachments: JSON.stringify(cleanAttachments(body.attachments)),
          feedback: null,
          seq,
          created_at: now()
        };
        await env.DB.prepare(
          `INSERT INTO messages (id, chat_id, user_id, role, content, thinking, artifacts, attachments, feedback, seq, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
        )
          .bind(
            message.id,
            message.chat_id,
            message.user_id,
            message.role,
            message.content,
            message.thinking,
            message.artifacts,
            message.attachments,
            message.seq,
            message.created_at
          )
          .run();

        // First user message titles the chat, the way the reference does.
        const patch = { updated_at: now() };
        let title = chat.title;
        if (chat.title === "New chat" && role === "user") {
          title = content.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
          patch.title = title;
        }
        await env.DB.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").bind(now(), chatId).run();
        if (patch.title) {
          await env.DB.prepare("UPDATE chats SET title = ? WHERE id = ?").bind(patch.title, chatId).run();
        }

        let usage = null;
        if (role === "user") {
          const current = await readUsage(env, userId);
          usage = await noteUsage(env, userId, current.windowStart);
        }

        const fresh = await env.DB.prepare("SELECT * FROM messages WHERE id = ?").bind(message.id).first();
        return json({ message: messageRow(fresh), chat: chatRow({ ...chat, title }), usage }, 201);
      }

      return fail(404, "No such endpoint.");
    }

    /* ----------------------------------------------------------- messages */

    const messageMatch = path.match(/^\/api\/messages\/([a-zA-Z0-9-]{8,64})$/);
    if (messageMatch && method === "PATCH") {
      const body = await readJson(request);
      if (!body) return fail(400, "Send a JSON body.");
      const feedback = ["up", "down", null].includes(body.feedback) ? body.feedback : null;
      const row = await env.DB.prepare("SELECT * FROM messages WHERE id = ? AND user_id = ?")
        .bind(messageMatch[1], userId)
        .first();
      if (!row) return fail(404, "That message is gone.");
      await env.DB.prepare("UPDATE messages SET feedback = ? WHERE id = ? AND user_id = ?")
        .bind(feedback, messageMatch[1], userId)
        .run();
      return json({ message: messageRow({ ...row, feedback }) });
    }

    /* ----------------------------------------------------------- projects */

    if (method === "GET" && path === "/api/projects") {
      const rows = await env.DB.prepare(
        `SELECT p.*, 
           (SELECT COUNT(*) FROM chats c WHERE c.project_id = p.id) AS chat_count,
           (SELECT COUNT(*) FROM project_docs d WHERE d.project_id = p.id) AS doc_count
           FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC`
      )
        .bind(userId)
        .all();
      return json({ projects: (rows.results || []).map(projectRow) });
    }

    if (method === "POST" && path === "/api/projects") {
      const body = await readJson(request);
      if (!body) return fail(400, "Send a JSON body.");
      const name = cleanText(body.name, 80);
      if (!name) return fail(400, "Give the project a name.", "name");

      const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM projects WHERE user_id = ? AND archived = 0")
        .bind(userId)
        .first();
      if (session.user.plan === "free" && (count.n || 0) >= FREE_PROJECTS) {
        return fail(403, `The ${"Free"} plan holds ${FREE_PROJECTS} projects. Archive one or upgrade.`);
      }

      const stamp = now();
      const project = {
        id: id(),
        user_id: userId,
        name,
        description: cleanText(body.description, 400),
        instructions: "",
        starred: 0,
        archived: 0,
        created_at: stamp,
        updated_at: stamp
      };
      await env.DB.prepare(
        `INSERT INTO projects (id, user_id, name, description, instructions, starred, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, '', 0, 0, ?, ?)`
      )
        .bind(project.id, userId, project.name, project.description, stamp, stamp)
        .run();
      return json({ project: projectRow({ ...project, chat_count: 0, doc_count: 0 }) }, 201);
    }

    const projectMatch = path.match(/^\/api\/projects\/([a-zA-Z0-9-]{8,64})(\/[a-z]+(?:\/[a-zA-Z0-9-]+)?)?$/);
    if (projectMatch) {
      const projectId = projectMatch[1];
      const action = projectMatch[2] || "";
      const project = await ownProject(env, userId, projectId);
      if (!project) return fail(404, "That project is gone.");

      const docIdMatch = action.match(/^\/docs\/([a-zA-Z0-9-]{8,64})$/);
      if (docIdMatch && method === "DELETE") {
        await env.DB.prepare("DELETE FROM project_docs WHERE id = ? AND project_id = ? AND user_id = ?")
          .bind(docIdMatch[1], projectId, userId)
          .run();
        return json({ ok: true });
      }

      if (method === "GET" && !action) {
        const [docs, chats] = await Promise.all([
          env.DB.prepare("SELECT id, name, size, created_at FROM project_docs WHERE project_id = ? ORDER BY created_at ASC")
            .bind(projectId)
            .all(),
          env.DB.prepare("SELECT * FROM chats WHERE project_id = ? AND user_id = ? ORDER BY updated_at DESC")
            .bind(projectId, userId)
            .all()
        ]);
        return json({
          project: projectRow(project),
          docs: (docs.results || []).map((doc) => ({
            id: doc.id,
            name: doc.name,
            size: doc.size,
            createdAt: doc.created_at
          })),
          chats: (chats.results || []).map(chatRow)
        });
      }

      if (method === "PATCH" && !action) {
        const body = await readJson(request);
        if (!body) return fail(400, "Send a JSON body.");
        const name = body.name !== undefined ? cleanText(body.name, 80) : project.name;
        if (!name) return fail(400, "Give the project a name.", "name");
        const next = {
          name,
          description: body.description !== undefined ? cleanText(body.description, 400) : project.description,
          instructions: body.instructions !== undefined ? body.instructions.slice(0, 4000) : project.instructions,
          starred: body.starred !== undefined ? (body.starred ? 1 : 0) : project.starred,
          archived: body.archived !== undefined ? (body.archived ? 1 : 0) : project.archived,
          updated_at: now()
        };
        await env.DB.prepare(
          `UPDATE projects SET name = ?, description = ?, instructions = ?, starred = ?, archived = ?, updated_at = ?
            WHERE id = ? AND user_id = ?`
        )
          .bind(next.name, next.description, next.instructions, next.starred, next.archived, next.updated_at, projectId, userId)
          .run();
        const fresh = await ownProject(env, userId, projectId);
        return json({ project: projectRow(fresh) });
      }

      if (method === "DELETE" && !action) {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM project_docs WHERE project_id = ? AND user_id = ?").bind(projectId, userId),
          env.DB.prepare("UPDATE chats SET project_id = NULL WHERE project_id = ? AND user_id = ?").bind(projectId, userId),
          env.DB.prepare("DELETE FROM projects WHERE id = ? AND user_id = ?").bind(projectId, userId)
        ]);
        return json({ ok: true });
      }

      if (method === "POST" && action === "/docs") {
        const body = await readJson(request);
        if (!body) return fail(400, "Send a JSON body.");
        const name = cleanText(body.name, 120);
        const content = cleanBody(body.content, MAX_DOC);
        if (!name) return fail(400, "Name the file.", "name");
        if (!content.trim()) return fail(400, "That file is empty.", "content");
        const doc = {
          id: id(),
          project_id: projectId,
          user_id: userId,
          name,
          content,
          size: enc.encode(content).length,
          created_at: now()
        };
        await env.DB.prepare(
          `INSERT INTO project_docs (id, project_id, user_id, name, content, size, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(doc.id, doc.project_id, doc.user_id, doc.name, doc.content, doc.size, doc.created_at)
          .run();
        await env.DB.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").bind(now(), projectId).run();
        return json(
          { doc: { id: doc.id, name: doc.name, size: doc.size, createdAt: doc.created_at } },
          201
        );
      }

      if (method === "GET" && action === "/docs") {
        const rows = await env.DB.prepare(
          "SELECT id, name, size, content, created_at FROM project_docs WHERE project_id = ? AND user_id = ? ORDER BY created_at ASC"
        )
          .bind(projectId, userId)
          .all();
        return json({ docs: rows.results || [] });
      }

      return fail(404, "No such endpoint.");
    }

    /* ------------------------------------------------------------- styles */

    if (method === "GET" && path === "/api/styles") {
      const rows = await env.DB.prepare("SELECT * FROM styles WHERE user_id = ? ORDER BY created_at ASC")
        .bind(userId)
        .all();
      return json({ styles: (rows.results || []).map(styleRow) });
    }

    if (method === "POST" && path === "/api/styles") {
      const body = await readJson(request);
      if (!body) return fail(400, "Send a JSON body.");
      const name = cleanText(body.name, 40);
      const instructions = cleanBody(body.instructions, 2000);
      if (!name) return fail(400, "Name the style.", "name");
      if (instructions.trim().length < 10) return fail(400, "Add a sentence or two of instructions.", "instructions");
      const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM styles WHERE user_id = ?").bind(userId).first();
      if ((count.n || 0) >= 20) return fail(403, "That is enough styles for one account.");
      const style = {
        id: id(),
        user_id: userId,
        name,
        description: cleanText(body.description, 120),
        instructions,
        created_at: now()
      };
      await env.DB.prepare(
        "INSERT INTO styles (id, user_id, name, description, instructions, created_at) VALUES (?, ?, ?, ?, ?, ?)"
      )
        .bind(style.id, userId, style.name, style.description, style.instructions, style.created_at)
        .run();
      return json({ style: styleRow(style) }, 201);
    }

    const styleMatch = path.match(/^\/api\/styles\/([a-zA-Z0-9-]{8,64})$/);
    if (styleMatch) {
      const row = await env.DB.prepare("SELECT * FROM styles WHERE id = ? AND user_id = ?")
        .bind(styleMatch[1], userId)
        .first();
      if (!row) return fail(404, "That style is gone.");

      if (method === "PATCH") {
        const body = await readJson(request);
        if (!body) return fail(400, "Send a JSON body.");
        const next = {
          name: body.name !== undefined ? cleanText(body.name, 40) : row.name,
          description: body.description !== undefined ? cleanText(body.description, 120) : row.description,
          instructions: body.instructions !== undefined ? cleanBody(body.instructions, 2000) : row.instructions
        };
        if (!next.name) return fail(400, "Name the style.", "name");
        await env.DB.prepare("UPDATE styles SET name = ?, description = ?, instructions = ? WHERE id = ? AND user_id = ?")
          .bind(next.name, next.description, next.instructions, row.id, userId)
          .run();
        return json({ style: styleRow({ ...row, ...next }) });
      }

      if (method === "DELETE") {
        await env.DB.prepare("DELETE FROM styles WHERE id = ? AND user_id = ?").bind(row.id, userId).run();
        return json({ ok: true });
      }
    }

    /* ------------------------------------------------------------- export */

    if (method === "GET" && path === "/api/export") {
      const [chats, messages, projects, docs, styles, prefs] = await Promise.all([
        env.DB.prepare("SELECT * FROM chats WHERE user_id = ?").bind(userId).all(),
        env.DB.prepare("SELECT * FROM messages WHERE user_id = ?").bind(userId).all(),
        env.DB.prepare("SELECT * FROM projects WHERE user_id = ?").bind(userId).all(),
        env.DB.prepare("SELECT * FROM project_docs WHERE user_id = ?").bind(userId).all(),
        env.DB.prepare("SELECT * FROM styles WHERE user_id = ?").bind(userId).all(),
        readPrefs(env, userId)
      ]);
      const payload = {
        exportedAt: new Date().toISOString(),
        account: session.user,
        settings: prefs,
        chats: (chats.results || []).map((chat) => ({
          ...chatRow(chat),
          messages: (messages.results || [])
            .filter((message) => message.chat_id === chat.id)
            .map(messageRow)
        })),
        projects: (projects.results || []).map((project) => ({
          ...projectRow(project),
          knowledge: (docs.results || [])
            .filter((doc) => doc.project_id === project.id)
            .map((doc) => ({ name: doc.name, size: doc.size, content: doc.content, createdAt: doc.created_at }))
        })),
        styles: (styles.results || []).map(styleRow)
      };
      return new Response(JSON.stringify(payload, null, 2), {
        headers: {
          ...JSON_HEADERS,
          "content-disposition": `attachment; filename="alcove-export-${new Date().toISOString().slice(0, 10)}.json"`
        }
      });
    }

    return fail(404, "No such endpoint.");
  } catch (error) {
    console.error("api", path, error);
    return fail(500, "Something went wrong on our side.");
  }
}

async function readShare(env, token) {
  const chat = await env.DB.prepare("SELECT * FROM chats WHERE share_token = ?").bind(token).first();
  if (!chat || !chat.shared_at) return fail(404, "This link is not available.");
  const rows = await env.DB.prepare(
    "SELECT role, content, thinking, artifacts, seq, created_at FROM messages WHERE chat_id = ? AND seq <= ? ORDER BY seq ASC"
  )
    .bind(chat.id, chat.shared_seq || 0)
    .all();

  return json(
    {
      chat: {
        title: chat.title,
        model: chat.model,
        sharedAt: chat.shared_at,
        createdAt: chat.created_at
      },
      messages: (rows.results || []).map((row) => ({
        role: row.role,
        content: row.content,
        thinking: row.thinking || "",
        artifacts: safeParse(row.artifacts, []),
        // Attachments stay private and are never part of a public snapshot.
        attachments: [],
        seq: row.seq,
        createdAt: row.created_at
      }))
    },
    200,
    {
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow"
    }
  );
}

/* ---------------------------------------------------------------- worker */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const handled = await api(request, env, url);
      if (handled) return handled;
      return fail(404, "No such endpoint.");
    }

    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    headers.set("x-content-type-options", "nosniff");
    headers.set("referrer-policy", "same-origin");
    // Keep the app uncached so a new deploy is visible immediately.
    headers.set("cache-control", "no-store");
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
  }
};
