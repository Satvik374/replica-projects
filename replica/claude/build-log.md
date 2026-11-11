# Build log — Alcove

Built in the repo's established pattern: static ES modules + one Worker + D1, no
build step, `wrangler dev` for local, Sites manifest for deploy. Screens follow
`recon.md`; states and copy are Alcove's own.

| screen | state | notes |
| --- | --- | --- |
| S01 Home | done | greeting by time of day, four suggestion cards, recent chats, signed-out variant |
| S02 Conversation | done | streaming, stop, regenerate, edit-and-resend, copy, thumbs, error + retry, stopped marker |
| S03 Sidebar | done | starred, date-grouped recents, hover menu, inline rename, project links, plan meter |
| S04 Mobile drawer | done | scrim, focus return, closes on navigation |
| S05 Search / palette | done | chat titles + message bodies + projects + actions, keyboard nav, move-to-project mode |
| S06 Projects list | done | cards, counts, star, archive/delete from detail, five-project cap surfaced |
| S07 Project detail | done | instructions editor, knowledge upload/remove, project chat list |
| S08 Project chat | done | project chip in the topbar, instructions in the thread intro, knowledge referenced by the engine |
| S09 Artifact viewer | done | preview/code tabs, sandboxed iframe, versions, copy, download, mobile sheet |
| S10 Share dialog | done | switch, link, copy, revoke, snapshot explanation |
| S11 Shared chat page | done | read-only, no composer, noindex header, revoked and missing states |
| S12 General settings | done | theme, text size, motion, suggestions; device-local when signed out |
| S13 Account settings | done | name, email, member since, plan, password change, sign out, sign out everywhere |
| S14 Usage | done | meter, reset countdown, chats/projects counts, plan card (mock upgrade) |
| S15 Customize | done | presets, custom style create/edit/delete, standing instructions |
| S16 Privacy | done | shared chat list + unshare, export JSON, delete account with confirm |
| S17 Shortcuts | done | table |
| S18 Auth | done | sign up / sign in, field errors, duplicate email, throttling message |
| S19 Incognito | done | ghost toggle, dark chip, memory-only thread, cleared on leave |
| S20 Rate limit | done | warning class at 70%, blocked at 100%, 429 handled with the reset time |

Feature matrix: `features.csv` — every counted row `yes`, nine deliberate `skip`
rows with reasons. Parity: 100/100.

## Harder than it looked

- **Streaming with stop and retry** needed the reply text, the saved row and the
  DOM node to agree after an abort. The first pass read `state.chat.id` at save
  time, which would write a partial reply into whatever chat was open. Now the
  target chat and incognito flag are captured when the reply starts.
- **Share snapshots.** A boolean `shared` is not enough. `shared_seq` had to be
  captured at share time and applied on read, or messages sent later leak into an
  old link. Attachments are excluded from the public payload by construction.
- **Artifact versions.** Revisions must keep the old code. The engine appends the
  previous `code` to `versions` before writing the new one, and the panel numbers
  them oldest to newest.
- **Settings sync direction.** Signed out the device is the source; on first
  sign-in the account wins unless the account is still entirely default, in which
  case the device seeds it. Both paths are tested by hand.
- **Hidden panels.** `[hidden]` is a UA style and author `display:flex` beats it.
  Without an explicit `[hidden] { display: none !important }` the artifact panel
  would be in the grid at all times.

## Known gaps, stated rather than hidden

The reply engine is scripted. Model tiers change depth, length and speed, and
styles change structure, but no language model is called. There is no web search,
no code execution, no connectors, no cross-chat memory, no billing and no email.
Each is a `skip` row with a reason.
