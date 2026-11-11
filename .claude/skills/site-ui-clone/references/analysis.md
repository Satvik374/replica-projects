# Deep analysis

How to turn `reference/spec-*.json` and the screenshots into a build spec that
produces the same page. Read this before writing `DESIGN.md`.

The measurement is the easy part. This file is about the three things that go
wrong when an agent skips it: the background is a shade off, the type scale is
plausible but not the real one, and every section is 40px too tall because the
padding was guessed.

## 0. Read order

1. `meta` — viewport, page height, horizontal overflow, DPR.
2. `backgrounds` — the largest painted areas, root and body first.
3. Screenshot — look at the fold and the full page before any number.
4. `sections` — the vertical map. This is the skeleton of the spec.
5. `type` — sorted by usage; the top ten tuples are the real type system.
6. `colors` — with counts; roles come from where a colour is used, not from its
   hue.
7. `tokens` — declared custom properties, if any. Compare with `colors`.
8. `elements` — component anatomy, box by box.
9. `gradients`, `assets`, `motion`, `breakpoints`, `fonts`, `notes`.

`count` is a popularity contest, not truth: a colour used 400 times is probably
the page background, a type tuple used twice may be the display heading that
defines the page. Use counts to rank, then confirm against the screenshot.

## 1. Backgrounds and surfaces

The user asked for the background to be **the same**, so this is a hard value,
not a judgement.

- `html`/`body` background is the page colour. If it is transparent, walk up
  until a non-transparent value appears, or read the actual pixel from the
  screenshot with the eye dropper / a tiny PNG sample.
- A full-bleed `<section>` with its own background is a **band**, not the page
  background. Header, hero, alternating feature bands, CTA and footer each get
  their own row in the surface table.
- Cards, inputs, popovers, code blocks are **surfaces** layered over the band.
  Their colour is often a 2-5% tint of the band; measure it, do not blend by eye.
- A gradient or image behind everything: rebuild it. `linear-gradient`,
  `radial-gradient`, `conic-gradient`, layered gradients with `background-blend-mode`,
  an SVG `feTurbulence` grain, or an authored image. Never reference their file.
- Dark themes: record the exact hex anyway. "Near black" is not a value, and
  `#0b0b0f` vs `#111014` is visible on an OLED.
- Translucent surfaces with `backdrop-filter: blur(...)`: record the `rgba`
  value, the blur radius and the saturate, plus what shows through (usually the
  hero band). Rebuild all three; a flat grey is not the same.

Deliverable: a surface table with hex, role, area, and where it appears.

## 2. Geometry: positions, not vibes

Everything is in page coordinates, so it lines up with the full-page screenshot.

**Sections.** `spec.sections` gives each top-level band: `y`, `h`, background,
padding, max-width, display, grid template, gap. Build the table:

| # | section | y | h | bg | max-w | pad | grid | notes |
|---|---------|---|---|----|-------|-----|------|-------|

Check that the sum of heights plus margins equals `meta.pageHeight`. If it does
not, you have missed a band (often a marquee, a spacer or a footer above the
fold) — go back to the screenshot.

**Containers.** Find the common left offset among sections and their inner
content: that plus the content width is the container. Typical patterns:
`max-width: 1200px; margin: 0 auto; padding: 0 24px`, or a 12-column grid with
`gap: 24px`. Record the measured content width, not the CSS declaration you
think it is.

**Columns.** `gridTemplateColumns` is the fastest signal (`1fr 1fr`,
`repeat(3, minmax(0, 1fr))`, `240px 1fr`). When it says `none`, measure the
children: their `x`, `w` and gaps define the columns. Note asymmetric splits
(2/3 + 1/3, 40/60) — those are what make a hero look like the original.

**Spacing base.** Collect every `gap`, section `padding-y`, card padding and
heading margin. The greatest common divisor of the repeats is the base unit
(4 or 8 almost always). Snap to it, keep the exceptions. Do not invent a scale
from a design-system article; derive it from the page.

**Vertical rhythm.** For each section, the gap from the last element of the
previous section to the first heading is a real number. Record it as the
section's top padding and bottom padding separately; symmetric padding is
common but not universal.

**Type is geometry too.** Baseline positions come from line-height and margin,
not from your component's default. If the original's `h1` has
`line-height: 1.05; margin-bottom: 20px`, those two numbers plus its `font-size`
place every following element. Get them right and the rest of the section falls
into place.

**Tolerances** when verifying at the same viewport: ±1px for borders and radii,
±2px for element positions, ±4px for section heights, exact for colours and font
sizes. Anything larger is a structural bug, not anti-aliasing.

## 3. Typography

`spec.type` rows are unique tuples of family, size, weight, style, line-height,
letter-spacing, transform, align and colour, with sample text and the first
boxes. Collapse them into roles:

| role | family | size | line | weight | tracking | case | colour | used on |
|------|--------|------|------|--------|----------|------|--------|---------|

Rules:

- **Name the role by job, not by tag.** `display`, `h1`, `h2`, `lead`, `body`,
  `small`, `label`, `button`, `nav`, `caption`, `mono`. A page often has an
  `h2` styled like a display and a `p` styled like a lead.
- **Sizes in px as measured.** Convert to rem only if the project uses rem, and
  keep the same rendered size at the reference viewport.
- **Line-height as a ratio.** `28px/16px = 1.75` is what survives responsive
  scaling. Record both the measured px and the ratio.
- **Letter-spacing** is usually in `em` in the original. Convert: `-0.02em` at
  64px is `-1.28px`. Keep the sign; tight display type and loose small caps are
  signature details.
- **Text transform and small caps.** Uppercase labels with wide tracking are a
  common pattern; a `text-transform: uppercase` you forget changes the width of
  every button.
- **Optical weight.** If the original is variable-font, weight 560 is a real
  value. Match it with a variable font, do not round to 600.
- **Colour is part of the role.** Muted body copy is a separate row.

Font identification: see `fonts.md`.

## 4. Component anatomy

For each repeated part (button, card, nav item, input, badge, table row, tab,
accordion, modal), read the `elements` entries and record:

- **Box** — width/height behaviour (fixed, hug, fill), min/max, aspect ratio.
- **Padding and gap** — measured, then snapped.
- **Border** — width, colour, style; note per-side differences (bottom-only
  rules are common) and inset box-shadows used as borders.
- **Radius** — per corner if asymmetric; pill vs rounded-rect changes the feel.
- **Shadow** — sometimes layered: a tight 1px ring plus a soft ambient. Copy the
  layer structure, not an approximation.
- **Background** — flat, gradient, or image; gradient angle and stops.
- **Icon** — size, stroke weight, gap to the label, alignment.
- **Text** — role, truncation (`text-overflow`, line clamp), wrapping.

Then **states**. `states.json` has hover deltas; add focus, active, disabled,
selected, open, error and empty by using the page yourself. Each state lists the
properties that change and the transition that carries it.

## 5. Stacking, stickiness, overlays

- `position: fixed` items are usually a header, a floating CTA or a cookie bar.
  Record their collapsed and scrolled appearance, height and shadow change.
- `position: sticky` needs the threshold: the scroll offset where it pins and
  the offset it pins at.
- `z-index` matters for hero text over media, dropdowns, modals and gradients
  used as fades. Record the order you need, not the original's numbers.
- Overlays: gradient scrims over photos, noise layers, grain, vignettes. These
  are what make a hero readable; rebuild them as CSS layers.

## 6. Motion

From `spec.motion` and `states.json`:

- **Durations and easing.** 120-200ms for hover, 250-400ms for entrances,
  `cubic-bezier(.2,.8,.2,1)` style ease-outs for reveals. Record the exact
  `transition` shorthand.
- **What moves.** Colour/opacity only (cheap, common on SaaS), translate-y
  reveals, scale-in cards, staggered lists.
- **Scroll reveals.** Capture the settled state, and set the clone's initial
  state to match the settled one so the page is readable without JS. Add the
  reveal as an enhancement.
- **Respect `prefers-reduced-motion`** even if the original does not. Note the
  deviation.

## 7. Responsive behaviour

- `breakpoints` lists declared media query widths (CORS-blocked sheets may hide
  some; say so). Treat them as hints; confirm by resizing and re-capturing.
- Common patterns: 3 columns → 2 → 1; hero split → stacked; nav → hamburger;
  sidebar → drawer; font sizes step down with `clamp()`.
- **Duplicate markup for mobile** is common (`hidden md:block` plus a separate
  mobile block). Build one responsive structure unless the layouts genuinely
  differ, and say which approach you took.
- **Art direction**: the same image cropped differently per breakpoint. Recreate
  the crop with `object-fit` and `object-position` rather than authoring two
  images.

## 8. Assets

Classify every entry in `spec.assets` and `spec.gradients`:

| role | what it is | how you replace it |
|------|-----------|--------------------|
| mark | logo / wordmark | your own SVG geometry, or a neutral wordmark placeholder |
| icon | UI glyph, 16-32px | open icon set at matching stroke, optical size |
| photo-or-hero | large image, hero visual | generated or licensed image, same crop and treatment |
| image | content image, illustration | authored SVG/CSS or generated image |
| avatar | face or initials | generated avatar or initials block |
| video | background or demo clip | your own loop, or a CSS/JS animation |
| canvas-visual | WebGL/2D rendering | author the visual; expect approximation |
| texture-or-photo | CSS background image | gradient + noise, or an authored texture |

Record the replacement and the method in `assets/NOTES.md`, and note the visible
difference. See `assets.md` for the techniques.

## 9. Writing it down

For every value, mark provenance:

- `measured` — a number from the spec or the screenshot.
- `inferred` — your reading (role names, base unit, what a breakpoint does).
- `deviated` — you chose differently from the original (a11y fix, missing
  asset, licensed font).

That marking is what lets the user audit the clone later, and it is what keeps
"exactly the same" honest.
