# Build log — spotify.com slice

## Stack

Static HTML + CSS + vanilla JS. No build step, no dependencies, no network calls at
runtime. Served with `python3 -m http.server`.

Chosen because the slice is one shell and one interaction loop; a framework would add
weight without adding capability, and the clone must be easy to open and audit.

## Clean room

- No Spotify HTML, CSS, JS, SVG, fonts or images were read or copied. No network calls to
  their domains at runtime; no CDN.
- Layout, hierarchy and token values came from measured computed styles and the reference
  screenshot in `screens/`.
- All copy, catalogue names, monograms and artwork are original.
- The brand mark is a four-bar waveform, not their logo.

## Decisions

- **Panels scroll, not the page.** Feed is its own scroll container, matching the original,
  so the dock never moves.
- **Artwork is generated.** `--art-a`/`--art-b` gradients plus a monogram and a blend-mode
  grain. Keeps the grid lively with zero assets.
- **Player is a state machine** (`queue`, `index`, `playing`, `elapsed`, `volume`, `shuffle`,
  `repeat`, `liked`) driven by a 1s ticker, so swapping in a real `<audio>` element later
  only changes the ticker.
- **Slider primitive** shared by seek and volume: pointer drag plus arrow/Home/End keys.
- **Two hidden-state patterns**: banner `hidden` on play, skeleton removed after 550ms
  (0ms under `prefers-reduced-motion`).

## Verification

- Loaded at 1024×768 in a real browser: no console errors, no failed requests (favicon
  added as an inline data URI).
- Played `Night Shift Radio`: banner swapped for the player, timer advanced, progress and
  duration labels correct, card flipped to the pause state.
- Search `night shift` → Songs + Albums sections; `zzzz` → empty state; clearing →
  all five sections restored (30 cards, 14 play buttons).
- 390px render: library hidden, two-column rows with the next card peeking, stacked banner.

## Known gaps

- No audio, accounts, persistence, queue or device picker.
- Volume only moves a visual value; there is no audio graph.
- Chevron buttons are hidden on touch devices (swipe works).
