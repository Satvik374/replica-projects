# Test plan — Alcove

Cases are numbered per flow from `recon.md`. Automation: `claude-clone/scripts/api-test.py`
(45 checks, stdlib only) against `wrangler dev` + local D1. Browser passes are
manual, in the Cloud browser at 1440×900 and 390×844.

## F01 Sign up and start chatting

- H1 create account with name, email, eight-character password → home, signed in.
- E1 duplicate email → 409, error on the email field.
- E2 weak password → field error, nothing sent.
- E3 invalid email → field error.
- E4 submit twice quickly → button disabled while in flight.
- N1 wrong password on sign in → one message, no field leak.
- N2 9 failed logins → 429 with a wait message (per isolate).

Automated: H1, E1, E2, E3, N1. Manual: E4, N2.

## F02 Ask, stream, stop, retry

- H1 send → typing dots → streamed tokens → actions appear; reload keeps both messages.
- H2 stop mid-stream → partial text stays, marked stopped, saved once.
- H3 regenerate → previous reply replaced, no duplicate rows.
- H4 edit a sent message → later messages truncate, new reply streams.
- E1 empty composer → nothing happens, send stays disabled visually.
- E2 60,000-character prompt → accepted, no layout break.
- E3 Enter sends, Shift+Enter adds a newline.
- E4 double submit → second press stops, does not send again.
- N1 message containing "simulate an error" → error card with Try again; retry succeeds.
- N2 usage exhausted → 429, usage panel opens with reset time.

Automated: message persistence, ordering, usage counting, 429 boundary, truncate.
Manual: H2, H3, H4, E3, N1.

## F03 Attach a file and ask about it

- H1 attach a .md file → chip with name and size → reply names the file and quotes it.
- E1 400 KB+ file → refused with a readable message, no chip.
- E2 unsupported type → stored as a text attempt; images stay preview-only.
- E3 remove a chip before sending → nothing is sent.
- E4 11 files → only 10 accepted.

Automated: attachment JSON persists on the message and is returned by the API.
Manual: all four edge cases.

## F04 Project with instructions and knowledge

- H1 create project → open → save instructions → add a knowledge file → start a chat.
- H2 project chat shows the project chip and the instructions intro.
- E1 sixth project on Free → 403 with the cap named.
- E2 delete a knowledge file → gone from the project payload.
- E3 project with no instructions → thread still works, copy says what to add.
- E4 move a chat into and out of a project.

Automated: H1, E1, E2, project isolation between two accounts. Manual: E3, E4.

## F05 Artifact: generate, preview, iterate

- H1 "build a dashboard page" → artifact card → panel preview renders → Code tab shows source.
- H2 ask for a colour change → new version, old version still selectable.
- E1 download → correct extension and contents.
- E2 copy → clipboard payload equals the visible version.
- E3 mobile → panel becomes a full-screen sheet, close returns focus.
- E4 artifact cannot read the session cookie (sandbox has no same-origin).

Automated: artifact round-trips through D1 and appears in the public snapshot.
Manual: H1, H2, E1–E3. E4 is a property of `sandbox="allow-scripts"` with no
`allow-same-origin`, checked by inspection rather than a test.

## F06 Find an old chat

- H1 ⌘K → type a word from a message → result opens the chat.
- E1 no match → "Nothing matches", no console error.
- E2 accents and emoji in the query → no crash.
- E3 query matching a project name → project row appears above chats.

Automated: `GET /api/chats?q=` matches message bodies. Manual: H1, E1–E3.

## F07 Rename, star, delete

- H1 row menu → rename → title updates in the row and the topbar.
- H2 star → appears in Starred; unstar → back in date group.
- H3 delete → confirm → chat and messages gone; open chat navigates home.
- E1 empty rename → reverts.
- E2 delete the open chat → home, no 404 flash.
- E3 rename with 120 characters → sidebar truncates, topbar ellipsis.

Automated: patch/delete endpoints and ownership. Manual: H1–H3, E1–E3.

## F08 Share, then revoke

- H1 share → link → open in a signed-out tab → snapshot renders read-only.
- H2 send another message → refresh the public page → new message absent.
- H3 revoke → link 404s, Privacy list empties.
- E1 share while streaming → snapshot excludes the in-flight reply.
- E2 open a revoked link → "This link is not available".
- E3 attachment in a shared chat → not in the public payload.

Automated: H1, H2, H3, E3. Manual: E1, E2.

## F09 Incognito

- H1 toggle → send → thread works; no row in Recents.
- H2 close or reload → thread gone.
- E1 cannot share or star.
- E2 not in search and not in export.
- E3 leaving incognito via any navigation clears it.

Manual: H1–E3. There is no incognito row to test on the server by design.

## F10 Custom style

- H1 create a style with instructions → it appears in the composer menu → sending uses it.
- E1 empty name → field error.
- E2 instructions under ten characters → field error.
- E3 delete a style in use → selection falls back to Normal.

Automated: style CRUD, 20-style cap. Manual: H1, E3.

## F11 Settings that follow the account

- H1 change theme and text size → sign out → sign in on a second context → same.
- E1 signed out → changes persist on the device only.
- E2 server unreachable → local change still applies, sync failure is not silent
  in the code path (toast on failure).
- E3 system theme change with Theme = System → follows without reload.

Automated: settings round-trip. Manual: E1, E3.

## F12 Export and delete

- H1 export → JSON download containing account, settings, chats with messages,
  projects with knowledge, styles.
- H2 delete account → session dead, overview 401, login fails.
- E1 cancel the confirmation → nothing deleted.
- E2 export while signed out → 401, no file.

Automated: H1, H2. Manual: E1.

## F13 Hit the usage limit

- H1 usage panel shows used/limit, reset time, counts.
- H2 429 at the boundary, composer marked blocked, message names the reset.
- E1 reload at the limit → still blocked with the same reset time.
- E2 second tab → same window because it is stored, not in memory.

Automated: 429 at the boundary, usage increments once per user message.
Manual: E1, E2.

## Not covered

- Real model output quality (there is no model).
- Email, payments, OAuth — none are wired.
- Screen reader passes with NVDA/VoiceOver: landmarks and labels are in place,
  but no assistive-technology session was run.
- Playwright specs were not run: `preview_playwright` in this environment failed
  with an internal serialisation error. Browser checks used the Cloud browser's
  click/evaluate/screenshot tools instead, at 1440×900 plus a 390px iframe for the
  drawer and mobile layout.
- The mobile layout was verified in a 390px iframe (drawer opens, scrim shows,
  sidebar 300px, hamburger visible). It was not tested on a physical phone.
- Visual diff against the original: no signed-in screenshots were captured (there
  is no account here and the signed-in UI is behind it), so `imgdiff` has nothing
  to compare. Feature parity is measured; layout parity is unverified by tool.
