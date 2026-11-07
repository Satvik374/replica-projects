# Recon — chatgpt.com (logged-out web app)

Observed 2026-11-06 at 1024×768 and 1440×900, light theme, no account.
Sources: the public page itself (accessibility tree, rendered screenshots, computed
styles). No HTML/CSS/JS bundles were read, no private endpoints called.

## What the public surface actually is

`chatgpt.com` does not show a marketing page to a logged-out visitor — it renders the
chat app itself, minus history. The page title is the only marketing-flavoured part.
So the replica target is **the anonymous chat surface**: sidebar, hero, composer, thread.

## Screens

| id | screen | notes |
| --- | --- | --- |
| C01 | home / empty | sidebar + centred hero + composer + one suggestion chip + legal line |
| C02 | conversation | user bubble right, assistant plain text left, composer docked to bottom |
| C03 | streaming | assistant reply arrives progressively; send button becomes a stop button |
| C04 | sidebar collapsed | sidebar hidden, toggle moves to the top-left of the content area |
| C05 | mobile home | off-canvas drawer, hamburger + brand in a top bar |

## Flows

- **F1 send**: type → Enter → user bubble appears right → assistant placeholder →
  reply streams → actions row appears under the reply.
- **F2 new chat**: sidebar "New chat" clears the thread and restores the hero.
- **F3 collapse**: toggle hides the sidebar; content reflows to full width.
- **F4 suggestion**: clicking the chip sends that text as a prompt.

## Layout

- Two columns: sidebar `260px` (`259` measured, `6px` gutters for nav rows) and main.
- Main content column `764` at 1024 → thread is content-width `732` (16px padding each side).
- Home: hero is vertically centred in the space above the dock; composer sits directly
  under it, chip `12px` below the composer, legal line pinned to the bottom.
- Conversation: thread scrolls, composer docks to the bottom with `24px` bottom margin.
- User bubble maxes at `70%` of the column; assistant text uses the full column.

## Tokens (measured)

| token | value |
| --- | --- |
| page bg | `#fcfcfc` (oklch 0.991 0 none) |
| surface | `#ffffff` |
| raised / quiet fill | `#f5f5f5` (oklch 0.964 0 none) |
| text primary | `#0d0d0d` (oklch 0.159 0 none) |
| text secondary | `#5d5d5d` (oklch 0.478 0 none) |
| hairline | `rgba(0,0,0,.1)`; stronger `rgba(0,0,0,.2)` |
| accent blue | `#0285ff` |
| user bubble | `#edf3ff`, text `#2451da`, radius `22px`, padding `10px 16px` |
| composer | `740×52`, radius `28px`, padding `7px 8px`, 1px `rgba(0,0,0,.1)` |
| composer shadow | `0 0 0 1px .04`, `0 2px 8px .04`, `0 4px 80px 8px .024` |
| nav row | `14px/20`, padding `8px 10px`, radius `10px`, letter-spacing `-0.15px` |
| hero heading | `24px/28`, weight `400`, letter-spacing `.07px` |
| composer text | `17px/24` |
| message text | user `16px/24`, assistant `16px/26` |
| pills | height `44px`, radius `999px`, `14px/600` |
| legal line | `12px/16`, secondary, centred |
| font | system UI stack (page reports `-apple-system-body`) |

## Component inventory

Sidebar header (brand + collapse), nav rows with optional external marker, footer sign-in
card, top-right account buttons, hero, composer (attach, input, dictation, send/voice),
suggestion chip, message list (user bubble, assistant prose, action icons), streaming
indicator, legal line, mobile drawer + scrim.

## Behaviour worth copying

- Composer grows with the text, up to a cap, then scrolls internally.
- Enter sends; Shift+Enter inserts a newline.
- Send is a muted circle until there is content; while generating it is a stop button.
- Assistant text is plain — no bubble, no avatar, no name; actions appear beneath it.
- The page never persists anything while logged out (refresh loses the thread).

## Gotchas

- Sidebar is `259–260px` and is not resizable while logged out.
- The hero is `24px` at weight 400 — much smaller than it looks in screenshots.
- The single suggestion chip sits *below* the composer, not above it.
- Legal line is pinned to the viewport bottom, not scrolled with the thread.
- User bubble text is blue, not neutral — easy to miss.
