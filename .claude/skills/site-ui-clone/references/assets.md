# Authoring the assets yourself

The rule is short: **nothing from the target's server ends up in the clone, and
nothing is traced from its files.** You get the same silhouette, scale, weight
and placement by making the asset again from primitives.

"Same" here means: same box, same visual weight, same colour treatment, same
job in the layout. It does not mean the same drawing, the same photograph or the
same path data. A viewer should read the layout as identical; an owner should
not find their file.

## What you may and may not do

| Do | Do not |
| --- | --- |
| Measure the asset's box, crop, contrast and role | Download it, hotlink it, or reference its URL |
| Rebuild a mark from circles, arcs and strokes you place | Trace its path data, or use the SVG from the DOM |
| Use an open icon set at matching stroke and size | Copy their icon SVGs |
| Generate a photo with an image model | Reuse their photography, even re-encoded |
| Build texture with gradients and noise | Save their background image |
| Use a licensed font that matches | Load their webfont from their CDN |

Trademarks are a separate problem: if the target is a well-known brand, do not
redraw its logo. Use a plain text wordmark as a placeholder and flag it in
`DESIGN.md` as must-replace. The same applies to third-party logos in a client
strip: use neutral shapes or the real logo only with the user's own rights.

## Techniques by asset type

### Marks and logos

Author them as SVG on a small grid, with primitives rather than traced paths:

- Work at 24×24 units, visual box inset 2 units, and scale with `width`/`height`
  in CSS.
- Prefer `circle`, `rect` with `rx`, and `path` with `A` arcs and `C` curves you
  compute from the geometry you observed (radius, angle, stroke width).
- Match **stroke weight to cap height**: a 2px stroke on a 32px mark is heavier
  than the original's 1.6. Measure on the screenshot.
- Optical corrections: a round mark reads smaller than a square of the same
  height, so overshoot circles by ~2%.
- `fill: currentColor` so the mark inherits text colour, like the original's.

If the mark is a wordmark, set it in the substitute font at the measured size,
correct tracking, and a weight close to the original — that reads as the same
mark without pretending to be it.

### Icons

Use one open set for the whole project so stroke weight stays consistent:
Lucide (1.5-2px, rounded), Phosphor (six weights), Heroicons (outline/solid),
Tabler (2px). Choose by the original's corners and terminals:

| Original looks like | Use |
| --- | --- |
| thin, rounded, 1.5px | Lucide |
| medium with options | Phosphor |
| chunky solid glyphs | Heroicons solid |
| squarish, 2px, uniform | Tabler |
| duotone / two-tone | Phosphor duotone |

Set `width`/`height` to the measured icon box and `stroke-width` so the rendered
stroke matches. Icons inside buttons are usually 16-20px with an 8px gap.

### Photography and hero visuals

Generate them, or use a licensed stock photo. To match the original's role:

- **Crop and ratio** from the measured box. Use `object-fit: cover` with
  `object-position` for the focal point.
- **Treatment**: check contrast, warmth, saturation, grain, vignette and any
  duotone/overlay. Reproduce the treatment with CSS (`filter`, gradient scrim,
  `mix-blend-mode`) over a neutral image; that gets you close even when the
  subject differs.
- **Prompt recipe** for an image model: subject + setting + framing + lighting +
  palette + lens/medium + "no text, no logos, no watermark". Ask for the same
  crop ratio as the box, and generate at 2× the rendered size.
- **Alt text** describes the role, not the original's file.

### Illustrations, abstract shapes, 3D-looking objects

- Compose from SVG primitives: overlapping gradients, blurred circles, a grid of
  lines, a fake 3D card with `transform: perspective()` and layered shadows.
- A blurred-blob background is `radial-gradient` × 2-3 plus a blur filter; no
  image needed and it stays crisp.
- A "3D" hero object is often achievable as layered CSS/SVG with a gradient
  mesh; if the original is a real render, say so and treat it as a deviation.

### Textures: grain, noise, mesh, glow

- Grain: inline SVG `feTurbulence` + `feColorMatrix` as a data URI, tiled at low
  opacity, or a generated PNG tile.
- Mesh gradient: several `radial-gradient` layers at different positions with
  `background-blend-mode`.
- Glow: `box-shadow` with a large blur and low alpha, or a blurred pseudo-element
  behind the element.
- Glass: `background: rgba(...)`, `backdrop-filter: blur(12px) saturate(140%)`,
  1px inner highlight via `inset 0 1px 0 rgba(255,255,255,.15)`.
- Dot/grid patterns: `radial-gradient` tiled with `background-size`, or an SVG
  `<pattern>`.

### Avatars, demo content, screenshots inside the page

- Avatars: generated portraits, or initials on a tinted circle that matches the
  measured size and radius. Initials are honest and look intentional.
- App screenshots shown in the original's hero: build a simplified mock of *your*
  clone's UI (or a neutral dashboard) at the same frame size. Do not screenshot
  the original product.
- Client logos: neutral geometric placeholders at the right optical weight, or
  real logos the user has rights to.

### Video and Lottie

- Background video: generate a short loop, or animate the same idea in CSS
  (gradient drift, grain, slow zoom on a still).
- Lottie: rebuild the motion in CSS/JS at the measured duration and easing; do
  not fetch the JSON.

## Files and notes

```
assets/
├── mark.svg              your mark, hand-authored
├── hero.jpg              generated or licensed
├── grain.svg             feTurbulence tile
└── NOTES.md
```

`NOTES.md`, one row per asset:

| file | stands in for | role | method | visible difference |
|------|---------------|------|--------|--------------------|
| mark.svg | header logo (28px) | mark | SVG circles + arc, currentColor | letterforms differ |
| hero.jpg | hero photo (1440×720) | photo | image model, 16:9, teal grade | different subject |
| grain.svg | hero overlay | texture | feTurbulence, 6% opacity | none at 1× |

Also list anything you could not recreate and why. That list is the honest part
of the report.
