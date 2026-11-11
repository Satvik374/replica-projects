# Fonts: identify, then substitute

Goal: the same *look* at the same size, with a font you are allowed to ship.
Never load the original's webfont, even if the URL is visible in DevTools.

## 1. Identify

Start with evidence, not a guess from the vibe.

1. **`document.fonts`** (`spec.fonts`) lists loaded faces: family names, weights,
   styles, status. The family name is often a clue (`Söhne`, `CircularXX`,
   `GT America`, `Graphik`) but a self-hosted file can be named anything.
2. **Look at the glyphs** in a zoomed screenshot. The traits that separate
   categories:
   - `a` double-storey vs single-storey; `g` single vs double storey, open vs
     closed tail.
   - Terminals: horizontal (Helvetica), angled (Inter, Söhne), vertical
     (Futura, geometric).
   - `R` leg: straight diagonal vs curved; `t` top flat vs angled; `i` dot
     round vs square.
   - `l` with tail (humanist) vs plain vertical (grotesque).
   - Width: condensed, normal, extended. Compare a line's rendered width at a
     known size.
   - x-height ratio: measure cap height and x-height in the screenshot; a high
     x-height (Inter, Roboto) reads modern and compact, a low one (Futura,
     Optima) reads elegant.
3. **`spec.type`** gives exact sizes, weights and tracking for the rendered
   text. These values transfer even when the family changes.
4. **Narrow it down** against specimen pages of candidates, then pick.

Record: original family (best guess + confidence), category, and the substitute.

## 2. Substitute by category

| Original category / examples | Open substitute | Why |
| --- | --- | --- |
| Neutral UI grotesque: Inter, SF Pro, Helvetica Neue, Söhne, GT America | **Inter**, **Public Sans**, **Archivo** | closest widths and x-height in the common case |
| Geometric sans: Circular, Gilroy, Futura, Poppins, Avenir | **Poppins**, **Plus Jakarta Sans**, **Outfit** | round geometry, single-storey `a` in some |
| Modern grotesque with tight tracking: Geist, Satoshi, General Sans | **Geist**, **Manrope**, **Satoshi (open)** | display-friendly, tight defaults |
| Neo-grotesque, Swiss feel: Akzidenz, Univers | **Inter Tight**, **IBM Plex Sans** | neutral, compact |
| Humanist sans: Frutiger, Source Sans, Open Sans, Lato | **Source Sans 3**, **Open Sans**, **Lato** | open apertures, calligraphic terminals |
| Editorial serif: Tiempos, Canela, Freight, Domaine | **Source Serif 4**, **Newsreader**, **Literata** | high contrast, text-grade |
| Display serif: Playfair, Didot-ish, Recoleta | **Fraunces**, **Playfair Display**, **DM Serif Display** | dramatic contrast, soft or sharp options |
| Slab: Rockwell, Roboto Slab | **Roboto Slab**, **Bitter**, **Zilla Slab** | square serifs, robust |
| Condensed display: Oswald, Bebas, Druk-ish | **Oswald**, **Archivo Narrow**, **Anton** | tall, narrow, heavy |
| Mono: SF Mono, JetBrains, IBM Plex Mono | **JetBrains Mono**, **IBM Plex Mono**, **Geist Mono** | code legibility, similar widths |
| Rounded: Nunito, Quicksand, Varela Round | **Nunito**, **Quicksand**, **Baloo 2** | soft terminals |

Two open families plus a mono is usually enough for a whole page. Do not mix
three sans families because three appeared in the original; many sites load one
family in several weights.

## 3. Handle metric differences

A substitute is never metric-identical. Fix in this order:

1. **Size stays as measured.** Do not shrink a font because it "looks bigger".
   Adjust the family choice instead.
2. **Tracking**: if lines run long, add `letter-spacing: -0.005em` to `-0.02em`
   for display sizes; add `+0.01em` to `+0.03em` for small caps labels. Measure
   the rendered line width against the reference and aim within 1-2%.
3. **Line-height**: keep the measured ratio. If the substitute's ascent makes
   the first line sit low, trim with `margin-top: -0.05em` on the heading or set
   `line-height` and accept a 1px baseline shift.
4. **Weight**: variable fonts let you hit 560 or 620; use the axis rather than
   rounding to 600.
5. **Optical size**: if the family has an `opsz` axis, set it near the rendered
   px size so small labels do not look like shrunken display type.
6. **Fallback stack**: end with a system stack and declare
   `font-display: swap`, plus a `size-adjust`/`ascent-override` @font-face
   fallback only if you see layout shift.

```css
/* metric-matched fallback, optional but cheap */
@font-face {
  font-family: "Inter Fallback";
  src: local("Arial");
  size-adjust: 107%;
  ascent-override: 90%;
  descent-override: 22%;
}
```

## 4. Load it properly

- Self-host (or use Fontsource / Google Fonts CSS) with only the weights and
  styles used: usually 400, 500, 600/700, plus the display weight.
- `preload` the one face used above the fold; do not preload five.
- Subset to latin if the page is latin-only.
- `font-display: swap` for body, `optional` for display if you want to avoid a
  flash of a mismatched face.
- If the original uses a licensed family the user owns, ask; do not assume.

## 5. Record it

In `DESIGN.md`:

| role | original (confidence) | substitute | size | line | weight | tracking |
|------|----------------------|-----------|------|------|--------|----------|

And one line in the report: "Typeface substituted: original looks like Söhne
(high confidence), substituted Inter; tracking tuned per role, sizes and
line-heights measured." That is the honest version of "same fonts".
