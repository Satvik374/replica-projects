# Claude.ai UI clone — report

## What was captured

- Public `/login` at 1024×768 DPR 2: computed background, surfaces, type tuples, button/input boxes.
- Signed-in `/new` at 1024×768 with the owner's authorized account: sidebar box and divider, nav rows, greeting box and mark, composer card, plan row, link colour.
- Chat route, settings sheet and a 390×844 iframe were inspected on the rebuilt app.

Not captured: 1440×900, 768×1024 and reference chat/settings screenshots. The cloud browser's viewport is fixed and `preview_playwright` failed to attach (`browserType.connectOverCDP` timeout). `imgdiff.py` could not run because reference images were not written to disk.

## Measured values applied

| token | value | source |
| --- | --- | --- |
| page background | `#ffffff` | computed body/main |
| sidebar | `#fafafa`, 288px, 1px `rgba(0,0,0,.1)` divider | computed `aside` |
| text | `rgba(0,0,0,.9)` → `#1a1a19` | computed |
| muted | `rgba(0,0,0,.6)` → `#5c5c5c` | computed |
| accent | `#d97757` | computed SVG fill |
| link | `#1757ac` | computed Upgrade link |
| UI type | 14px / 21px, weight 435 | computed |
| greeting | serif 38px / 47.5px, weight 330 | computed box |
| composer | 588×103, radius 14, padding 8, `0 4px 20px rgba(0,0,0,.075)` + inset ring | computed card |
| rows | 32px high, radius 8, 5px padding | computed New/Search/chat rows |
| marks | 36px greeting, 26px sidebar | computed boxes |

## Applied in the clone

- Neutral two-tone shell, terracotta accent, blue links, no green.
- 288px sidebar, 32px rows, 8px radii, gray active/pressed fills.
- Inline 36px mark + 38px/330 serif greeting, 12px gap.
- Floating composer with measured radius/shadow/inset ring, 15px text, terracotta send.
- Serif conversation body at 16px, 12px gray user bubbles, `#ececec` active chat.
- Settings rail `#fafafa`, active tab `#ececec`, 16px dialog radius.
- Dark skin: `#262624` canvas, `#1f1e1d` sidebar, `#30302e` surface.

## Checks

| check | result |
| --- | --- |
| `npm run check` (Worker + every client module) | pass |
| `contrast.py` on the new role tokens | **32 pairs, 0 failing AA** |
| Console on home/chat/settings | no errors; one Chrome password-form accessibility warning (verbose) |
| Desktop home at 1024 | verified, light and dark |
| Chat at 1024 | verified: 12px bubble, 720 thread, 14px composer |
| Settings at 1024 | verified: rail, tabs, switches |
| 390×844 iframe | loaded; greeting 26px; one horizontal-overflow bug found (recent-card min-content) and fixed with `minmax(0, 1fr)` + `max-width: 100%` |
| 1440×900 / 768×1024 | **not verified** |
| Pixel diff ≥ 90 | **not run** — no persisted reference images |

## Three closest details

1. Sidebar surface and 288px geometry, including the 1px `rgba(0,0,0,.1)` divider.
2. Serif greeting with the terracotta mark inline: 38px/47.5px at weight 330, 12px gap.
3. Composer: 14px radius, 8px padding, the shadow plus inset ring, 15px text and circular terracotta send.

## Three furthest details

1. The mark is Alcove's arch, not the reference starburst; the wordmark and copy are Alcove's.
2. Source Serif 4 / Inter substitute Copernicus / Styrene; letterforms differ slightly.
3. Home content differs: this build keeps four suggestion cards and a usage meter the reference's 2026 home does not show.

## Next fix

Remove the duplicate "New chat" title in the topbar on the home route, and move the plan/usage affordance to the top centre as in the reference. Then capture 1440/768 properly with a Playwright-capable browser and run `imgdiff.py`.

## Legal note

This is a study replica of a public interface. Publishing a pixel-identical copy of claude.ai would reproduce its trade dress. The clone keeps an original name, mark, icon set and copy, but the design language is intentionally derived; review before a public launch.
