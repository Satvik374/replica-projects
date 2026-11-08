# Architecture: Anvel (a rebuild of Bolt's core loop)

## Stack

| layer | choice | why |
| --- | --- | --- |
| web app | vanilla ES modules + one Worker, no build step | the whole app is a handful of files; no bundler means no toolchain to break and it deploys as a Worker with static assets |
| styling | hand-written CSS with tokens from `replica/boltnew/design/tokens.json` | one design system, two themes, no utility-class noise |
| database | Cloudflare D1 (SQLite) | the deployment target already injects a `DB` binding; SQL is enough for users, projects, files, versions, deploys |
| auth | email or username + PBKDF2-SHA256 in the Worker, http-only cookie sessions | no third-party service, no secrets to configure |
| build agent | in-browser blueprint agent (`public/agent.js`) | no model key in the project; deterministic, testable, offline, and honest about what it cannot do |
| preview | `<iframe sandbox="allow-scripts allow-forms allow-modals">` with the project inlined | generated code never shares an origin, storage or cookies with the app |
| publish | Worker route `/s/:slug` serving a stored file snapshot | real URLs, no second host |
| hosting | Cloudflare Workers + static assets | matches the rest of this repo |

Deliberately not used: WebContainer, any model API, Stripe, email, OAuth
providers. Every one of those is either the original's licenced technology or
needs a key the user would have to supply.

## Schema

Tables: 8. Access rules: one authorisation check per query in the data layer —
every statement that touches user data takes `user_id` from the session, never
from the request body.

```sql
create table users (
  id text primary key,
  username text not null unique,
  email text not null unique,
  name text not null,
  salt text not null,
  hash text not null,
  plan text not null default 'free',
  created_at integer not null
);

create table sessions (
  token_hash text primary key,
  user_id text not null references users(id) on delete cascade,
  created_at integer not null,
  expires_at integer not null
);

create table projects (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  name text not null,
  mode text not null default 'website' check (mode in ('website','app','prototype','slides')),
  summary text not null default '',
  starred integer not null default 0,
  created_at integer not null,
  updated_at integer not null
);
create index projects_owner on projects(user_id, updated_at desc);

create table files (
  project_id text not null references projects(id) on delete cascade,
  path text not null,
  content text not null,
  updated_at integer not null,
  primary key (project_id, path)
);

create table messages (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  meta text not null default '{}',   -- json: steps, files, tokens, version id
  created_at integer not null
);
create index messages_project on messages(project_id, created_at);

create table versions (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  label text not null,
  snapshot text not null,            -- json: [{path, content}]
  bookmarked integer not null default 0,
  created_at integer not null
);
create index versions_project on versions(project_id, created_at desc);

create table deploys (
  project_id text primary key references projects(id) on delete cascade,
  slug text not null unique,
  visibility text not null default 'public' check (visibility in ('public','private')),
  access_key text not null default '',
  snapshot text not null,            -- json: [{path, content}]
  published_at integer not null
);

create table usage (
  user_id text not null references users(id) on delete cascade,
  day text not null,                 -- YYYY-MM-DD, UTC
  tokens integer not null default 0,
  primary key (user_id, day)
);

create table settings (
  user_id text primary key references users(id) on delete cascade,
  theme text not null default 'dark',
  show_tokens integer not null default 1,
  default_mode text not null default 'website',
  updated_at integer not null
);
```

## API

Every route below sits behind a session cookie except auth and the published
site. `P` = project ownership checked.

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST `/api/auth/signup` | create account + session | anyone, rate limited | username, email, password | user, usage, settings | F01, F02 |
| POST `/api/auth/signin` | verify + session | anyone, rate limited | login (email or username), password | user, usage, settings | F02 |
| POST `/api/auth/signout` | clear session | signed in | — | ok | F02 |
| GET `/api/me` | session + usage + settings | signed in | — | user, usage, settings | all |
| PATCH `/api/settings` | theme, show tokens, default mode | signed in | partial settings | settings | F08 |
| GET `/api/projects` | list with filter/search/sort | owner | `?filter=&q=&sort=` | project summaries | F04 |
| POST `/api/projects` | create empty project | signed in | name, mode | project | F01 |
| GET `/api/projects/:id` | open workspace | P | — | project, files, messages, versions, deploy | F03, F05 |
| PATCH `/api/projects/:id` | rename / star | P | name or starred | project | F04 |
| DELETE `/api/projects/:id` | delete + unpublish | P | — | ok | F04 |
| POST `/api/projects/:id/duplicate` | copy files, fresh chat | P | — | project | F04 |
| POST `/api/projects/:id/turns` | one agent turn, atomically: 2 messages + files + version + usage | P | prompt, reply, steps, files, tokens, versionLabel | messages, files, version, usage | F01, F03 |
| PUT `/api/projects/:id/files` | manual save / create / rename | P | path, content, previousPath? | files | F05 |
| DELETE `/api/projects/:id/files` | delete a file | P | `?path=` | files | F05 |
| POST `/api/projects/:id/versions/:vid/restore` | restore snapshot as a new version | P | — | files, version, message | F06 |
| PATCH `/api/projects/:id/versions/:vid` | rename / bookmark | P | label or bookmarked | version | F06 |
| POST `/api/projects/:id/publish` | publish or update (snapshot) | P | slug?, visibility? | deploy | F07 |
| DELETE `/api/projects/:id/publish` | unpublish | P | — | ok | F07 |
| GET `/s/:slug/*` | the published site | anyone (private needs `?k=`) | — | file or 404 page | F07, F08 |
| GET `/api/health` | binding check | anyone | — | ok | — |

Webhooks in: none. Webhooks out: none. Jobs: none — everything is
request-scoped; month-to-date usage is a `sum()` over `usage`.

## The parts that bite

- **Isolation of generated code.** `srcdoc` + `sandbox` without
  `allow-same-origin` means generated scripts run in an opaque origin: no
  access to the session cookie, no shared `localStorage`. Inlined CSS/JS in the
  preview is therefore required (relative `fetch` would also fail).
- **Atomic turns.** One batched D1 write per agent turn (`messages` ×2,
  `files` replace, `versions` insert, `usage` upsert, `projects.updated_at`),
  so a failed request cannot leave a half-applied turn.
- **Publish is a snapshot, not a pointer.** `deploys.snapshot` is copied on
  Publish/Update so later edits do not leak to the live site until asked.
- **Slug collisions.** Slug is unique; the server appends a suffix until free,
  and a user-chosen slug is validated against `^[a-z0-9-]{3,40}$`.
- **Token accounting.** Estimated as `ceil(chars / 4)` on the prompt + written
  files, charged to the UTC day; the cap is enforced on the server (409) as
  well as shown in the UI.
- **Password storage.** PBKDF2-SHA256, 60 000 iterations, per-user salt, hex
  compare with `diff |=`. Session token is random, stored hashed, 30 days.
- **Long projects.** File contents are capped (200 KB per file, 60 files) so a
  single turn cannot blow the Worker's request or D1 row limits.
- **Deleting a project** deletes files, messages, versions and the deploy row
  via `on delete cascade`; the published URL stops resolving immediately.

## Build order

1. **Vertical slice:** S01 prompt → agent writes 3 files → S05 chat + preview →
   publish → `/s/:slug` renders. Tables: users, sessions, projects, files,
   messages, versions, deploys.
2. **Must-haves:** dashboard (S04), code view + editor (S06), version history
   (S08), publish popover (S09), usage meters (S11), settings, mobile.
3. **Should-haves:** file create/rename/delete, terminal tabs, plan mode,
   preview theme, private publish, bookmark versions.
4. **Fixes from the review:** see `replica/boltnew/bugs.md` and
   `replica/boltnew/parity.md`.
