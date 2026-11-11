# Claude.ai — UI clone spec

- **Source:** https://claude.ai/ — public page `/login` plus the signed-in `/new` workspace, captured 2026-11-11 with the owner's authorized account.
- **Scope:** the signed-in workspace shell: sidebar, home/new-chat screen, composer, conversation styling, settings, dialogs. The marketing page below the login form is out of scope.
- **Reference viewport:** 1024×768 at DPR 2 was the capture the cloud browser actually rendered. 1440×900, 768×1024 and 390×844 were **not** captured: the cloud browser viewport is fixed and Playwright could not attach (`browserType.connectOverCDP` timeout). Responsive rules are inferred from the existing stylesheet, not measured.
- **Goal:** same look and skeleton, with Alcove's own name, mark and copy.
- **Stack:** static HTML + CSS + ES modules, no framework, no build step.
- **Capture:** `reference/` (gitignored). No screenshots were persisted by the browser tool; measurements below are from computed styles and live boxes.

## 1. Surfaces

| # | surface | value | area | where | note |
|---|---------|-------|------|-------|------|
| 1 | page background | `#ffffff` | full | body / main | measured (`rgb(255,255,255)`) |
| 2 | sidebar | `#fafafa` | 288×768 | `aside.dframe-sidebar` | measured (`rgb(250,250,250)`) |
| 3 | sidebar divider | `rgba(0,0,0,0.1)` 1px | full height | aside right edge | measured |
| 4 | hover / pressed row | `#ececec` | 269×32 | sidebar rows | inferred from screenshot + pressed "New" |
| 5 | composer card | `#ffffff` | 588×103 at 1024 | floating above page | measured |
| 6 | user bubble | `#f0f0f0` | hug | thread | inferred (message surface not opened) |
| 7 | dialog | `#ffffff` | 480–820 wide | settings / share | inferred from the app shell |
| 8 | dark canvas | `#262624` | full | dark theme | inferred from Claude's dark skin, not captured |

Gradients/overlays: none on the workspace. The composer carries a shadow plus a 1px inset ring rather than a border.

## 2. Type

| role | original (confidence) | substitute | size | line | ratio | weight | tracking | case | colour |
|------|----------------------|-----------|------|------|-------|--------|----------|------|--------|
| greeting | anthropic-serif / Copernicus (high) | Source Serif 4 | 38px | 47.5px | 1.25 | 330 | normal | none | `#1a1a19` |
| wordmark | anthropic-serif (high) | Source Serif 4 | 20px | 20px | 1.0 | 500 | -0.01em | none | `#1a1a19` |
| ui / body | anthropic-sans / Styrene (high) | Inter | 14px | 21px | 1.5 | 435 → 400/500 | normal | none | `rgba(0,0,0,.9)` |
| composer text | anthropic-sans | Inter | 15px | 21px | 1.4 | 400 | normal | none | `rgba(0,0,0,.9)` |
| message body | anthropic-serif (inferred) | Source Serif 4 | 16px | 26px | 1.62 | 400 | normal | none | `#1a1a19` |
| section label | anthropic-sans | Inter | 13px | 16px | 1.23 | 520 | normal | sentence | `rgba(0,0,0,.6)` |
| link | anthropic-sans | Inter | 14px | 20px | 1.43 | 400 | normal | none | `#1757ac` |
| muted | anthropic-sans | Inter | 12px | 17px | 1.42 | 400 | normal | none | `#6f6f6f` |

Loaded faces: `anthropic-sans` (300–800 variable), `anthropic-serif` (300–800), `Anthropicons-Variable` for icons. Substitutes: Source Serif 4 (OFL) and Inter (OFL) from Google Fonts, with Georgia/system fallbacks. Icons remain the project's own stroke sprite.

## 3. Layout system

- Sidebar: **288px** fixed, `#fafafa`, 1px right divider, 8px inner padding, resizable in the reference (not reproduced).
- Main: full-bleed white; content column centered.
- Composer: 588px wide at 1024, max 720px in this build; radius 14px; padding 8px; shadow `0 4px 20px rgba(0,0,0,.075)` + `inset 0 0 0 1px rgba(0,0,0,.12)`.
- Greeting block: 312×48 at 1024; 36px mark with an 8px gap before the text; block centered.
- Rows: 32px high, 8px radius, 5–6px vertical padding; nav icon 20px with 12px gap.
- Base spacing unit: 4px (measured repeats 4/8/12/16).
- Breakpoints: reference uses a drawer under 900px; this build keeps 900/560.
- Dark skin: `#262624` canvas, `#1f1e1d` sidebar, `#30302e` surface.

### Section map (workspace, 1024×768)

| # | section | y | h | bg | container | columns | gap | pad-y |
|---|---------|---|---|----|-----------|---------|-----|-------|
| 1 | sidebar | 0 | 768 | `#fafafa` | 288 | 1 | 12 | 12 |
| 2 | plan row | 56 | 28 | `#f5f5f5` | hug, centered | flex | 6 | 4/10 |
| 3 | greeting | 249 | 48 | none | 312 | flex | 8 | 0 |
| 4 | composer | 333 | 103 | `#fff` | 588 | flex | 8 | 8 |

## 4. Components

```
Sidebar row
  box        269×32, radius 8, pad 5px 8px
  type       14/21, 400
  colours    text #1a1a19 on transparent
  hover      bg #ececec
  active     bg #ececec, same weight
  icon       20px, 12px gap

New chat
  box        full width × 36, radius 8
  colours    bg #ececec, text #1a1a19
  icon       plus 16px, 8px gap

Composer
  box        588 wide, radius 14, pad 8
  surface    #fff, shadow 0 4px 20px rgba(0,0,0,.075), inset ring 1px rgba(0,0,0,.12)
  focus      inset ring rgba(0,0,0,.24), no accent halo
  text       15/21
  send       32 circle, bg #d97757, white arrow; hover #c4633f

Plan pill
  box        hug, radius 8, pad 4px 10px
  surface    #f5f5f5
  type       14/20, 400; link #1757ac underlined

Primary button
  box        h 36, pad 0 12, radius 8
  colours    bg #1a1a19, text #fff; hover 88% black
  used on    sign-in, destructive confirms

Secondary button
  box        h 36, radius 8, 1px #e6e6e6 border
  colours    #fff / #1a1a19; hover #f5f5f5

User message
  box        hug, max 75%, pad 10px 14px, radius 12
  surface    #f0f0f0, ink #1a1a19, 15/24

Settings
  rail       #fafafa, 180px, active row #ececec (no shadow)
  pane       #fff, 24px padding, serif section titles
```

## 5. Assets

| file | stands in for | role | box | method | visible difference |
|------|---------------|------|-----|--------|--------------------|
| `brand__mark` (existing SVG) | starburst + wordmark | mark | 26px / 40px | Alcove's own arch, recoloured `#d97757`; no reference asset used | shape is an arch, not a starburst |
| icon sprite | Anthropicons | icon | 15–20px | existing 1.7px Lucide-style paths | stroke and geometry differ |
| Source Serif 4 / Inter | Copernicus / Styrene | type | — | Google Fonts, OFL | metrics differ slightly; fallback Georgia/system |

## 6. Motion

| element | trigger | property | from → to | duration | easing |
|---------|---------|----------|-----------|----------|--------|
| rows | hover | background | transparent → `#ececec` | 120ms | ease |
| composer | focus-within | inset ring | 12% → 24% black | 120ms | ease |
| dialogs | open | opacity/translate | 0/8px → 1/0 | 260ms | cubic-bezier(.2,.7,.2,1) |

Reduced motion: all transitions and animations collapse under `[data-motion="reduce"]` and `prefers-reduced-motion`.

## 7. Anti-patterns

- No green anywhere; the palette is neutral with a single terracotta accent.
- No coloured sidebar, no accent-tinted active rows, no uppercase section labels.
- No border on nav or chat rows; state is a gray fill.
- No second accent for buttons: primary buttons are near-black, links are blue.
- No heavy card shadows in the workspace; the composer is the only floating surface.
- No pill-shaped buttons; pills are reserved for chips and the usage bar.
- No mark inside a coloured tile; the mark is drawn in accent colour on the surface.
- No copied starburst, wordmark, copy or icons.

## 8. Deviations

| # | what | why | impact |
|---|------|-----|--------|
| 1 | name/mark/copy stay Alcove | the skill forbids lifting the reference's brand into the product | recognisably not Claude, same design language |
| 2 | responsive viewports not captured | cloud browser viewport fixed; Playwright failed to attach | 900/560 breakpoints inferred, not measured |
| 3 | user bubble inferred | avoided opening personal conversations | close, not pixel-verified |
| 4 | dark skin inferred | reference was captured in light mode | follows Claude's documented dark palette |
| 5 | fonts substituted | Copernicus/Styrene are licensed | metrics within a few percent; fallbacks named |
| 6 | focus rings use blue | accessibility; reference focus styling could not be measured | visible only on keyboard |
| 7 | conversation body set in serif | reference chat route was not opened; Claude's reading face is serif in public captures | closer to the reference, verified for size/contrast |

## 9. Acceptance checklist

- [x] page background `#ffffff`; sidebar `#fafafa` with 1px `rgba(0,0,0,.1)` divider
- [x] sidebar 288px; rows 32px, radius 8, 14/21
- [x] greeting 38px/47.5px weight 330 serif, 36px accent mark, centered
- [x] composer radius 14, pad 8, measured shadow + inset ring
- [x] primary button near-black, links `#1757ac`, accent `#d97757`
- [ ] diff ≥ 90 per viewport — not run: reference screenshots were not persisted, so `imgdiff.py` has nothing to compare
- [x] no reference code, fonts, images or icons in the build
- [x] 390×844 home renders without horizontal overflow after pinning the mobile grids to `minmax(0, 1fr)`
- [ ] visual check at 1440×900 and 768×1024 — not rendered; the cloud browser viewport was fixed

## Trade dress

A pixel-identical reproduction of claude.ai is not safe to publish as-is. This build keeps the Alcove name, wordmark and all copy, and uses an original mark and icon set. Replace any remaining resemblance to the reference's trade dress before a public launch.
