/* Anvel — the Worker: static assets, a JSON API over D1, and published sites.

   Everything user-owned is scoped by the session's user id. The only outbound
   call is the model request an account opts into with its own provider details;
   those details stay on the server and are never sent back to the browser.
   Generated apps are stored as text and served from /s/:slug. */

const COOKIE = "anvel_session";
const SESSION_TTL = 60 * 60 * 24 * 30;
const ITERATIONS = 60000;
const DAY_TOKENS = 300000;
const MONTH_TOKENS = 1000000;
const MAX_FILES = 60;
const MAX_FILE_BYTES = 200 * 1024;
const AI_TIMEOUT = 120000;
const AI_PROMPT_BYTES = 160 * 1024;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

/* ------------------------------------------------------------------ utils */

const enc = new TextEncoder();
const now = () => Date.now();

const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};
const randomHex = (bytes) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));
const sha256Hex = async (text) => toHex(await crypto.subtle.digest("SHA-256", enc.encode(text)));

async function derive(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex), iterations: ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return toHex(bits);
}

function sameDigest(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
const fail = (status, message, field) => json(field ? { error: message, field } : { error: message }, status);
const ok = (body = {}) => json({ ok: true, ...body });

const parseCookies = (header) => {
  const out = {};
  (header || "").split(";").forEach((pair) => {
    const index = pair.indexOf("=");
    if (index < 0) return;
    out[pair.slice(0, index).trim()] = decodeURIComponent(pair.slice(index + 1).trim());
  });
  return out;
};

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

const isEmail = (value) => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
const isUsername = (value) => typeof value === "string" && /^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$/.test(value);

const displayName = (username) => username.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const dayKey = (ts = Date.now()) => new Date(ts).toISOString().slice(0, 10);
const monthPrefix = (ts = Date.now()) => new Date(ts).toISOString().slice(0, 7);

function slugify(value) {
  return (
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "site"
  );
}

const safePath = (value) => {
  const path = text(value, 200).replace(/^\.?\//, "").replace(/\\/g, "/");
  if (!path || path.includes("..") || path.startsWith("/") || path.length > 160) return "";
  return path;
};

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/* --------------------------------------------------------------- database */

let schemaPromise = null;

function ensureSchema(env) {
  if (!env.DB) return Promise.reject(new Error("The DB binding is missing"));
  if (!schemaPromise) {
    schemaPromise = env.DB.batch([
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS users (
           id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
           name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, plan TEXT NOT NULL DEFAULT 'free',
           created_at INTEGER NOT NULL)`
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS sessions (
           token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL,
           expires_at INTEGER NOT NULL)`
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS projects (
           id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'website',
           summary TEXT NOT NULL DEFAULT '', starred INTEGER NOT NULL DEFAULT 0,
           created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS files (
           project_id TEXT NOT NULL, path TEXT NOT NULL, content TEXT NOT NULL,
           updated_at INTEGER NOT NULL, PRIMARY KEY (project_id, path))`
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS messages (
           id TEXT PRIMARY KEY, project_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
           meta TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL)`
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS versions (
           id TEXT PRIMARY KEY, project_id TEXT NOT NULL, label TEXT NOT NULL, snapshot TEXT NOT NULL,
           bookmarked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS deploys (
           project_id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, visibility TEXT NOT NULL DEFAULT 'public',
           access_key TEXT NOT NULL DEFAULT '', snapshot TEXT NOT NULL, published_at INTEGER NOT NULL)`
      ),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS usage (user_id TEXT NOT NULL, day TEXT NOT NULL, tokens INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day))`),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS settings (
           user_id TEXT PRIMARY KEY, theme TEXT NOT NULL DEFAULT 'dark', show_tokens INTEGER NOT NULL DEFAULT 1,
           default_mode TEXT NOT NULL DEFAULT 'website', updated_at INTEGER NOT NULL)`
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS ai_settings (
           user_id TEXT PRIMARY KEY, base_url TEXT NOT NULL, model TEXT NOT NULL,
           api_key TEXT NOT NULL, updated_at INTEGER NOT NULL)`
      ),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS projects_owner ON projects(user_id, updated_at DESC)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS messages_project ON messages(project_id, created_at)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS versions_project ON versions(project_id, created_at DESC)"),
      env.DB.prepare("CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)")
    ]).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

/* ------------------------------------------------------------------- auth */

const publicUser = (row) => ({ id: row.id, username: row.username, email: row.email, name: row.name, plan: row.plan, createdAt: row.created_at });

async function usageFor(env, userId) {
  const day = dayKey();
  const month = monthPrefix();
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(tokens), 0) AS month_tokens,
            COALESCE(SUM(CASE WHEN day = ?1 THEN tokens ELSE 0 END), 0) AS day_tokens
       FROM usage WHERE user_id = ?2 AND day LIKE ?3`
  )
    .bind(day, userId, month + "%")
    .first();
  const dayTokens = Number(row?.day_tokens || 0);
  const monthTokens = Number(row?.month_tokens || 0);
  return {
    day,
    month,
    dayTokens,
    monthTokens,
    dayLimit: DAY_TOKENS,
    monthLimit: MONTH_TOKENS,
    dayLeft: Math.max(0, DAY_TOKENS - dayTokens),
    monthLeft: Math.max(0, MONTH_TOKENS - monthTokens),
    blocked: dayTokens >= DAY_TOKENS || monthTokens >= MONTH_TOKENS
  };
}

async function settingsFor(env, userId) {
  const row = await env.DB.prepare("SELECT theme, show_tokens, default_mode FROM settings WHERE user_id = ?").bind(userId).first();
  if (!row) return { theme: "dark", showTokens: true, defaultMode: "website" };
  return { theme: row.theme, showTokens: !!row.show_tokens, defaultMode: row.default_mode };
}

/* ---------------------------------------------------------- ai provider

   Accounts may point Anvel at their own OpenAI-compatible endpoint. The key is
   written once and never leaves the server: reads return a masked hint only and
   the browser never sees it. Every call is per-account, so one account can never
   spend another's provider credits. */

const AI_SYSTEM = `You are the build agent inside Anvel, an app that turns a request into a working website or app.
Answer with ONE JSON object and nothing else, in exactly this shape:
{"reply":"one short paragraph for the chat","summary":"under 12 words for the project card","files":[{"path":"index.html","content":"..."}],"steps":[{"text":"what you did","path":"file you touched"}]}

Rules:
- Vanilla HTML, CSS and JavaScript only. No frameworks, no build step, no npm, no imports.
- Every asset lives in the file set: no CDN links, remote fonts, images or network requests. Use inline SVG or CSS for art.
- If you split files, link them relatively (styles.css, app.js) from index.html.
- Work from 360px up, keyboard accessible, real labels, visible focus.
- Working code only: no TODOs, no "coming soon", no lorem ipsum where real copy is possible.
- No secrets, analytics, cookies, tracking or third-party embeds.
- For a follow-up, return the complete updated file set, not a diff, and keep everything that was not asked to change.
- "reply" explains what changed in the user's words. Never call yourself an AI model.
- At most 4 files, each under 60 KB.`;

function aiBaseUrl(value) {
  let url;
  try {
    url = new URL(text(value, 300));
  } catch {
    return "";
  }
  if (url.username || url.password) return "";
  const localHost = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) return "";
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

const aiEndpoint = (base) => (/\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`);

async function aiConfigFor(env, userId) {
  return (await env.DB.prepare("SELECT * FROM ai_settings WHERE user_id = ?").bind(userId).first()) || null;
}

const publicAi = (row) => ({
  configured: !!row?.api_key,
  baseUrl: row?.base_url || "",
  model: row?.model || "",
  hasKey: !!row?.api_key,
  keyHint: row?.api_key ? `…${row.api_key.slice(-4)}` : "",
  updatedAt: row?.updated_at || 0
});

/* One chat completion against whatever the account configured. Errors are
   surfaced with the provider's own message, trimmed, and never the key. */
async function aiComplete(config, messages, maxTokens = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT);
  try {
    const response = await fetch(aiEndpoint(config.base_url), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.api_key}` },
      body: JSON.stringify({ model: config.model, messages, temperature: 0.3, max_tokens: maxTokens }),
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) {
      const parsed = parseJson(raw, null);
      const message = text(parsed?.error?.message || parsed?.message || raw, 240);
      throw new Error(message ? `${message} (${response.status})` : `the provider answered ${response.status}`);
    }
    const payload = parseJson(raw, null);
    const content = payload?.choices?.[0]?.message?.content;
    const reply = Array.isArray(content) ? content.map((part) => part?.text || "").join("") : content;
    if (typeof reply !== "string" || !reply.trim()) throw new Error("the provider returned an empty message");
    return { text: reply, tokens: Math.max(0, Number(payload?.usage?.total_tokens) || 0), model: text(payload?.model, 80) || config.model };
  } catch (error) {
    if (error.name === "AbortError") throw new Error(`the provider did not answer within ${Math.round(AI_TIMEOUT / 1000)}s`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/* Models drift: fenced JSON, a stray sentence, JSON with helpful prose around it.
   Take the outermost object, then hold the result to the same file rules a manual
   edit has to pass. Anything that fails becomes a clear refusal, not a broken build. */
function parseAiTurn(raw) {
  const body = String(raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const data = parseJson(body.slice(start, end + 1), null);
  if (!data || typeof data !== "object" || !Array.isArray(data.files)) return null;
  const files = validFiles(data.files.map((file) => ({ path: file?.path, content: file?.content })));
  if (!files || !files.some((file) => /\.html?$/i.test(file.path))) return null;
  const steps = (Array.isArray(data.steps) ? data.steps : [])
    .slice(0, 24)
    .map((step) =>
      typeof step === "string"
        ? { kind: "write", text: text(step, 160) }
        : { kind: text(step?.kind, 16) || "write", text: text(step?.text, 160), path: safePath(step?.path), lines: Number(step?.lines) || 0 }
    )
    .filter((step) => step.text || step.path);
  return {
    reply: text(data.reply, 2000) || "Updated the project.",
    summary: text(data.summary, 200),
    files,
    steps
  };
}

async function sessionUser(env, request) {
  const token = parseCookies(request.headers.get("cookie"))[COOKIE];
  if (!token) return null;
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`
  )
    .bind(hash, now())
    .first();
  return row || null;
}

async function createSession(env, userId) {
  const token = randomHex(32);
  const hash = await sha256Hex(token);
  const created = now();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(hash, userId, created, created + SESSION_TTL * 1000)
    .run();
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}`;
}

/* --------------------------------------------------------------- projects */

const projectRow = (row) => ({
  id: row.id,
  name: row.name,
  mode: row.mode,
  summary: row.summary,
  starred: !!row.starred,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

async function ownedProject(env, userId, id) {
  if (!id) return null;
  return env.DB.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").bind(id, userId).first();
}

async function filesOf(env, projectId) {
  const { results } = await env.DB.prepare("SELECT path, content, updated_at FROM files WHERE project_id = ? ORDER BY path")
    .bind(projectId)
    .all();
  return (results || []).map((row) => ({ path: row.path, content: row.content, updatedAt: row.updated_at }));
}

async function messagesOf(env, projectId) {
  const { results } = await env.DB.prepare("SELECT * FROM messages WHERE project_id = ? ORDER BY created_at")
    .bind(projectId)
    .all();
  return (results || []).map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    meta: parseJson(row.meta, {}),
    createdAt: row.created_at
  }));
}

async function versionsOf(env, projectId) {
  const { results } = await env.DB.prepare(
    "SELECT id, label, bookmarked, created_at FROM versions WHERE project_id = ? ORDER BY created_at DESC LIMIT 100"
  )
    .bind(projectId)
    .all();
  return (results || []).map((row) => ({ id: row.id, label: row.label, bookmarked: !!row.bookmarked, createdAt: row.created_at }));
}

const deployOf = (env, projectId) =>
  env.DB.prepare("SELECT slug, visibility, access_key, published_at FROM deploys WHERE project_id = ?").bind(projectId).first();

function validFiles(value) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_FILES) return null;
  const seen = new Set();
  const files = [];
  for (const file of value) {
    const path = safePath(file?.path);
    const content = typeof file?.content === "string" ? file.content : "";
    if (!path || seen.has(path)) return null;
    if (enc.encode(content).length > MAX_FILE_BYTES) return null;
    seen.add(path);
    files.push({ path, content });
  }
  return files;
}

/* ------------------------------------------------------------------ routes */

async function handleApi(request, env, url) {
  const method = request.method;
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const path = "/" + parts.slice(1).join("/");

  if (path === "/health") {
    const hasDb = !!env.DB;
    return json({ ok: hasDb, db: hasDb });
  }

  if (path === "/auth/signup" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const username = text(body.username, 24).toLowerCase();
    const email = text(body.email, 254).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    if (!isUsername(username)) return fail(400, "Use 3–24 lowercase letters, numbers or dashes for the username.", "username");
    if (!isEmail(email)) return fail(400, "That email address does not look right.", "email");
    if (password.length < 8 || password.length > 200) return fail(400, "Passwords need at least eight characters.", "password");

    const taken = await env.DB.prepare("SELECT id FROM users WHERE username = ? OR email = ?").bind(username, email).first();
    if (taken) return fail(409, "That username or email is already in use.", "username");

    const id = randomHex(12);
    const salt = randomHex(16);
    const hash = await derive(password, salt);
    const created = now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, username, email, name, salt, hash, plan, created_at) VALUES (?, ?, ?, ?, ?, ?, 'free', ?)").bind(
        id,
        username,
        email,
        displayName(username),
        salt,
        hash,
        created
      ),
      env.DB.prepare("INSERT INTO settings (user_id, theme, show_tokens, default_mode, updated_at) VALUES (?, 'dark', 1, 'website', ?)").bind(id, created)
    ]);
    const cookie = await createSession(env, id);
    const user = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
    return json({ user: publicUser(user), usage: await usageFor(env, id), settings: await settingsFor(env, id) }, 201, {
      "set-cookie": cookie
    });
  }

  if (path === "/auth/signin" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const login = text(body.login, 254).toLowerCase();
    const password = typeof body.password === "string" ? body.password : "";
    if (!login || !password) return fail(400, "Enter your email or username and your password.", "login");
    const row = await env.DB.prepare("SELECT * FROM users WHERE email = ? OR username = ?").bind(login, login).first();
    if (!row) return fail(401, "That account does not exist.", "login");
    const hash = await derive(password, row.salt);
    if (!sameDigest(hash, row.hash)) return fail(401, "That password does not match this account.", "password");
    const cookie = await createSession(env, row.id);
    return json({ user: publicUser(row), usage: await usageFor(env, row.id), settings: await settingsFor(env, row.id) }, 200, {
      "set-cookie": cookie
    });
  }

  if (path === "/auth/signout" && method === "POST") {
    const token = parseCookies(request.headers.get("cookie"))[COOKIE];
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
    return json({ ok: true }, 200, { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
  }

  /* Guests ask who they are on every load. Answering 200 with `user: null`
     keeps that check out of the console; everything else stays a 401. */
  if (path === "/me" && method === "GET") {
    const current = await sessionUser(env, request);
    if (!current) return json({ user: null, usage: null, settings: null });
    return json({
      user: publicUser(current),
      usage: await usageFor(env, current.id),
      settings: await settingsFor(env, current.id)
    });
  }

  const user = await sessionUser(env, request);
  if (!user) return fail(401, "Sign in to continue.");
  const userId = user.id;

  if (path === "/settings" && method === "PATCH") {
    const body = await request.json().catch(() => ({}));
    const current = await settingsFor(env, userId);
    const theme = ["system", "light", "dark"].includes(body.theme) ? body.theme : current.theme;
    const showTokens = typeof body.showTokens === "boolean" ? body.showTokens : current.showTokens;
    const defaultMode = ["website", "app", "prototype", "slides"].includes(body.defaultMode) ? body.defaultMode : current.defaultMode;
    await env.DB.prepare(
      `INSERT INTO settings (user_id, theme, show_tokens, default_mode, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET theme = excluded.theme, show_tokens = excluded.show_tokens,
         default_mode = excluded.default_mode, updated_at = excluded.updated_at`
    )
      .bind(userId, theme, showTokens ? 1 : 0, defaultMode, now())
      .run();
    return ok({ settings: await settingsFor(env, userId) });
  }

  /* ------------------------------------------------------------ ai provider */

  if (path === "/ai/settings" && method === "GET") {
    return json({ ai: publicAi(await aiConfigFor(env, userId)) });
  }

  if (path === "/ai/settings" && method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const baseUrl = aiBaseUrl(body.baseUrl);
    const model = text(body.model, 120);
    const supplied = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!baseUrl) return fail(400, "That base URL is not usable. Use https, like https://api.example.com/v1.", "baseUrl");
    if (!model) return fail(400, "Add the model id your provider expects.", "model");
    const existing = await aiConfigFor(env, userId);
    const apiKey = supplied || existing?.api_key || "";
    if (!apiKey) return fail(400, "Add the API key for this provider.", "apiKey");
    if (!/^[\x21-\x7e]{6,400}$/.test(apiKey)) return fail(400, "That API key does not look right — paste the value your provider gave you.", "apiKey");
    await env.DB.prepare(
      `INSERT INTO ai_settings (user_id, base_url, model, api_key, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET base_url = excluded.base_url, model = excluded.model,
         api_key = excluded.api_key, updated_at = excluded.updated_at`
    )
      .bind(userId, baseUrl, model, apiKey, now())
      .run();
    return ok({ ai: publicAi(await aiConfigFor(env, userId)) });
  }

  if (path === "/ai/settings" && method === "DELETE") {
    await env.DB.prepare("DELETE FROM ai_settings WHERE user_id = ?").bind(userId).run();
    return ok({ ai: publicAi(null) });
  }

  /* A real, tiny completion: the quickest way to find out a key is wrong or a
     model id is misspelled is to ask the provider, not to guess. */
  if (path === "/ai/test" && method === "POST") {
    const config = await aiConfigFor(env, userId);
    if (!config?.api_key) return fail(400, "Save your provider details first.", "ai");
    const started = now();
    try {
      const result = await aiComplete(
        config,
        [
          { role: "system", content: "Reply with exactly one word: ready" },
          { role: "user", content: "ping" }
        ],
        24
      );
      return ok({ model: result.model, tokens: result.tokens, latency: now() - started, reply: text(result.text, 40) });
    } catch (error) {
      return fail(502, `That provider call failed: ${error.message}`, "provider");
    }
  }

  /* Generation only: the files still travel through the normal turn endpoint,
     so size, path and allowance rules apply exactly once, in one place. */
  if (path === "/ai/turns" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const prompt = text(body.prompt, 600);
    if (!prompt) return fail(400, "A turn needs a prompt.");
    if ((await usageFor(env, userId)).blocked) {
      return fail(429, "You have used today's allowance. Prompts reset at midnight UTC; Code view edits stay free.", "usage");
    }
    const config = await aiConfigFor(env, userId);
    if (!config?.api_key) return fail(412, "Add your provider details in Settings, or keep using the local agent.", "ai");

    const current = validFiles(Array.isArray(body.files) ? body.files : []) || [];
    const listing = current.length
      ? current
          .map((file) => `----- ${file.path} -----\n${file.content}`)
          .join("\n\n")
          .slice(0, AI_PROMPT_BYTES)
      : "(no files yet — this is the first build)";
    const mode = ["website", "app", "prototype", "slides"].includes(body.mode) ? body.mode : "website";

    let result;
    try {
      result = await aiComplete(config, [
        { role: "system", content: AI_SYSTEM },
        { role: "user", content: `Mode: ${mode}\n\nCurrent files:\n${listing}\n\nRequest: ${prompt}` }
      ]);
    } catch (error) {
      return fail(502, `The model call failed: ${error.message}. Check the provider details in Settings.`, "provider");
    }

    const turn = parseAiTurn(result.text);
    if (!turn) return fail(502, "The model answered without usable files. Try again, or switch to the local agent in Settings.", "format");

    const before = new Map(current.map((file) => [file.path, file.content]));
    const changedPaths = turn.files.filter((file) => before.get(file.path) !== file.content).map((file) => file.path);
    /* Models write confident line counts that are often wrong. Count the files
       we actually received instead, so the chat cannot report "0 lines". */
    const lineCount = new Map(turn.files.map((file) => [file.path, file.content.split("\n").length]));
    const steps = (turn.steps.length
      ? turn.steps
      : turn.files.map((file) => ({ kind: "write", path: file.path }))
    ).map((step) => (step.path ? { ...step, lines: lineCount.get(step.path) || step.lines || 0 } : step));

    return json({
      outcome: {
        reply: turn.reply,
        summary: turn.summary,
        files: turn.files,
        steps,
        tokens: result.tokens,
        changedPaths,
        engine: "ai",
        model: result.model
      }
    });
  }

  if (path === "/projects" && method === "GET") {
    const filter = url.searchParams.get("filter") || "all";
    const q = text(url.searchParams.get("q"), 80).toLowerCase();
    const sort = url.searchParams.get("sort") || "edited";
    const order = sort === "name" ? "name COLLATE NOCASE ASC" : sort === "created" ? "created_at DESC" : "updated_at DESC";
    const { results } = await env.DB.prepare(
      `SELECT * FROM projects WHERE user_id = ?${filter === "starred" ? " AND starred = 1" : ""} ORDER BY ${order}`
    )
      .bind(userId)
      .all();
    const projects = (results || [])
      .filter((row) => !q || row.name.toLowerCase().includes(q))
      .map(projectRow);
    return json({ projects });
  }

  if (path === "/projects" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const name = text(body.name, 60) || "Untitled project";
    const mode = ["website", "app", "prototype", "slides"].includes(body.mode) ? body.mode : "website";
    const id = randomHex(10);
    const created = now();
    await env.DB.prepare("INSERT INTO projects (id, user_id, name, mode, summary, starred, created_at, updated_at) VALUES (?, ?, ?, ?, '', 0, ?, ?)")
      .bind(id, userId, name, mode, created, created)
      .run();
    return json({ project: { id, name, mode, summary: "", starred: false, createdAt: created, updatedAt: created } }, 201);
  }

  const projectMatch = path.match(/^\/projects\/([a-z0-9]+)(\/.*)?$/);
  if (projectMatch) {
    const project = await ownedProject(env, userId, projectMatch[1]);
    if (!project) return fail(404, "That project does not exist on this account.");
    const rest = projectMatch[2] || "";

    if (!rest && method === "GET") {
      const [files, messages, versions, deploy] = await Promise.all([
        filesOf(env, project.id),
        messagesOf(env, project.id),
        versionsOf(env, project.id),
        deployOf(env, project.id)
      ]);
      return json({
        project: projectRow(project),
        files,
        messages,
        versions,
        deploy: deploy
          ? {
              slug: deploy.slug,
              visibility: deploy.visibility,
              publishedAt: deploy.published_at,
              accessKey: deploy.visibility === "private" ? deploy.access_key : ""
            }
          : null,
        usage: await usageFor(env, userId)
      });
    }

    /* A tiny read-only render of the project for dashboard thumbnails. Served
       inlined so the sandboxed iframe needs exactly one request and no scripts. */
    if (rest === "/preview" && method === "GET") {
      const files = await filesOf(env, project.id);
      const byPath = new Map(files.map((file) => [file.path, file.content]));
      let html = byPath.get("index.html") || "<!doctype html><p>Nothing built yet.</p>";
      html = html.replace(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (tag, href) => {
        const css = byPath.get(String(href).replace(/^\.?\//, ""));
        return css === undefined ? tag : `<style>${css}</style>`;
      });
      html = html.replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (tag, src) => {
        const js = byPath.get(String(src).replace(/^\.?\//, ""));
        return js === undefined ? tag : `<script>${js.replace(/<\/script/gi, "<\\/script")}</script>`;
      });
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "private, max-age=30",
          "x-content-type-options": "nosniff"
        }
      });
    }

    if (!rest && method === "PATCH") {
      const body = await request.json().catch(() => ({}));
      const name = body.name === undefined ? project.name : text(body.name, 60) || project.name;
      const starred = body.starred === undefined ? project.starred : body.starred ? 1 : 0;
      await env.DB.prepare("UPDATE projects SET name = ?, starred = ?, updated_at = ? WHERE id = ?")
        .bind(name, starred, now(), project.id)
        .run();
      const row = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(project.id).first();
      return ok({ project: projectRow(row) });
    }

    if (!rest && method === "DELETE") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM files WHERE project_id = ?").bind(project.id),
        env.DB.prepare("DELETE FROM messages WHERE project_id = ?").bind(project.id),
        env.DB.prepare("DELETE FROM versions WHERE project_id = ?").bind(project.id),
        env.DB.prepare("DELETE FROM deploys WHERE project_id = ?").bind(project.id),
        env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(project.id)
      ]);
      return ok();
    }

    if (rest === "/duplicate" && method === "POST") {
      const [files, source] = await Promise.all([filesOf(env, project.id), Promise.resolve(project)]);
      const id = randomHex(10);
      const created = now();
      const batch = [
        env.DB.prepare("INSERT INTO projects (id, user_id, name, mode, summary, starred, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)").bind(
          id,
          userId,
          `${source.name} copy`.slice(0, 60),
          source.mode,
          source.summary,
          created,
          created
        )
      ];
      for (const file of files) {
        batch.push(env.DB.prepare("INSERT INTO files (project_id, path, content, updated_at) VALUES (?, ?, ?, ?)").bind(id, file.path, file.content, created));
      }
      await env.DB.batch(batch);
      return json({ project: { id, name: `${source.name} copy`.slice(0, 60), mode: source.mode } }, 201);
    }

    if (rest === "/turns" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      const prompt = text(body.prompt, 600);
      const reply = text(body.reply, 4000);
      const files = validFiles(body.files);
      if (!prompt || !reply) return fail(400, "A turn needs a prompt and a reply.");
      if (!files) return fail(400, "The files for this turn are missing or too large.");

      const usage = await usageFor(env, userId);
      const tokens = Math.max(0, Math.min(Number(body.tokens) || 0, 400000));
      if (usage.blocked) {
        return fail(429, "You have used today's allowance. Prompts reset at midnight UTC; Code view edits stay free.", "usage");
      }

      const createdAt = now();
      const assistantId = randomHex(10);
      const userId2 = randomHex(10);
      const versionId = randomHex(10);
      const label = text(body.versionLabel, 120) || prompt.slice(0, 80) || "Manual edit";
      const meta = {
        steps: Array.isArray(body.steps) ? body.steps.slice(0, 40) : [],
        files: files.map((file) => ({ path: file.path, lines: file.content.split("\n").length })),
        tokens
      };

      const batch = [
        env.DB.prepare("INSERT INTO messages (id, project_id, role, content, meta, created_at) VALUES (?, ?, 'user', ?, '{}', ?)").bind(
          userId2,
          project.id,
          prompt,
          createdAt
        ),
        env.DB.prepare("INSERT INTO messages (id, project_id, role, content, meta, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)").bind(
          assistantId,
          project.id,
          reply,
          JSON.stringify(meta),
          createdAt + 1
        ),
        env.DB.prepare("INSERT INTO versions (id, project_id, label, snapshot, bookmarked, created_at) VALUES (?, ?, ?, ?, 0, ?)").bind(
          versionId,
          project.id,
          label.slice(0, 120),
          JSON.stringify(files),
          createdAt + 1
        ),
        env.DB.prepare("DELETE FROM files WHERE project_id = ?").bind(project.id),
        ...files.map((file) =>
          env.DB.prepare("INSERT INTO files (project_id, path, content, updated_at) VALUES (?, ?, ?, ?)").bind(
            project.id,
            file.path,
            file.content,
            createdAt
          )
        ),
        env.DB.prepare("UPDATE projects SET updated_at = ?, summary = ? WHERE id = ?").bind(
          createdAt,
          text(body.summary, 200) || project.summary,
          project.id
        ),
        env.DB.prepare(
          `INSERT INTO usage (user_id, day, tokens) VALUES (?, ?, ?)
           ON CONFLICT(user_id, day) DO UPDATE SET tokens = tokens + excluded.tokens`
        ).bind(userId, dayKey(), tokens)
      ];

      const name = body.name === undefined ? project.name : text(body.name, 60) || project.name;
      if (name !== project.name) {
        batch.push(env.DB.prepare("UPDATE projects SET name = ? WHERE id = ?").bind(name, project.id));
      }

      await env.DB.batch(batch);
      return json({
        messages: [
          { id: userId2, role: "user", content: prompt, meta: {}, createdAt },
          { id: assistantId, role: "assistant", content: reply, meta, createdAt: createdAt + 1 }
        ],
        files,
        version: { id: versionId, label: label.slice(0, 120), bookmarked: false, createdAt: createdAt + 1 },
        usage: await usageFor(env, userId),
        project: { ...projectRow({ ...project, name, updated_at: createdAt, summary: text(body.summary, 200) || project.summary }) }
      });
    }

    if (rest === "/files" && (method === "PUT" || method === "POST")) {
      const body = await request.json().catch(() => ({}));
      const path = safePath(body.path);
      const content = typeof body.content === "string" ? body.content : "";
      if (!path) return fail(400, "That file path is not valid.");
      if (enc.encode(content).length > MAX_FILE_BYTES) return fail(413, "That file is over 200 KB.");
      const previousPath = body.previousPath ? safePath(body.previousPath) : "";
      const existing = await env.DB.prepare("SELECT path FROM files WHERE project_id = ?").bind(project.id).all();
      const paths = (existing.results || []).map((row) => row.path);
      if (!paths.includes(path) && paths.length >= MAX_FILES) return fail(400, `A project can hold ${MAX_FILES} files.`);
      const stamp = now();
      const batch = [];
      if (previousPath && previousPath !== path && paths.includes(previousPath)) {
        batch.push(env.DB.prepare("DELETE FROM files WHERE project_id = ? AND path = ?").bind(project.id, previousPath));
      }
      batch.push(
        env.DB.prepare(
          `INSERT INTO files (project_id, path, content, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
        ).bind(project.id, path, content, stamp)
      );
      batch.push(env.DB.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").bind(stamp, project.id));
      await env.DB.batch(batch);
      return ok({ files: await filesOf(env, project.id), path });
    }

    if (rest === "/files" && method === "DELETE") {
      const path = safePath(url.searchParams.get("path"));
      if (!path) return fail(400, "Which file should be removed?");
      await env.DB.prepare("DELETE FROM files WHERE project_id = ? AND path = ?").bind(project.id, path).run();
      await env.DB.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").bind(now(), project.id).run();
      return ok({ files: await filesOf(env, project.id) });
    }

    const versionMatch = rest.match(/^\/versions\/([a-z0-9]+)(\/restore)?$/);
    if (versionMatch) {
      const row = await env.DB.prepare("SELECT * FROM versions WHERE id = ? AND project_id = ?")
        .bind(versionMatch[1], project.id)
        .first();
      if (!row) return fail(404, "That version is gone.");

      if (versionMatch[2] && method === "POST") {
        const files = parseJson(row.snapshot, []);
        const createdAt = now();
        const versionId = randomHex(10);
        const messageId = randomHex(10);
        const batch = [
          env.DB.prepare("DELETE FROM files WHERE project_id = ?").bind(project.id),
          ...files.map((file) =>
            env.DB.prepare("INSERT INTO files (project_id, path, content, updated_at) VALUES (?, ?, ?, ?)").bind(
              project.id,
              file.path,
              file.content,
              createdAt
            )
          ),
          env.DB.prepare(
            "INSERT INTO versions (id, project_id, label, snapshot, bookmarked, created_at) VALUES (?, ?, ?, ?, 0, ?)"
          ).bind(versionId, project.id, `Restored “${row.label}”`.slice(0, 120), JSON.stringify(files), createdAt),
          env.DB.prepare(
            "INSERT INTO messages (id, project_id, role, content, meta, created_at) VALUES (?, ?, 'system', ?, '{}', ?)"
          ).bind(messageId, project.id, `Restored the version “${row.label}”.`, createdAt),
          env.DB.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").bind(createdAt, project.id)
        ];
        await env.DB.batch(batch);
        return ok({
          files,
          version: { id: versionId, label: `Restored “${row.label}”`.slice(0, 120), bookmarked: false, createdAt },
          message: { id: messageId, role: "system", content: `Restored the version “${row.label}”.`, meta: {}, createdAt }
        });
      }

      if (!versionMatch[2] && method === "GET") {
        return json({ version: { id: row.id, label: row.label, files: parseJson(row.snapshot, []) } });
      }

      if (!versionMatch[2] && method === "PATCH") {
        const body = await request.json().catch(() => ({}));
        const label = body.label === undefined ? row.label : text(body.label, 120) || row.label;
        const bookmarked = body.bookmarked === undefined ? row.bookmarked : body.bookmarked ? 1 : 0;
        await env.DB.prepare("UPDATE versions SET label = ?, bookmarked = ? WHERE id = ?").bind(label, bookmarked, row.id).run();
        return ok({ version: { id: row.id, label, bookmarked: !!bookmarked, createdAt: row.created_at } });
      }
    }

    if (rest === "/publish" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      const files = await filesOf(env, project.id);
      if (!files.length) return fail(400, "Build something before publishing.");
      const requested = body.slug ? slugify(body.slug) : "";
      if (body.slug && requested.length < 3) return fail(400, "Use at least three characters for the address.", "slug");
      const visibility = body.visibility === "private" ? "private" : "public";
      const existing = await deployOf(env, project.id);

      let slug = requested || existing?.slug || `${slugify(project.name)}-${randomHex(3)}`;
      if (!requested && !existing) slug = `${slugify(project.name)}-${randomHex(3)}`.slice(0, 48);
      const clash = await env.DB.prepare("SELECT project_id FROM deploys WHERE slug = ? AND project_id != ?")
        .bind(slug, project.id)
        .first();
      if (clash) {
        if (requested) return fail(409, "That address is taken. Try another.", "slug");
        slug = `${slug}-${randomHex(2)}`;
      }

      const snapshot = JSON.stringify(files.map(({ path, content }) => ({ path, content })));
      const accessKey = visibility === "private" ? existing?.access_key || randomHex(8) : "";
      await env.DB.prepare(
        `INSERT INTO deploys (project_id, slug, visibility, access_key, snapshot, published_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET slug = excluded.slug, visibility = excluded.visibility,
           access_key = excluded.access_key, snapshot = excluded.snapshot, published_at = excluded.published_at`
      )
        .bind(project.id, slug, visibility, accessKey, snapshot, now())
        .run();
      return ok({ deploy: { slug, visibility, accessKey, url: `/s/${slug}`, publishedAt: now() } });
    }

    if (rest === "/publish" && method === "DELETE") {
      await env.DB.prepare("DELETE FROM deploys WHERE project_id = ?").bind(project.id).run();
      return ok();
    }
  }

  return fail(404, "No such endpoint.");
}

/* ------------------------------------------------------------ published site */

const MIME = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8"
};

const notFoundPage = (message) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Not published</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d0f12;color:#eef1f5;
    font:16px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif;text-align:center;padding:24px}
  .card{max-width:420px;border:1px solid #272c34;border-radius:16px;padding:28px;background:#15181d}
  h1{font-size:20px;margin:0 0 8px}p{color:#9aa4b2;margin:0 0 18px;font-size:14px}
  a{color:#f0a13c;text-decoration:none;font-weight:600;font-size:14px}
</style></head>
<body><div class="card"><h1>${message.title}</h1><p>${message.copy}</p><a href="/">Open Anvel</a></div></body></html>`;

/* A published page is served from /s/:slug (no trailing slash), so a relative
   <link href="styles.css"> would resolve against /s/ and ask for /s/styles.css,
   which is a different slug. Inlining keeps a published page one request and
   also means a private site's assets never need the access key. */
function inlineAssets(html, files) {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const lookup = (ref) => byPath.get(String(ref).replace(/^\.?\//, "").split("?")[0]);
  let out = html.replace(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (tag, href) => {
    if (!/\.css(\?|$)/i.test(href)) return tag;
    const css = lookup(href);
    return css === undefined ? tag : `<style>${css}</style>`;
  });
  out = out.replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (tag, src) => {
    const js = lookup(src);
    return js === undefined ? tag : `<script>${js.replace(/<\/script/gi, "<\\/script")}</script>`;
  });
  return out;
}

async function servePublished(request, env, url) {
  const parts = url.pathname.split("/").filter(Boolean); // ["s", slug, ...rest]
  const slug = parts[1];
  const rest = parts.slice(2).join("/");
  if (!slug) return new Response(notFoundPage({ title: "Nothing here", copy: "That address does not point at a published project." }), { status: 404, headers: { "content-type": MIME.html } });

  const row = await env.DB.prepare("SELECT * FROM deploys WHERE slug = ?").bind(slug).first();
  if (!row) {
    return new Response(notFoundPage({ title: "This site is not published", copy: "The address is free, or the project behind it was removed." }), {
      status: 404,
      headers: { "content-type": MIME.html }
    });
  }

  if (row.visibility === "private") {
    const key = url.searchParams.get("k") || "";
    if (!key || key !== row.access_key) {
      return new Response(
        notFoundPage({ title: "This site is private", copy: "The owner restricted viewing. Ask them for the access link, including its key." }),
        { status: 403, headers: { "content-type": MIME.html } }
      );
    }
  }

  const files = parseJson(row.snapshot, []);
  const requested = rest || "index.html";
  const file = files.find((f) => f.path === requested) || (requested === "index.html" ? files.find((f) => /index\.html$/i.test(f.path)) : null);
  if (!file) {
    return new Response(notFoundPage({ title: "Page not found", copy: "This file is not part of the published project." }), {
      status: 404,
      headers: { "content-type": MIME.html }
    });
  }
  const ext = (file.path.split(".").pop() || "html").toLowerCase();
  const body = ext === "html" ? inlineAssets(file.content, files) : file.content;
  return new Response(body, {
    headers: {
      "content-type": MIME[ext] || "text/plain; charset=utf-8",
      "cache-control": "public, max-age=60",
      "x-content-type-options": "nosniff"
    }
  });
}

/* ------------------------------------------------------------------ export */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        await ensureSchema(env);
        return await handleApi(request, env, url);
      }

      if (url.pathname.startsWith("/s/")) {
        await ensureSchema(env);
        return await servePublished(request, env, url);
      }

      return await env.ASSETS.fetch(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (url.pathname.startsWith("/api/")) {
        return json({ error: "Something went wrong on the server.", detail: message }, 500);
      }
      return new Response(notFoundPage({ title: "Something broke", copy: "The app could not load that. Try again in a moment." }), {
        status: 500,
        headers: { "content-type": MIME.html }
      });
    }
  }
};
