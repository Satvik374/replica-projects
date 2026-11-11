# Cadence — build log

## Scope built

| screen | status | notes |
| --- | --- | --- |
| S01 workspace | done | 3-column workspace, timeline row, inspector stack |
| S02 new composition | done | presets, custom size, fps, duration, background |
| S03 composition settings | done | prefilled, trims layer out-points when shortened |
| S04 timeline layers | done | bars, in/out trim, eye/S/lock, label colours, aggregate keys |
| S05 timeline properties | done | transform and effect param rows, stopwatches, key drag, ease |
| S06 effect controls | done | transform, effects, masks, blend, parent, label |
| S07 composition viewer | done | render, gizmo, pan/zoom, safe, grid, transparency |
| S08 effects browser | done | search, categories, double-click apply |
| S09 project panel | done | live thumbnails, search, import, context menu |
| S10 render | done | PNG still and real-time VP9 WebM with progress |
| S11 context menus | done | layer, keyframe, comp, footage |
| S12 help dialogs | done | shortcuts, about |
| S13 character panel | done | full typography controls for text layers |
| S14 info panel | done | live readouts |

## What was harder than it looked

- **Compositing order.** Masks must clip before effects, effects before the transform, and
  adjustment layers must receive everything below them without their own transform. Getting the
  layer canvas padding right so blurs and shadows do not clip took more care than the effects
  themselves.
- **Keyframes across value kinds.** One interpolation path handles numbers, `[x,y]` vectors and
  hex colours, with per-segment ease presets and After Effects-style in/out influence for custom
  bezier curves. Colour interpolation needed a separate branch so tint and gradient colours
  animate smoothly.
- **Dragging with history.** Every viewer drag, number scrub, key drag and trim begins a single
  store transaction. Without it, one pointer gesture would fill undo with hundreds of entries.
- **Parenting.** Child position deltas have to be transformed into the parent's space, or a
  parented layer drifts when dragged. The orbit in the demo project exists to keep that honest.
- **Dense but legible UI.** The layout is small: 11px text, 20–22px rows. It needed disciplined
  spacing tokens and a real furniture hierarchy, not just smaller fonts.
- **Desktop preview in a headless VM.** Electron cannot launch here, so the renderer is built to
  run identically in a browser and the Electron shell is wired but only statically verified.

## Where the feature matrix is partial, and why

- Video export: VP9 WebM only (MediaRecorder), no H.264/ProRes/sequences/queue.
- Keyframe interpolation: presets plus custom in/out influence; no graph editor or draggable
  handles in the viewer.
- Blend modes: 16 of the 38 in After Effects, limited by Canvas 2D composite operations.
- Adjustment layers: effects apply, transform and opacity are ignored.
- Masks: preset shapes with numeric editing; no pen tool or animated mask paths.
- Keyboard coverage: tools, timing, keyframes, trims and file commands; not every After Effects
  shortcut (property single-key reveals, split layer, and so on).

## Verification run

- `npx tsc --noEmit` — clean.
- `npm run build` — production bundle (1617 modules, 297.9 kB JS / 31.9 kB CSS).
- Browser preview — workspace renders the demo composition and all panels. The cloud browser
  panel is 392–648 px wide, below this desktop app's 1120×620 minimum, so the desktop captures
  render the app at 1280×800 and scale it 0.5 inside the panel at DPR 2; the saved images are
  1:1 device pixels but a native 1440×900 render was **not** observed. See
  `clone-screens/README.md` for each capture's viewport.
- Interaction pass in the running app: selected and expanded the Title layer, scrubbed to frame
  55, selected a keyframe (the In/Out influence fields appeared), filtered and applied Glow,
  opened Render, and exported a PNG frame. The exported file is 1920×1080, 4.17 MB, and was
  visually inspected (`clone-screens/export-frame.png`).
- WebM export completed and downloaded a 10 KB file with a valid EBML/WebM header. It is a smoke
  test only: decoded frames were not inspected, and the small size reflects the mostly static
  demo composition under VP9.
- `python3 .claude/skills/replica-design/contrast.py replica/cadence/design/tokens.json` —
  14 pairs, 0 AA failures.
- `python3 .claude/skills/replica-diff/parity.py replica/cadence/features.csv` — 88.2/100,
  must-haves 34 of 35 (video export is the partial).
- Electron shell: wired and typechecked; launching needs a machine with a display.
  `npm run dev:desktop` / `npm run desktop` are the checks.

## Next things worth doing

1. Graph editor with value and speed graphs (the data model already stores per-key ease).
2. Track mattes and alpha/luma mattes between adjacent layers.
3. Shape trim paths and repeaters, then the pen tool for masks.
4. Time remapping and layer-time keyframes.
5. A real render queue with image-sequence output and worker-thread rendering.
