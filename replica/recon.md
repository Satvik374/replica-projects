# Recon map — spotify.com (logged-out web player)

Studied at 1024×768 from the public, logged-out site. No account, no source
code, no network capture. Reference screenshots in `replica/screens/`.

## Scope

| | |
| --- | --- |
| App | Spotify web player, public surface |
| Platform | Web, desktop-first, responsive down to 360px |
| Slice | Browse → select a track → transport controls (the paid loop) |
| Out of scope | Logged-in library, playlists, auth, billing, podcasts/audiobooks, real streaming |

## Sources

| source | what it gave |
| --- | --- |
| https://www.spotify.com/us/ → redirects to open.spotify.com | confirms the logged-out surface is the player shell |
| https://open.spotify.com/ (logged out) | shell layout, section inventory, component states |
| Screenshot `screens/01-home-desktop.png` | layout, hierarchy, colour, spacing |

## Screen inventory

| id | screen | purpose |
| --- | --- | --- |
| S01 | Shell / home | top bar + library panel + scrolling feed |
| S02 | Feed sections | Trending songs, Popular artists, Popular albums and singles, Popular radio, Featured Charts |
| S03 | Search results | filtered view of S02 cards |
| S04 | Empty search | "nothing found" state |
| S05 | Preview banner | footer CTA shown while nothing is playing |
| S06 | Now playing | footer transport bar, replaces S05 once a track is selected |
| S07 | Library empty state | promo cards, no saved items |

## Flows

- **F1 Browse:** land → scroll feed → click card art → S06 appears with that track loaded.
- **F2 Transport:** play/pause → seek → next/prev → shuffle/repeat → volume.
- **F3 Search:** focus search → type → S03; nonsense query → S04; clear → S01.

## Component list

TopBar (brand, home button, search field, browse button, link nav, divider, install, sign up, log in) ·
Panel (rounded surface) · LibraryHeader (title, add button) · PromoCard (title, body, pill button) ·
LegalLinks · LanguageButton · FeedSection (heading, Show all, chevron scroll buttons) ·
Card (artwork, play button on hover, title, subtitle) · Banner (eyebrow, body, CTA) ·
NowPlayingBar (art, meta, like, transport, progress, volume, queue/device).

## Design tokens (measured)

| token | value |
| --- | --- |
| page | `#000` |
| surface | `#121212` |
| surface raised | `#1f1f1f` |
| text | `#fff` |
| text subdued | `#b3b3b3` |
| accent | `#1ed760` |
| banner gradient | `linear-gradient(90deg, #af2896, #509bf5)` |
| panel radius | 8px |
| card radius | 6px |
| top bar height | 64px |
| library width | 280px @1024, 420px @≥1440 |
| section heading | 24px / 700 |
| body | 16px, secondary 14px, legal 12px |
| pills | fully rounded, 32/48px tall |

## Data model (inferred)

Track { id, title, artist, durationSec, hue pair, kind } ·
Artist { id, name, listeners } · Album { id, title, artist, year } ·
Section { title, kind, items[] } · Player { queue[], index, progress, playing, volume, shuffle, repeat }.

## Gotchas

- Feed scrolls inside its own panel; the page itself does not scroll.
- Sidebar is a separate rounded panel with 8px gutters on black.
- Card play button only appears on hover/focus, animated up + fade.
- Footer is sticky: banner before playback, transport bar after.
- Empty-state promos use raised surface cards inside the dark panel.
