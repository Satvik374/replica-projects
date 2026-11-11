# Architecture — Alcove (the claude.ai workspace, rebuilt)

## Stack, one line each

| layer | choice | why |
| --- | --- | --- |
| app | static HTML + ES modules, no build step | the reference is a document app; no framework earns its keep here, and a Worker can serve it directly |
| server | one Cloudflare Worker (`worker.js`) | same origin as the app, no CORS, one deployable unit |
| database | Cloudflare D1 (SQLite) | per-user rows, relational enough, zero servers; schema created idempotently on first use |
| auth | email + password, PBKDF2-SHA256, hashed session tokens | no third-party dependency, works offline in `wrangler dev` |
| styling | CSS custom properties from `design/tokens.json` | one token file, one dark block |
| icons | Lucide paths, inlined as an SVG sprite | MIT, no network requests |
| hosting | Freebuff Sites (Workers + assets + D1) | the repo's proven path (see `chatgpt-clone/`) |
| replies | scripted engine in `public/js/engine.js` | no model key in this build; the transport, states and streaming are real |
| email, payments, jobs | none | deliberately out of scope, and the UI says so where it matters |

No framework, no bundler, no node server at runtime. `wrangler dev` runs the
Worker plus a local D1 in workerd.

## Schema

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system',      -- system | light | dark
  font_size TEXT NOT NULL DEFAULT 'md',      -- sm | md | lg
  motion TEXT NOT NULL DEFAULT 'auto',       -- auto | reduce
  suggestions INTEGER NOT NULL DEFAULT 1,
  model TEXT NOT NULL DEFAULT 'sonnet',      -- opus | sonnet | haiku
  style_id TEXT NOT NULL DEFAULT 'normal',
  thinking INTEGER NOT NULL DEFAULT 0,
  instructions TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  starred INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX projects_user ON projects(user_id, updated_at DESC);

CREATE TABLE project_docs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX project_docs_project ON project_docs(project_id);

CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'sonnet',
  style_id TEXT NOT NULL DEFAULT 'normal',
  thinking INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0,
  share_token TEXT UNIQUE,
  shared_at INTEGER,            -- snapshot boundary: only seq <= shared_seq
  shared_seq INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX chats_user ON chats(user_id, updated_at DESC);
CREATE INDEX chats_project ON chats(project_id, updated_at DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  thinking TEXT,
  artifacts TEXT,               -- JSON array: [{id,title,kind,language,code,versions[]}]
  attachments TEXT,             -- JSON array: [{name,size,kind,text?}]
  feedback TEXT,                -- up | down | null
  seq INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX messages_chat ON messages(chat_id, seq);

CREATE TABLE styles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX styles_user ON styles(user_id);

CREATE TABLE usage (
  user_id TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  messages_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_start)
);
```

Access rules: the Worker never reads a record by request-supplied owner. Every
query carries `user_id = <session user>` (and the project join is checked
against that user). Public share reads are the only unscoped read, and they are
limited to `seq <= shared_seq` plus the chat's own token.

Constraints the UI cannot enforce are in SQL: unique email, unique share token,
role check, cascade deletes, and the Free plan's five-project cap in the route.

## API

| method path | what it does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| `GET /api/health` | liveness + DB bound | anyone | – | `{ok,db}` | – |
| `POST /api/auth/signup` | create account + session | anyone | `{email,password,name?}` | user | F01 |
| `POST /api/auth/login` | start session | anyone | `{email,password}` | user | F01 |
| `POST /api/auth/logout` | end session | session | – | `{ok}` | F11 |
| `POST /api/auth/logout-all` | end every session | session | – | `{ok}` | F12 |
| `GET /api/auth/me` | current user | anyone | – | `{user\|null}` | boot |
| `GET/PUT /api/settings` | device + account prefs | session | prefs object | prefs | F11 |
| `PATCH /api/account` | display name | session | `{name}` | user | F11 |
| `PATCH /api/account/password` | change password | session | `{current,next}` | `{ok}` | F12 |
| `DELETE /api/account` | delete user + data | session | – | `{ok}` | F12 |
| `GET /api/overview` | sidebar payload: chats, projects, starred, usage | session | – | `{chats,projects,usage}` | S03 |
| `GET /api/chats?q=&project=` | list/search chats | session | – | chats | F06 |
| `POST /api/chats` | new chat | session | `{project_id?,model?,style_id?,thinking?}` | chat | F02 |
| `GET /api/chats/:id` | chat + messages | session | – | `{chat,messages}` | F02 |
| `PATCH /api/chats/:id` | title, star, project, model, style, thinking | session | partial | chat | F07 |
| `DELETE /api/chats/:id` | delete chat + messages | session | – | `{ok}` | F07 |
| `POST /api/chats/:id/messages` | append user or assistant message | session | `{role,content,thinking?,artifacts?,attachments?}` | message | F02 |
| `POST /api/chats/:id/truncate` | drop messages after `seq` | session | `{seq}` | `{ok}` | F02 |
| `PATCH /api/messages/:id` | feedback | session | `{feedback}` | message | F02 |
| `POST /api/chats/:id/share` | mint share token + snapshot seq | session | – | `{token}` | F08 |
| `DELETE /api/chats/:id/share` | revoke | session | – | `{ok}` | F08 |
| `GET /api/share/:token` | public snapshot | anyone | – | `{chat,messages,shared_at}` | F08 |
| `GET/POST /api/projects` | list / create | session | `{name,description?}` | projects / project | F04 |
| `GET/PATCH/DELETE /api/projects/:id` | read, edit, delete | session | partial | project | F04 |
| `POST /api/projects/:id/docs` | add knowledge | session | `{name,content}` | doc | F04 |
| `DELETE /api/projects/:id/docs/:docId` | remove knowledge | session | – | `{ok}` | F04 |
| `GET/POST /api/styles` | list / create style | session | `{name,description,instructions}` | styles | F10 |
| `PATCH/DELETE /api/styles/:id` | edit / delete | session | partial | style | F10 |
| `GET /api/export` | every row the user owns | session | – | JSON download | F12 |

No webhooks in, no webhooks out, no background jobs. Nothing calls a third
party. Usage is counted in the message route against a rolling 5-hour window.

## The parts that bite

- **Share snapshots.** `shared_seq` is captured at share time; later messages are
  invisible to `/api/share/:token`, and attachments are stripped from the public
  payload. Revoking clears the token so old links 404.
- **Idempotency.** Double submit is blocked in the client while streaming, and the
  message route takes an optional `client_id` that is ignored if already stored.
  Two tabs can still race a send; the worst case is two messages, not lost data.
- **Usage counting.** Per-message, not token-based, so the number is explainable.
  Window start is stored so the reset time is stable across reloads.
- **File size.** 200 KB of text per attachment, 10 attachments per message. Larger
  files are refused in the client before upload and again on the server.
- **XSS.** All model and user content is escaped; markdown allows a small subset;
  artifacts render only inside `sandbox="allow-scripts"` iframes with no
  same-origin, so an artifact cannot read the session cookie.
- **Deletion.** Deleting a user deletes sessions, prefs, chats, messages, projects,
  docs and styles in one batch; cascades cover the rest.
- **Search.** SQL `LIKE` on title, message content and project name. Fine at demo
  scale; FTS5 would be the next step.
- **Rate limits / throttling.** Login attempts are throttled per IP + email in
  isolate memory. Documented as best-effort.

## Build order

1. **Vertical slice** — sign up, create chat, send, streamed reply, persisted,
   reload, still there. Tables: `users`, `sessions`, `chats`, `messages`.
2. **Must-haves** — sidebar + history + search, rename/star/delete, model and
   thinking, styles, attachments, projects + knowledge, artifacts + panel,
   sharing, settings tabs, usage, privacy, mobile.
3. **Should-haves** — edit and resend, artifact versions, project star/archive,
   sign out everywhere, password change.
4. **Could-haves** — command palette actions, font size, feedback, plan card.
5. Entrepreneur fixes (`../fixes.md`): visible context budget, "what this reply
   used", one-click cancel, honest empty states.
