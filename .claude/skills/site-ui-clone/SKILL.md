---
name: site-ui-clone
description: >-
  Rebuilds a public website's UI/UX as a faithful, pixel-level clone by
  observing what the browser renders — never by reading, copying or editing the
  site's source. Captures the real theme (page background, palette roles, font
  families with size, weight, line-height, letter-spacing and case), the
  geometry of every section and element (positions, boxes, spacing, radius,
  borders, shadows), the layout grid, component states, motion and responsive
  breakpoints, then writes a build spec and rebuilds the page with assets the
  agent authors itself. Use whenever the user says "clone this website UI",
  "replicate this landing page", "copy this site's design/front end", "make it
  look exactly like <url>", "pixel perfect clone of <url>", "rebuild this page",
  "extract this site's theme and fonts", or pastes a URL and wants the frontend
  recreated.
---

# site-ui-clone

Rebuild a site's front end from the outside in: render the page in a real
browser, measure what it paints, write the measurements down, then build the
same UI with assets you make yourself.

"Without touching their code" is literal here. You never fetch the HTML
document, the CSS bundles or the JS into the project. You look at a rendered
page the way a designer with a tape measure and a colour picker would, and you
write every line of the clone from that.

## Hard rules

1. **Observation only.** The browser is your instrument. You may read computed
   styles, bounding boxes, loaded font names and painted pixels, because that
   is what any visitor can see. You may not paste the target's markup,
   stylesheets, scripts or inline SVG into the project, and you may not
   download its bundles.
2. **Never ship their bytes.** No hotlinking, no "save image as", no copied
   SVGs, no fonts pulled from their CDN. Every image, icon, logo, texture and
   illustration in the result is authored by you (see `references/assets.md`).
3. **Fonts are matched, not borrowed.** Identify the family by its rendering,
   then use the closest open-licensed face. Keep the measured size, weight,
   tracking, leading and case exactly.
4. **Backgrounds are sampled, not guessed.** The page background, every
   surface and every section band get an exact value taken from the rendered
   page or its screenshot. The clone's page background hex must equal the
   original's at the end. No tolerance.
5. **Copy and numbers look identical on screen but live as data.** Text is
   content, not code: put it in one `content` module so the user can swap it in
   a single edit before publishing. Do not lift their brand name into
   identifiers, package names, page titles or metadata.
6. **Say which is which.** In the spec, mark every value as `measured`
   (from the capture) or `inferred` (your judgement). Never present a guess as
   a measurement.

Public use of a pixel-identical clone of someone's page is usually not lawful:
it reproduces their trade dress. State this once, briefly, when the user asks
for "exactly the same", and record in `DESIGN.md` which brand elements must be
replaced before it ships (name, logo, copy, photography). Do not refuse the
recreation — it is a normal study/replica exercise — just make the boundary
visible.

## The loop

```
URL → capture → analyse → DESIGN.md + tokens → author assets → build
    → screenshot → diff → fix → report
```

Artifacts live in one folder per target, outside the clone's own source:

```
clones/<site-slug>/
├── reference/            measurements and screenshots of the original. Never shipped.
│   ├── spec-1440x900.json
│   ├── desktop-full.png
│   ├── desktop-fold.png
│   ├── spec-768x1024.json
│   ├── tablet-full.png
│   ├── spec-390x844.json
│   ├── mobile-full.png
│   └── states.json
├── DESIGN.md             the build spec (template: references/spec-template.md)
├── assets/               your authored assets + NOTES.md saying how each was made
├── shots/                screenshots of your build at the same viewports
├── diffs/                diff images and reports
└── src/                  the clone
```

Add `clones/*/reference/` to `.gitignore`. Reference captures are other
people's pages; they are for comparison and never part of the deliverable.

## Phase 0 — preflight

Answer these before a single command:

- **Target and scope.** Which URL, and which pages? A clone of one landing page
  is a good default. Multi-page needs a shared token file and a nav that works.
- **Same or yours.** "Exactly the same look" or "the same skeleton with my
  brand"? If the second, ask for the brand colours now and keep them in a
  single palette block so the swap is one edit. The default when the user says
  "clone it" is the first.
- **Stack.** Follow the repo if it has one. Otherwise static HTML + CSS + a
  little JS is the most faithful and the easiest to diff. Do not add a
  framework that will impose its own spacing, fonts or focus rings.
- **Reference viewport.** 1440×900 desktop is the primary measurement; 390×844
  mobile and 768×1024 tablet are the responsive checks.

## Phase 1 — capture

Automatic, with Playwright:

```bash
python3 .claude/skills/site-ui-clone/scripts/capture.py https://example.com \
  --out clones/example --states
```

It writes everything in `reference/`: full-page and above-the-fold PNGs at each
viewport, a JSON spec of computed styles and boxes, and hover deltas for the
top interactive elements. It scrolls the page first so entrance animations
settle. Read the script's `--help` before a long run.

No Playwright? Paste `scripts/collect.js` into DevTools on the page, then run:

```js
copy(JSON.stringify(__siteUISpec))
```

and save the clipboard to `reference/spec-1440x900.json`. Take the screenshots
with the browser's full-page capture at the same viewport. Say in the report
that measurements came from the manual path.

**What to capture per page** (the script does all of it):

| Area | Why |
| --- | --- |
| body/html background, plus every large surface | the page colour must match exactly |
| all colour decls with usage counts | roles: bg, surface, border, text, muted, accent |
| typography tuples + sample text + pixel box | the type system and where each step is used |
| element boxes in page coordinates | positions to rebuild, and to diff against |
| section map (top, height, container, columns) | the vertical rhythm and the grid |
| grid/flex containers, gaps, max-widths | layout system, not eyeballed spacing |
| radius, border, shadow, gradient, filter | the surface language |
| transitions, animations, sticky/fixed elements | motion and scroll behaviour |
| media-query breakpoints, `scrollWidth` overflow | responsive behaviour |
| assets (img/video/canvas/svg/background-image) with box + role hint | inventory to recreate, never download |
| loaded font faces and their weights | identify, then substitute |

## Phase 2 — analyse

Read `references/analysis.md` before interpreting anything. The short version:

1. **Page background first.** The most common large-area colour is the page
   background; header bands, cards and footers are separate surfaces. If the
   page uses an image or gradient behind everything, rebuild it as a CSS
   gradient or an authored texture, not by copying the file.
2. **Build the coordinate map.** Convert every box to page coordinates
   (`rect + scroll`), group elements into sections by vertical bands, and note
   each section's height, container width, left offset and column count. That
   table is what makes "same positions" achievable instead of approximate.
3. **Derive the spacing base.** Take the gaps and paddings that repeat, find
   the common divisor (usually 4 or 8), and snap to that scale. Keep the odd
   one-offs as measured values.
4. **Name the type roles.** Sort tuples by usage. Typical set: display, h1,
   h2, h3, body-lg, body, small, label, button, caption. Record family, size,
   line-height, weight, letter-spacing and text-transform per role.
5. **Identify the typeface.** Check `document.fonts`, the rendered shapes
   (single-storey vs double-storey `a`, `g` tail, terminal angle, x-height
   ratio, width), then pick from `references/fonts.md`. Match the *category*
   first, then metrics; a geometric sans is not interchangeable with a
   grotesque.
6. **Classify assets.** For each image or icon: is it a mark, an icon, a
   photo, an illustration, a texture, or decorative geometry? That decides how
   you author its replacement in `references/assets.md`.
7. **Record states and motion.** Hover, focus, active, disabled, open menus;
   transition durations and easings; sticky headers and scroll reveals. The
   capture gives you hover deltas; use the browser for the rest.

## Phase 3 — write the spec

Fill `references/spec-template.md` into `clones/<slug>/DESIGN.md`. It is not
optional bookkeeping: the build reads it, and the diff checks against it. The
sections that carry the result:

- **Surface table** — every background with hex, area and where it appears.
- **Type table** — role, family (original + substitute), size, line, weight,
  tracking, case, colour.
- **Geometry table** — per section: top, height, max-width, padding, columns,
  gap, alignment. Per component: box, padding, radius, border, shadow.
- **Component inventory** — one block per repeated part, with all its states.
- **Assets table** — original description, replacement, how it was made.
- **Anti-patterns** — what the original deliberately does *not* do (no drop
  shadows, no rounded cards, no centred body text…). Phrase each as "if X
  appears, it is wrong". This is what stops the agent from reintroducing
  framework defaults.
- **Acceptance checklist** — objectively answerable items, including exact
  background hex and position tolerances.

## Phase 4 — author the assets

Read `references/assets.md`. In one line: build, don't borrow.

- Marks and icons → your own SVG geometry, or an open icon set (Lucide,
  Phosphor, Heroicons, Tabler) matched for stroke weight and optical size.
- Photography → an image you generate or a licensed stock photo whose crop,
  focal point and colour treatment match the original's role.
- Illustrations and 3D-looking objects → authored SVG/CSS/canvas geometry.
- Textures, grain, glow, mesh gradients → CSS gradients, SVG filters, generated
  noise.
- Avatars and logos for demo content → initials blocks or generated marks.

Log every replacement in `assets/NOTES.md`: what it stands in for, how it was
made, and any difference the user would notice.

## Phase 5 — build

Order: tokens → type and reset → layout shell → section by section → states
and motion → responsive.

- **Tokens only.** No raw hex, font size or radius in a component. Everything
  reads `var(--color-bg)`, `var(--type-h2)`, `var(--space-6)`.
- **Exact where measured.** Use the measured px/rem values. Do not "round to a
  nicer scale" unless the user asked for a redesign.
- **Match the mechanism.** If the original centres with flex and a max-width,
  do that; if it uses a 12-column grid with an offset, do that. Same result,
  same behaviour when content changes.
- **Same semantics.** Real landmarks, one `h1`, labels on inputs, alt text,
  visible focus, keyboard operability. Accessibility is not a fidelity
  trade-off; if the original is bad at it, improve it and note the deviation.
- **Copy in one place.** `content.js`/`content.json` (or the template's data
  file), so brand strings can be swapped without touching layout.
- **No dependencies for looks.** A font CDN is fine; a UI kit is not, unless
  the user asked for the stack.

## Phase 6 — verify

Screenshot the build at the same viewports, same scroll positions, same state
(menus closed, same content), then:

```bash
python3 .claude/skills/site-ui-clone/scripts/diff.py \
  clones/example/reference/desktop-full.png \
  clones/example/shots/desktop-full.png \
  --out clones/example/diffs/desktop.png --fail-under 90
```

The diff reports a match score, the differing regions in the original's pixel
coordinates, the height delta, and the dominant/background colours of both
images side by side. Loop at most four times, easiest fixes first (colour, then
type size, then spacing, then structure). Stop when the score is 90+ or two
iterations bring no improvement.

Then check by hand, because a score cannot see everything:

- [ ] page background hex equals the original's exactly
- [ ] every section present, in order, at the measured top offset
- [ ] container widths and column counts match at 1440, 768, 390
- [ ] type sizes, weights and tracking match per role; no font fallback flash
- [ ] every asset is one you authored; `assets/NOTES.md` complete
- [ ] hover/focus/active/disabled states exist and behave the same
- [ ] no horizontal scroll where the original has none
- [ ] keyboard-only pass works; no console errors
- [ ] nothing of the original's code, fonts or files is in the repo

Write `clones/<slug>/REPORT.md`: the diff scores per viewport, what matches
exactly, what is approximate and why, which assets were substituted, and what
must change before public use. Honest numbers only; a 78% match is a 78%.

## Output

`reference/` captures, `DESIGN.md`, `assets/` with notes, `src/`, `shots/`,
`diffs/`, and `REPORT.md`, plus a short chat summary: score per viewport, the
three closest details, the three furthest, and the next fix.

## When the target is hostile to measurement

- **Canvas or WebGL page** (the DOM has almost no boxes) → say so early. Rebuild
  the layout and typography, recreate the visual with your own canvas work, and
  set expectations: this is a recreation, not a copy.
- **Heavy scroll choreography** → capture at fixed scroll offsets with a settle
  delay, and rebuild the moments rather than a single static page.
- **Blocked stylesheets (CORS)** → computed styles still work, declared custom
  properties may be missing. Record the gap in `DESIGN.md` instead of inventing
  values.
- **A/B variants or personalisation** → capture once, note the variant, and say
  which one the clone matches.
