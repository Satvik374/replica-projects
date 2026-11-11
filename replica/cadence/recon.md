# Cadence — recon map

A clean-room study of After Effects' motion-graphics workflow, rebuilt as a desktop app.
Scope chosen for this build: **compose, animate, composite, render a short piece** — the loop
people actually pay for. Not the whole application.

## Sources

| source | what it gave |
| --- | --- |
| Adobe Help — Workspaces, panels and viewers (helpx.adobe.com/after-effects/desktop/get-started/get-familiar-with-the-interface/workspaces-panels-viewers.html) | panel model, viewer behaviour, workspace bar, panel menus |
| Adobe Help — General UI items (…/general-user-interface-items.html) | panel menus, search fields, context menus, columns |
| Adobe Help — Timeline panel documentation | layer-bar mode, time ruler, playhead, layer switches, keyframe navigation |
| Public After Effects screenshots and walkthroughs (layout/hierarchy study only) | panel placement, density, iconography, selection treatment |
| EffectCraft README + docs (MIT/Apache-2.0) | an open-source feature inventory for the motion-graphics domain; behaviour reference only |

No After Effects screenshots, assets, code or copy are stored or shipped with the clone. The
layout follows public documentation of the workflow, not any proprietary file.

## Screens

| ID | Screen | How you get there | Purpose | Key components | States seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Workspace | launch / open project | the whole editing surface | menu bar, toolbar, Project, Effects & Presets, Composition viewer, Timeline, Effect Controls, Info, Character, status bar | open comp, no selection, layer selected, playing |
| S02 | New Composition | File ▸ New Composition, Project + button | create a comp | name, presets, width/height/fps/duration/background | default HD, custom, invalid sizes |
| S03 | Composition Settings | Ctrl+K, viewer title | edit size/fps/duration/name/background | same form as S02 prefilled | longer/shorter duration trimming layers |
| S04 | Timeline, layers collapsed | launch | layer stacking and bar timing | ruler, playhead, expander, eye/S/lock, label chip, layer bars, aggregate keyframe marks | many layers, empty comp, filtered, solo, hidden, locked |
| S05 | Timeline, properties expanded | twirl a layer | keyframe editing per property | stopwatches, property rows, diamonds, effect param rows, ease footer, zoom controls | animated, static, selected keys, dragged keys, hold keys |
| S06 | Effect Controls | select layer | inspect and animate a layer | layer summary, blend/parent/label, transform rows, effect cards, mask editors | no selection, text layer, multiple selection, many effects |
| S07 | Composition viewer | launch / open comp | watch and manipulate the frame | canvas, overlay, gizmo, transport, timecode, resolution, zoom | fit, zoomed, panning, transparency grid, safe frames, empty comp |
| S08 | Effects & Presets | left column, bottom | find and apply effects | search, category accordions, effect rows | browsing, filtered, no match |
| S09 | Project | launch | manage comps and footage | search, thumbnails, metadata, context menu, import | empty, with footage, filtered, selected |
| S10 | Render | Ctrl+M / Render button | export a frame or a video | format, size, progress, save result | idle, rendering, complete, error/cancelled |
| S11 | Context menus | right-click layer/keyframe/comp/footage | quick actions | menu items, separators, danger item | per target |
| S12 | Help dialogs | Help menu | shortcuts and about | shortcut grid, about panel | — |
| S13 | Character panel | select a text layer | typography | text area, font, style, size, leading, tracking, colour, alignment | no text layer, text selected |
| S14 | Info panel | always | readouts | comp/frame/timecode/fps/resolution/pointer/selection/tool | pointer inside/outside viewer |

## Flows

**F01 Make a title card** — S01 → S02 (new comp) → S01 → Layer ▸ New Text → type in Character (S13) → keyframe scale/opacity in Effect Controls (S06) → play (S07) → Render (S10) → save.
Happy path: 6 deliberate actions. Edge: no comp open, text layer hidden behind another layer, render at quarter size.

**F02 Animate a property** — S01 select layer → S06 stopwatch position → move playhead → drag layer in viewer or edit numbers → keyframes appear in S05 → select two keys → Easy Ease → scrub S05.
Edge: dragging an animated property at a time between keys creates a key; dragging with no keys changes the static value.

**F03 Add and animate an effect** — S08 search “glow” → double-click → S06 effect card appears → tweak radius/intensity → click the parameter stopwatch → key values → S05 shows the parameter row.
Edge: no layer selected (effect buttons explain what to do), effect disabled, removing an effect with keys.

**F04 Mask a layer** — S06 Masks ▸ Ellipse → mask appears in viewer outline (S07) → set size, feather → subtract mode.
Edge: feather larger than the layer (padding), several masks with mixed modes.

**F05 Use footage** — S09 import or drag an image onto the window → double-click the asset → layer created in the open comp → scale/rotate in S07 → export frame.
Edge: media missing after deleting an asset, very large image, import of a non-image.

**F06 Save and reopen** — Ctrl+S (native dialog on desktop, download in browser) → reopen via Ctrl+O → same comps, keyframes, effects and images.
Edge: old/malformed project file, autosave restore, unsaved changes on New Project (confirm).

**F07 Grade with an adjustment layer** — Layer ▸ New Adjustment Layer → add grain and vignette in S06 → effects apply to everything beneath, not to the UI.
Edge: adjustment layer with no enabled effects, solo another layer.

## Components

| component | variants / states | screens |
| --- | --- | --- |
| Menu bar + dropdown | root menu, submenu, separator, shortcut, hover, window controls | all |
| Toolbar | 7 tools, active state, project badge, save, render | all |
| Panel | header, actions, scroll body, empty state | S01–S14 |
| Project item | comp, footage, selected, active comp, search miss | S09 |
| Search field | idle, filled, clear | S08, S09, S05 |
| Composition viewer | empty, playing, zoomed, transparency, safe, grid, gizmo | S07 |
| Transport | play/pause, loop on/off, step, start/end | S07 |
| Timeline row | layer bar, selected, solo/hidden/locked, trimmed, aggregated keys | S04, S05 |
| Property row | stopwatch off/on, key present, value, drag keys | S05, S06 |
| Keyframe diamond | linear, eased, hold, selected, dragging | S05 |
| Number field | idle, focused, scrubbed, clamped, invalid draft | S02, S03, S05, S06, S13 |
| Point field | X/Y pair | S06, S07 |
| Colour field | swatch, hex input, native picker | S02, S06, S13 |
| Effect card | enabled, disabled, reordered, removed, animated parameter | S06 |
| Mask editor | add/subtract, enabled, feathered | S06 |
| Modal | default, wide, locked while rendering | S02, S03, S10 |
| Context menu | layer, keyframe, comp, footage | S11 |
| Status bar | idle, status, selection count, tool | all |

## Inferred data model

```
Project   name, comps[], assets[], activeCompId                       confidence high
Comp      id, name, width, height, fps, duration(frames), bg, layers[]  high
Layer     id, name, type(solid|text|shape|image|null|adjustment),
          label, enabled, solo, locked, inPoint, outPoint, parentId,
          blend, transform, effects[], masks[], + type payload        high
Transform anchor, position, scale, rotation, opacity — each an
          animated property { value, keys[] }                          high
Keyframe  t(frames), v(number|vec2|colour), ease(linear|ease|easeIn|
          easeOut|hold)                                                evidence: F9 behaviour
Effect    id, defId, name, enabled, params{key: property}              high
Mask      id, shape(rect|ellipse), mode(add|subtract), position, size,
          rotation, feather, opacity                                  evidence: masks workflow
Asset     id, name, kind(image), dataUrl, width, height                high (self-contained project)
```

Not modelled: layer time remapping, track mattes, 3D transforms, text animators, expressions,
audio, render queue items, output modules, cameras and lights. Each is either out of scope or
listed as `no` in `features.csv`.

## Feature matrix

`features.csv` — 76 rows. Must-haves cover composing, animating, compositing and exporting a
short piece; `skip` rows are the proprietary or licensed parts (AEP format, Adobe plug-in SDK,
stock content).

## What cannot be cloned

- **Adobe's project format, plug-ins and SDK** — proprietary; not reverse engineered.
- **The effect catalogue's exact rendering** — 308 effects with specific algorithms; this build
  implements 19 behaviours from scratch.
- **Licensed content and integrations** — stock footage, fonts, Adobe Fonts, Dynamic Link,
  third-party hardware.
- **Adobe's brand** — the palette, wordmark, iconography, demo project and all copy here are
  original. After Effects is referenced descriptively only.

## Size

Screens: 14. Flows: 7. Entities: 8. Hard parts: a correct compositing order (masks → effects →
transform → blend), keyframe interpolation across number/vector/colour values, a dense timeline
that stays readable, and desktop packaging without a build server.

Size: **L** for full parity, **M** for this scoped build. Done in one session: core loop end to
end, must-haves complete, some should-haves partial by design.
