# Bugs — Alcove

Only reproduced bugs are listed. Suspected issues that were fixed by inspection
are in "To check" at the bottom, not presented as confirmed.

| id | severity | what | steps | expected | actual | status |
| --- | --- | --- | --- | --- | --- | --- |
| B01 | S3 | Mobile hamburger visible at desktop width | Open `/` at 1440×900 | Only the sidebar and topbar title; no drawer trigger | A second menu button sat left of the chat title | Fixed: `.topbar .topbar__menu` now wins over `.icon-btn`'s `display`, shown only under 900px. Verified in the 1440 screenshot after the fix. |
| B02 | S3 | Signed-out home repeated its call to action | Open `/` signed out | One invitation to sign in | Sidebar CTA plus an "empty workspace" block with two more buttons | Fixed: removed the duplicate block; the composer and suggestions remain. Verified in the browser. |
| B03 | S4 | Console warning about password fields outside a form | Open Settings → Account | No console noise | Chrome logged "Password field is not contained in a form" twice | Fixed: the password-change fields are wrapped in a form with `onsubmit` prevented. Rechecked console. |
| B04 | S5 | Test suite expected the Free project cap one project early | Run `scripts/api-test.py` | Sixth project refused | Fifth project refused the test, because it had only created four | Test bug, not app bug: the suite now creates five, then asserts the sixth is refused. 45/45 pass. |
| B05 | S2 | A partial reply could be saved into the wrong chat | Reasoned from the code path: send, then open another chat before the stream ends | The partial reply saves to the chat it started in | Save used the current `state.chat.id` | Fixed before it was reproducible in the UI: `beginReply` captures the target chat id and incognito flag at start. Re-ran the API suite and manual stream/stop pass. |
| B06 | S2 | Artifact replies contained a stray line reading `true` | Send "build a small dashboard page" and read the reply | A sentence describing the artifact | "Here is a first pass at …" then `true` on its own line, then the sections | Fixed. A duplicated ternary line made `kindLine` a boolean and left the intended string in a dead statement; removed the duplicate and rewrote the opener. Verified with `generateReply` in Node (no `true` line) and in the browser. |
| B07 | S3 | Markdown headings rendered at body size | Open any reply with `###` headings | Headings visually distinct | Serif but 15.9px, so they read as paragraphs | Fixed: h1/h2/h3 scale and weight raised. Verified in the dark settings screenshot's chat behind it. |

## To check (not confirmed)

- Two tabs sending at once can both append a message; ordering is by `seq`, so
  the worst case is two messages, not lost data. Not reproduced.
- Login throttling is per isolate and resets on deploy. Not a correctness bug for
  a demo, but it is not a global limiter.
- `wrangler dev`'s local D1 is per working directory; clearing `.wrangler/` loses
  local accounts by design.

## Fixed and verified

- Streaming, stop, regenerate and edit: browser pass at 1440×900.
- Share snapshot boundary, revocation and attachments: 45-check API suite.
- Second-account isolation on chats, projects and overview: API suite.
- Account deletion clearing sessions and data: API suite.
