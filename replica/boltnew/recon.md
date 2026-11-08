# Recon map: Bolt (bolt.new) — web

Scope: the prompt-to-app core loop — landing prompt, project dashboard, the
workspace (chat + live preview + code view + terminal), version history,
publish/unpublish, accounts and usage meters. Not the mobile/Expo path, not
teams, billing, Figma import or GitHub sync.
For: a clean-room rebuild ("Anvel") that does the same job with its own name,
palette, copy and code.
Date: 2026-11-08

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | marketing home | https://bolt.new | hero prompt, mode chips, start-from row, section order |
| 2 | pricing | https://bolt.new/pricing | Free/Pro/Teams gates: tokens, domains, private sites |
| 3 | help center index | https://support.bolt.new/llms.txt | full feature list, ~90 articles |
| 4 | quickstart | https://support.bolt.new/get-started/quickstart | real first-run order: prompt → survey → build → preview → history → code → publish |
| 5 | code view | https://support.bolt.new/building/code-view | file tree actions, Save/Cmd+S, terminal tabs, Ask Bolt |
| 6 | preview controls | https://support.bolt.new/building/preview-controls | reload, responsive, theme, new window, fullscreen |
| 7 | version history | https://support.bolt.new/managing-projects/rollback-backup | search, bookmarks, restore, chat-level restore |
| 8 | publish | https://support.bolt.new/bolt-cloud/hosting/publish | public/private, edit subdomain, Update vs Publish, Unpublish |
| 9 | manage projects | https://support.bolt.new/managing-projects/projects-files | dashboard list, kebab actions, duplicate, delete consequences |
| 10 | tokens + billing | https://support.bolt.new/account/tokens, /account/billing | 300K/day, 1M/month free; code edits are free |
| 11 | the user's own account (satvik308, Free) | https://bolt.new/projects | sidebar, empty dashboard state, plan badge |
| 12 | in-product screenshots (docs CDN) | `screens/` in this folder | dashboard, workspace, version history, publish popover, preview controls |

## Core loop

Describe an app in one box → an agent writes the files → the preview updates
in place → keep prompting, or edit the code yourself → publish it to a URL.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Landing | `/` signed out | one job: get a prompt | nav (Sign in, Get started, menu), hero h1, prompt composer (attach, design system, Plan, dictation, Build now), 4 mode chips, "or start from" row, customer strip, feature sections, footer (4 columns) | idle, typing, disabled send |
| S02 | Sign in | "Sign in" → dialog | authenticate | dialog: Google / GitHub / email+password / SSO, legal line, Back, Sign up link | provider list, email form, error, pending |
| S03 | Home signed in | `/` signed in | prompt again + recent work | left sidebar (logo, search ⌘K, account chip + plan, Home/Projects/Starred/Recently viewed/Shared, Help/Release notes/Status, referral card), same composer + mode chips | no projects yet, recent grid |
| S04 | Projects dashboard | `/projects` | find a project | sidebar, h1 "All projects", search field, sort dropdown (Last edited), creator filter, 3-col card grid: 16:9 thumbnail, star badge, owner avatar row (name · email · relative time), kebab | empty ("No projects found" + Create project), filled, search miss, filtered |
| S05 | Workspace — chat + preview | `/p/:id` | the actual building | top bar (project menu, view switch Preview/Code, address bar `/`, reload / open / responsive / fullscreen, GitHub, comments, Share, Publish), chat thread, composer (attach, model, Select, Plan, send) | empty chat, streaming, done, error, queued, token limit |
| S06 | Code view | view switch `<>` | read and edit files | file tree with folders, editor tabs, search, Save + unsaved dot, bottom terminal panel with Bolt / Publish Output / Terminal tabs | clean, dirty, no file open, read-only on mobile |
| S07 | Preview pane | default right side | see the app | iframe, reload, responsive presets, theme (system/light/dark), new window, fullscreen, element select | loading, built, build error |
| S08 | Version history | clock icon in project menu | undo a turn | slide-over panel: title + subtitle, search, Bookmarked versions (n), All versions (n), rows = label + date, hover rename/bookmark | one version, many, empty search |
| S09 | Publish popover | top-right Publish | ship it | title + help, "not published yet" / live URL, visibility row (Public/Private + Manage access), security row, primary Publish/Update, unpublish link, edit-subdomain pencil | before, published, updating, private |
| S10 | Project menu | click project name | manage one project | Open, Rename, Transfer to…, Delete, Duplicate, Download, Versions, Project settings | — |
| S11 | Account settings | profile → Settings | preferences + usage | left nav (General, Subscription & Tokens, Connected apps…), General: appearance, "Display token usage in chat", default model | — |
| S12 | Published site | `https://<slug>.bolt.host` | the shipped app | plain static site, no editor chrome | live, restricted (private), offline after unpublish |
| S13 | Mobile workspace | narrow width | check the app | chat cards per build, tap → full-screen preview, "Back to chat" | — |

## Flows

```
F01 Describe an app and get one (the core loop)
    S01 -> S02 (sign up) -> S05 building -> S05 preview
    happy path clicks: 2 (type, Build now) + auth
    edge: empty prompt, very long prompt, prompt with no UI words, build error,
          free daily token cap reached, refresh mid-build

F02 Sign in, sign out, wrong password
    S02 -> S03 sign out via account chip
    edge: unknown user, wrong password, signed-out deep link to /p/:id

F03 Iterate on a built app
    S05 prompt -> streaming steps -> files written -> preview reloaded
    happy path clicks: 2
    edge: "make it dark", "change the accent colour", "add a pricing section",
          nonsense prompt (must not silently do nothing), token cap

F04 Find and manage a project
    S04 search -> sort -> kebab: Open, Rename, Duplicate, Delete
    edge: 0 results, delete is permanent, rename to empty string

F05 Edit code by hand
    S06 open file -> type -> Save (or Cmd+S) -> preview refreshes
    edge: unsaved changes on view switch, create file, delete file, rename file

F06 Restore a version
    S08 open -> pick version -> preview that version -> Restore -> confirm
    edge: restore while streaming, restore the current version, rename, bookmark

F07 Publish
    S09 -> Publish -> live URL appears in chat -> open S12
    edge: publish twice (Update vs Publish), private vs public, change subdomain,
          unpublish takes the site offline, publish with no files

F08 Account + usage
    S11 -> theme switch -> show token usage -> see daily/monthly meters
    edge: cap reached, plan badge, sign out from settings
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary (accent), secondary (surface), ghost, danger, pill | hover, active, focus-visible, disabled, loading, icon-only | all |
| Prompt composer | landing (large), workspace (compact) | empty, typing, disabled send, streaming/stop, plan on/off | S01, S03, S05 |
| Mode chip | Website, Slides, App, Prototype | default, selected, "New" badge | S01, S03 |
| Project card | grid card | default, hover, starred, kebab open, missing thumbnail | S04 |
| Dropdown / popover | sort, filters, kebab, project menu, publish | closed, open, focused item | S04, S05, S09, S10 |
| Dialog | sign in, rename, delete confirm, share | open, submitting, error | S02, S04, S10 |
| Segmented view switch | Preview / Code | selected, hover | S05 |
| Address bar | `/` path + reload/new-window/responsive/fullscreen | idle, hover | S05, S07 |
| Chat message | user bubble, assistant block, step list, file chips | streaming, done, error | S05 |
| File tree | folders + files, context menu | selected, hover, read-only | S06 |
| Editor | tab bar, gutter, textarea | clean, dirty, saving | S06 |
| Terminal | Build / Publish / Shell tabs | expanded, collapsed, empty | S06 |
| Version row | list item | hover, rename, bookmarked, active | S08 |
| Usage meter | bar (daily), bar (monthly), inline in composer | normal, warning, capped | S05, S11 |
| Toast | success, error, info | auto-dismiss | all |
| Empty state | dashboard, chat, versions, search | — | S04, S05, S08 |

## Inferred data model

```
User       id, username, email, display_name, password_hash, plan, created_at
           evidence: S02 form says "Email or username"; S04 owner row shows
           email + avatar initial; sidebar shows handle + plan badge
           confidence: high
Session    token_hash, user_id, expires_at          confidence: high
Project    id, user_id, name, mode(website|app|prototype|slides), starred,
           created_at, updated_at
           evidence: S04 card, mode chips, project menu, Starred filter
           confidence: high
File       project_id, path, content, updated_at
           evidence: S06 tree, copy relative path, Save
           confidence: high
Message    id, project_id, role(user|assistant), content, meta(json: steps,
           files touched, tokens), created_at
           evidence: chat thread, per-message version restore in chat
           confidence: high
Version    id, project_id, label, files_snapshot, created_at, bookmarked
           evidence: S08 rows with names + timestamps, bookmarks, restore
           confidence: high
Deploy     project_id, slug, visibility(public|private), files_snapshot,
           published_at
           evidence: S09, S12, "Update" publishes later code only on demand
           confidence: high
Usage      user_id, day, tokens  (daily 300K, monthly 1M on Free)
           evidence: token article + settings
           confidence: high
Setting    user_id, theme, show_tokens, default_mode   confidence: medium
```

Relationships: User 1-n Project; Project 1-n File, Message, Version; Project
1-1 Deploy; User 1-n Usage.

## Feature matrix

See `features.csv`. Must 22, should 9, could 3, skip 8.

## Out of scope (cannot or should not be cloned)

- **WebContainer / real npm runtime.** Running Node in the browser, installing
  packages, Vite/HMR. Their runtime is licenced technology and a different
  product; this rebuild ships plain static projects that run in an isolated
  iframe, and says so.
- **Bolt Cloud** (databases, auth for generated apps, edge functions, hosting
  analytics, custom domains).
- **Model routing** ("Standard / Max", 98% fewer errors) — needs their models.
- **Figma import, GitHub App sync, Supabase, Stripe, Netlify, Google SSO,
  Expo/EAS mobile builds** — all need per-provider OAuth apps and keys.
- **Teams, roles, co-owners, transfer, comments, multiplayer, billing** —
  account network, not a screen.
- **The brand**: name, wordmark, blue, marketing copy, screenshots, icons.

## Size

Screens 13, flows 8, entities 8. Hard parts: a build agent that writes real
code without a model, keeping the preview isolated from the app, atomic
turn/version writes, publish snapshots that only change on demand.
Size: M-L (a few weeks of evenings). This rebuild: M.
