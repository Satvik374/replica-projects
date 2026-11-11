# Recon — claude.ai (signed-in web surface)

Scope: the **signed-in web app** at claude.ai — the chat workspace, projects,
artifacts, styles, sharing, history and settings. Not the marketing site, not
Claude Code, not the mobile apps, not the API, not model training or the model
itself.

Sources read (public only, no account used):

| source | URL | what it gave |
| --- | --- | --- |
| Projects: what they are | https://support.claude.com/en/articles/9517075-what-are-projects | project workspaces, knowledge base, free limit of five projects, per-project memory |
| Projects: create and manage | https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects | create flow, "Set project instructions", add knowledge, star, archive, move chats in |
| Artifacts | https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them | artifact panel, templates (Docs/Slides/Design), sharing, per-plan availability |
| Styles launch post | https://www.claude.com/blog/styles | Normal / Formal / Concise / Explanatory presets, custom styles from samples or instructions |
| Configuring styles | https://support.anthropic.com/en/articles/10181068-configuring-and-using-styles | style picker sits by the model selector, switchable mid-chat, create & edit styles |
| Styles → skills | https://support.claude.com/en/articles/10181068-styles-are-moving-to-skills | the preset menu is being retired in favour of skills; custom styles migrate |
| Share a chat | https://support.claude.com/en/articles/10593882-share-and-unshare-chats | public snapshot as of share time, Private/Public dropdown, revoke |
| Public links | https://support.claude.com/en/articles/16762437-public-links-for-shared-chats | snapshot semantics, noindex, attachments excluded, manage under Settings → Privacy |
| Incognito chats | https://support.claude.com/en/articles/12260368-use-incognito-chats | ghost toggle, not saved to history or memory, cannot be converted |
| Personalization | https://support.claude.com/en/articles/10185728-understanding-claude-s-personalization-features | account-wide instructions vs project instructions, skills |
| User complaints (research only) | r/ClaudeAI, r/Anthropic, r/ClaudeCode threads listed in `../reviews.csv` | limits, opaque usage, project context retrieval, artifact bugs |

## S01–S20: screen inventory

| ID | screen | route / how you get there | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Home / new chat | `/new`, logo, or New chat | start a chat | greeting, composer, style/model chips, suggestion cards | signed in, first visit, empty recents |
| S02 | Conversation | `/chat/:id` | read the thread, continue it | message list, assistant avatar, action row, inline artifact card, composer | streaming, stopped, error, rate-limited, long thread |
| S03 | Sidebar (desktop) | always at ≥900px | navigate chats, projects, account | new chat, search, projects, starred, recents by date, plan meter, user pill | expanded, collapsed, empty, long list |
| S04 | Mobile drawer | hamburger under 900px | same as sidebar | scrim, drawer, close | open, closed, scroll |
| S05 | Search / command palette | `⌘K`, or Search in sidebar | find a chat or project, run commands | input, grouped results, keyboard hints | empty query, no results, results |
| S06 | Projects list | Projects in sidebar | browse and create project workspaces | header, grid of project cards, new project dialog, tabs | empty, filled, starred |
| S07 | Project detail | `/project/:id` | set instructions and knowledge, start project chats | title, instructions card, knowledge list, chat list, new chat | no instructions, filled, empty knowledge |
| S08 | Project chat | `/project/:id/chat/:chatId` | converse with project context on | project chip in composer, same thread UI | knowledge present, project archived |
| S09 | Artifact viewer | "View" on an artifact card | read, preview, iterate on generated work | tabs (Preview/Code), version select, copy, download, close | html preview, markdown, svg, code, multiple versions |
| S10 | Share dialog | Share button in chat header | make a public snapshot | visibility switch, link row, copy, revoke | private, public, copying, error |
| S11 | Shared chat (public) | `/s/:token` | read-only snapshot | header, transcript, "snapshot" banner, no composer | valid, revoked, missing |
| S12 | Settings → General | user menu → Settings | appearance and behaviour | theme radios, font size, reduce motion, suggestions | light, dark, system |
| S13 | Settings → Account | Settings tab | identity | name field, email, member since, plan, sign out | saved, error, signed out |
| S14 | Settings → Usage | Settings tab | see plan limits | plan card, progress meters, reset time, upgrade button | under limit, near limit, at limit |
| S15 | Settings → Customize | Settings tab | styles, instructions, skills | style list, editor, account instructions | built-in only, custom added, editing |
| S16 | Settings → Privacy | Settings tab | control data | shared chats list + unshare, export, delete account | no shares, shares listed, delete confirm |
| S17 | Settings → Shortcuts | Settings tab | keyboard reference | shortcut table | static |
| S18 | Sign in / Sign up | signed-out CTA or `/` | create or resume an account | dialog, email, password, name, errors | validation, wrong password, duplicate email, throttled |
| S19 | Incognito chat | ghost toggle in sidebar / home | a chat that is never saved | dark border, "Incognito" label, no history row | on, off, closed with warning |
| S20 | Rate-limit state | after the message budget is spent | explain the pause | banner or dialog, reset countdown, plan link | warning at 80%, blocked at 100% |

## F01–F13: user flows

```
F01 Sign up and start chatting
    S18 → S01 → S02 (first reply)
    4 clicks. edge: duplicate email, weak password, offline, already signed in

F02 Ask, stream, stop, retry
    S02: send → typing → streamed tokens → stop mid-stream → retry
    edge: empty composer, 8k-char prompt, double submit, reload mid-stream

F03 Attach a file and ask about it
    S02: + → attach .md/.txt/.csv → chip appears → send → reply cites the file
    edge: 2MB file, unsupported type, remove chip, attach then reload

F04 Project with instructions and knowledge
    S06 → new project → S07 → add instructions → add knowledge file →
    new project chat → S08, project chip visible
    edge: no instructions, archived project, 5-project limit on Free

F05 Artifact: generate, preview, iterate
    S02 → reply card "View" → S09 preview → Code tab → copy → ask for a change →
    version 2 selected
    edge: preview sandbox errors, very long code, mobile panel

F06 Find an old chat
    ⌘K → query → result → S02
    edge: no results, accent/emoji query, query matching a project

F07 Rename, star, delete a chat
    S03 hover row → menu → rename inline / star / delete → confirm
    edge: empty title, duplicate title, delete the open chat

F08 Share a chat, then revoke
    S02 → Share → S10 → make public → copy link → open /s/:token signed out →
    back → private → link dead
    edge: share while streaming, revoke then reopen, open a revoked link

F09 Incognito
    S19 → send a message → close → not in recents, not in search, not in export
    edge: reload loses it (by design), can't share, can't star

F10 Custom style
    S15 → create style with instructions → S01 chip → send → reply follows style
    edge: empty name, 2k-char instructions, delete a style in use

F11 Settings that follow the account
    S12 change theme and font size → sign out → sign in on a second browser →
    same settings
    edge: signed out (device-local), offline save

F12 Export and delete
    S16 → export JSON → delete account → session dead, data gone
    edge: delete while another tab is open, cancel confirmation

F13 Hit the usage limit
    S14 → meters → send past the budget → S20 → reset countdown
    edge: already at limit on load, two tabs, upgrade button (mock)
```

Clicks on the core loop (F02, new chat to first reply): **2** (type, send).

## Components

Composer (textarea, growing to 200px, plus menu, model select, style select,
thinking toggle, send/stop), message bubble, assistant message with action row,
artifact card, sidebar row (hover menu, inline rename), section header, plan
meter, avatar, dialog/sheet, settings tabs, project card, knowledge row, style
card, toggle switch, segmented radio group, toast/status region, command
palette, banner, empty state, skeleton lines, tooltip, chip.

Full specs in `design/components.md`.

## Inferred data model

```
User      id, email, password_hash + salt, name, plan, created_at        high
Session   token_hash, user_id, created_at, expires_at                    high
Prefs     user_id, theme, font_size, motion, suggestions, model,
          style_id, thinking, instructions, updated_at                   high
Project   id, user_id, name, description, instructions, starred,
          archived, created_at, updated_at                               high
ProjectDoc id, project_id, name, content, size, created_at               high
Chat      id, user_id, project_id?, title, model, style_id, thinking,
          starred, share_token?, shared_at?, created_at, updated_at      high
Message   id, chat_id, role, content, thinking?, artifacts?, attachments?,
          feedback, seq, created_at                                      high
Artifact  id, title, kind (html|markdown|svg), code, versions[]         high
Style     id, user_id, name, description, instructions, builtin          high
Share     chat_id, token, shared_at, snapshot_message_seq               high
Usage     user_id, window_start, messages_used, tokens_used              medium
```

Evidence: the project help articles name instructions, knowledge and per-project
memory; the share articles name snapshot-at-share-time semantics and attachments
excluded from snapshots; style articles name presets plus instruction-defined
custom styles. The usage shape is inferred from the settings → usage page and the
public complaints about opaque limits — **medium confidence**, and this build
publishes its own counting rule rather than pretending to know theirs.

## Out of scope (skip)

- Licensed model weights and real inference. This build ships a scripted reply
  engine behind a real streaming transport, and says so.
- Web search results, connectors/MCP, code execution in artifacts, Claude Code,
  team/enterprise project sharing and organisation accounts.
- Real billing and real payment processing. Plan/usage UI is local and mocked.
- Anthropic's brand, copy, logo, screenshots, fonts and any private API.

## Size

**M.** 20 screens, 13 flows, 9 entities. The hard parts: streaming with stop and
retry, artifact previews in a sandboxed frame, per-user scoping on every query,
and share snapshots that must not leak later messages. No realtime sync, no
payments, no email, so no third-party integration risk.
