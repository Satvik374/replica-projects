# Cadence — components

Density is the point: 11px UI text, 22px rows, 20px controls, 26px panel headers. Every value
comes from `tokens.css`; no component invents hex codes or pixel spacing.

## Panel

```
variants   docked panel (project, effects, viewer, timeline, inspector, info, character)
header     26px, panel-header surface, 1px border-bottom, title + actions
body       flex 1, scrolls; some panels are fixed height in the inspector stack
states     empty (centered title + hint), filled, scrolled
a11y       <section> with aria-label, header is text not a fake tab
```

## Menu bar and dropdown

```
bar        30px, bg-deep, draggable region in Electron, brand mark + File…Help + project name
dropdown   surface-raised, 1px border, pop shadow, 232px min, 4px vertical padding
item       4px 8px, 11px, label left / shortcut right in mono, hover = accent bg + inverse text
submenu    opens on hover/focus-within to the right, chevron
states     closed, open, hover, disabled, separator
a11y       real <button>s, aria-haspopup/expanded, Escape closes, click-outside closes
```

## Toolbar

```
height     38px, panel-header surface
groups     1px-separated, sunken background, radius md
tool       26×26, 1.6px stroke icon, active = accent fill + inverse icon
right      project badge (name, dimensions, fps), Save, primary Render
```

## Number field

```
size       20px high, flex 1, sunken bg, 1px border-input, radius sm
text       10px mono, right aligned, optional unit (% ° px)
states     idle, hover, focused (accent border), scrubbing, clamped, disabled
behaviour  click focuses and selects all; Enter/blur commits; Esc reverts;
           ↑/↓ step (Shift ×10); the grip scrubs horizontally (Shift ×10) and is one undo step
a11y       aria-label, inputMode decimal, scrubber exposes aria-valuenow/min/max
```

## Segmented control

```
track      24px high, sunken bg, 1px border, radius sm, clipped
button     22px, inline-flex row, icon + 10px label, gap 4px, centered, nowrap
states     idle (dim), hover, active (accent fill, inverse text), disabled
```

## Point and colour fields

```
point      X field + Y field, 8px axis labels, no unit repetition
colour     16px swatch with native <input type=color>, uppercase hex input, Enter/blur commits
```

## Stopwatch and keyframe

```
stopwatch  16px, dim until animated, accent when animated, click toggles animation
           (off keeps the value sampled at the playhead)
key button 18px, dim diamond, accent when a key exists at the current frame
diamond    9px rotated square on the timeline; grey = linear, amber = eased, square = hold
           hover white; selected white with accent ring; drag moves one or many in time
influence  footer fields appear when exactly one key is selected: In % and Out %
           (0–100, default 33 each), editing either switches the segment to a custom bezier
```

## Timeline row

```
layer row  22px, sticky 258px head, label chip, type icon, name, eye/solo/lock switches;
           audio rows add a max-peak waveform inside the bar; matte layers show an M badge
bar        absolute from inPoint to outPoint, label colour at 22% mix, border at 45%;
           selected bar gets accent border; trim handles 6px on each edge
property   20px, 36px indent, stopwatch + name + live value, keys on the track
effect     effect header row, params indented 46px
playhead   1px accent line with 11×9 triangle head, spans ruler and rows
ruler      26px sticky, tick every 1/2/5s by zoom, mono second labels; composition markers
           are 9px triangles (click seeks, double-click removes)
states     layer selected, solo, hidden, locked, trimmed, key selected, filtered, empty
```

## Composition viewer

```
chrome     name + dimensions tab, grid/safe/transparency/settings, resolution readout
stage      letterboxed comp centred on a dotted dark field, pop shadow, 1px black outline
overlay    SVG in composition coordinates: 1px non-scaling selection polygon, 8×8 corner
           handles, rotate stem and 20px circle, teal dashed mask outlines, safe areas,
           thirds grid
gizmo      8 screen-px handles: 4 corners scale uniformly from centre, rotate handle above
           top-centre; dragging a layer moves every selected layer
transport  30px: start/prev/play/next/end/loop, mono timecode, resolution, zoom controls
states     empty comp, playing, fit, zoomed, panned, transparent, safe, grid
```

## Audio controls

```
location   inspector, above Transform when an audio layer is selected
rows       Level (0–200%), Source name, duration in the section head
primary    Detect beats button — analysing state, disabled when media is offline
result     composition markers at onsets; status reports count and estimated BPM
```

## Track matte row

```
location   inspector Layer section, hidden for the top layer and audio layers
control    select: no matte, alpha, alpha inverted, luma, luma inverted
behaviour  the layer directly above becomes the matte and stops drawing itself
```

## Effect card

```
container  sunken, 1px border, radius md, 2px gap between cards
head       raised bg, enable checkbox, name 10px, up/down/remove icon buttons
param      stopwatch, 92px label, field (number/point/colour), key button
states     enabled, disabled (55% opacity), animated, key at playhead, first/last reorder
```

## Project item

```
grid       2 columns, 6px gap, 16:9 thumbnail, name, type dot + dimensions
states     idle, hover, selected (accent-tinted row), open comp (accent outline), empty project
actions    double-click comp = open, double-click footage = add layer, right-click = menu
```

## Modal

```
scrim      rgba(0,0,0,.55), centred, 16px padding
card       520px (660 wide), raised bg, 1px border, pop shadow, radius lg
head/foot  8px 12px, surface-header / panel; body 12px, scrolls
states     default, wide, locked while rendering (no close, no Escape)
a11y       role=dialog aria-modal, labelled by title, Escape closes, focus moves into body
```

## Context menu and status bar

```
context    fixed at pointer, clamped to viewport, surface-raised, separators, danger item in red
status     22px: frame, timecode, status message, selection count, tool, project name
```

## Accessibility notes

- Focus is always visible (2px accent outline, inset).
- Timeline switches and transport buttons are real buttons with `aria-pressed`/labels.
- Inputs have labels; icon-only buttons have `aria-label` and titles.
- Selection never relies on colour alone: the viewer gizmo adds handles, the timeline adds an
  accent border, the keyframe gets a ring.
- Panel text colours pass AA against their surfaces; `contrast.py` runs on `tokens.json`.
