# Marlowe — a chat surface, rebuilt

A clean-room rebuild of the logged-out assistant surface on chatgpt.com: the same
structure, spacing rhythm and states, with a different brand, different copy and a
scripted reply engine. On top of that it now has **real email + password accounts**,
a **settings dialog** that syncs with the account, and a small Worker API in front
of the static app. No model behind the replies, no third-party services, no secrets.

Live: <https://site-1bacdba7e3d345ef9e4bfe6f6a52b45d.freebuff.page/> (Sites preview)

## Run it

```bash
npm install
npm run dev        # wrangler dev on http://localhost:8788
```

`wrangler dev` runs the Worker and a local D1 database in workerd, so accounts work
offline. The database schema is created on first use — there is no migration step.
The static files alone also work without the API: drop `public/` on any static
host and the chat runs, with accounts showing "Accounts are unavailable" instead of
silently failing.

```bash
npm run check      # node --check on the three scripts
```

## What is here

| Path | Contents |
| --- | --- |
| `public/index.html` | Shell, inline icon sprite, composer, thread, both dialogs |
| `public/styles.css` | Tokens first, then components, then breakpoints |
| `public/app.js` | Reply engine, mini-markdown, streaming, sidebar, drawer |
| `public/account.js` | Sign in and sign up, session, account menu, settings |
| `worker.js` | Static assets plus `/api/*`: accounts, sessions, settings |
| `wrangler.jsonc` | Local dev: Worker, assets, D1 binding `DB` |
| `deploy.json` | Sites deploy manifest (ES module + `public/` assets) |
| `site.json` | Site id and environment URLs for this deployment |

## Accounts

Email and password, nothing else. The flow:

1. **Create account** or **Sign in** in the top bar (or the sidebar card).
2. The Worker checks the email, hashes the password with PBKDF2-SHA256 (60,000
   iterations, 16-byte random salt) and stores the hash — never the password.
3. A 32-byte random token is returned in an `HttpOnly; SameSite=Lax; Secure`
   cookie; only its SHA-256 hash is stored in `sessions`, so a database leak does
   not hand out live sessions.
4. The session lasts 30 days. Signing out deletes the row and clears the cookie.

| Endpoint | What it does |
| --- | --- |
| `POST /api/auth/signup` | Create an account, start a session |
| `POST /api/auth/login` | Start a session; one message for any failure |
| `POST /api/auth/logout` | Delete the session, clear the cookie |
| `GET /api/auth/me` | The current user, or `null` |
| `GET`, `PUT /api/settings` | Read or replace this user's settings |
| `PATCH /api/account` | Change the display name |
| `DELETE /api/account` | Delete the account, its sessions and settings |
| `GET /api/health` | Liveness plus whether the database is bound |

Safety rails, in the order they run: `Origin` and `Sec-Fetch-Site` must match the
site for every mutation; passwords are hashed even when the email does not exist so
timing does not reveal which accounts are real; comparisons are length-independent
digest comparisons; login attempts are throttled per IP + email; every read and
write is scoped by the session's user id, never by an id from the request body.

Honest limits: the throttle lives in Worker memory, so it is per-isolate and
best-effort; 60,000 PBKDF2 iterations is a deliberate CPU-budget choice for a demo,
not the OWASP recommendation; there is no email verification or password reset
because there is no mail service behind it.

## Settings

The settings row in the sidebar and the account menu both open one dialog with
three sections:

| Section | What it holds |
| --- | --- |
| General | Theme (System / Light / Dark), suggested prompts, reduce motion |
| Account | Display name, email, member since, sign out |
| Data controls | Export the stored account as JSON, delete the account |

Signed out, the General tab still works: settings are kept in `localStorage` on the
device. Signing in syncs them to the account, and on the next device the account
wins. The theme is resolved by a tiny inline script **before first paint**, so there
is no flash and the dark token block has exactly one home in `styles.css`.

## States the interface ships

| State | How to reach it |
| --- | --- |
| Home / empty | Load the page, or press **New chat** |
| Typing indicator | Send anything — three dots for ~450ms before text |
| Streaming, stopped, complete | Every reply streams; the send button stops it; stopping keeps and tidies the partial text |
| Error + retry | Send a message containing "error" |
| Signed out / signed in | Top bar and sidebar swap; the avatar menu holds Settings and Sign out |
| Sign-in validation | Submit empty → field errors; wrong password → one banner message |
| Duplicate email | Create an account with an existing address → 409 on the email field |
| Settings, signed in and out | Every control is interactive in both states |
| Dark | Theme setting, or the operating system preference |
| Mobile | Below 900px the sidebar becomes a drawer; below 560px dialogs become bottom sheets |

## Keyboard and accessibility

- **Enter** sends, **Shift+Enter** inserts a newline, the textarea grows to 200px.
- Dialogs are native `<dialog>` elements: focus is trapped, **Escape** closes, and
  focus returns to whatever opened them.
- Every field has a label; errors are tied to their input with `aria-invalid` and
  `aria-describedby`; the account menu is a labelled `menu`.
- The avatar is a 44px target with an initials circle inside it.
- Landmarks: `complementary` sidebar, `main`, `role="log"` thread, `status` region
  for announcements.
- Contrast: body 18.9:1, secondary 6.4:1, bubble 5.8:1, placeholder 4.9:1; the dark
  token set was checked as well. White glyphs on `--accent` are 3.6:1, above the
  3:1 bar for UI graphics.
- `prefers-reduced-motion` and the Reduce motion setting both collapse transitions.

## Tokens

Everything visual is a token in `:root`; `[data-theme="dark"]` only reassigns values.

| Token | Value | Used for |
| --- | --- | --- |
| `--bg` | `#fcfcfc` | Page and sidebar |
| `--surface` | `#ffffff` | Composer, cards, dialogs |
| `--text` | `#0d0d0d` | Body copy, primary button fill |
| `--text-2` | `#5d5d5d` | Nav labels, secondary copy |
| `--text-3` | `#6f6f6f` | Placeholder, disabled glyphs (4.9:1) |
| `--bubble` / `--bubble-ink` | `#edf3ff` / `#2451da` | User message |
| `--accent` | `#0285ff` | Send and voice buttons |
| `--seg-bg` | `#eeeeee` | Segmented control track |
| `--danger` | `#b42318` | Errors, destructive button |
| `--sidebar-w` | `260px` | Sidebar column |
| `--composer-w` | `740px` | Composer pill and chip row |
| `--composer-min-h` | `52px` | Single-line composer height |
| `--sheet-w` / `--settings-w` | `400px` / `720px` | Dialog widths |

## Fidelity notes

Measured from the live site during recon (`../replica/chatgpt/recon.md`): 260px
sidebar, 740×52 composer with a 28px radius, 24px/400 hero, 16px/26 assistant copy,
17px/24 composer text, 22px user-bubble radius, 12px legal line pinned to the viewport
bottom.

Deliberate deviations:

- Brand, markup, icons and every string are original. The spark mark is drawn for this
  build; no logo, font or image is borrowed.
- Replies are scripted: seven scripted answers, an error trigger and a fallback that
  restates the topic. The transport is real — typing delay, streamed tokens, stop,
  regenerate, error.
- The thread column is 768px at desktop rather than 732px, so long code lines breathe.
- Accounts, settings and data controls are this build's own: the logged-out reference
  has no session to inspect and nothing behind a sign-in form.

## Screenshots

In `../replica/chatgpt/clone-screens/`: `01`–`06` the original surface, `07`–`08`
auth and settings at 390, `09`–`10` sign-in and settings at 912, `11` the deployed
dark theme signed in.
