# Cadence — architecture

## Stack

| layer | choice | why |
| --- | --- | --- |
| desktop shell | Electron 33 | real native menus, dialogs and window; one codebase on macOS/Windows/Linux |
| renderer | React 18 + TypeScript | dense, stateful panels; typed data model |
| state | Zustand | one editable project store, undo history, direct store reads from the render loop |
| rendering | Canvas 2D compositor | no native dependencies, predictable pixels, runs in the Electron renderer and the browser preview |
| styling | CSS custom properties + hand-written component CSS | tokens map 1:1 to the replica-design roles; no build step for styles |
| icons | Lucide (ISC) | original icon set, nothing traced from Adobe |
| build | Vite 5 | fast dev server, relative-base production bundle for `file://` |
| packaging | electron-builder | dmg/zip, nsis/portable, AppImage/tar.gz |

No server, database, auth or network calls. Cadence is a local tool: projects are files, media is
inlined in the project, and nothing leaves the machine.

## Modules

```
electron/main.cjs        window, native menu from the renderer tree, project/export dialogs
electron/preload.cjs     the only bridge: save/open/export/menu/window, no Node in the renderer
src/App.tsx              layout, keyboard map, autosave, drag & drop, native menu bridge
src/store.ts             project, selection, time, view state, history, all mutations
src/lib/types.ts         Project → Comp → Layer → properties/keyframes/effects/masks/assets
src/lib/keyframes.ts     sampling, easing presets, vector/colour interpolation, key edits
src/lib/matrix.ts        local/world matrices, parenting, opacity inheritance
src/lib/property.ts      path → property lookup (transform.x, effects/<id>/<param>)
src/lib/factory.ts       layer/comp/effect/mask constructors, deep clones with fresh ids
src/lib/seed.ts          the opening demo project, written for Cadence
src/lib/project.ts       validation, JSON, autosave, desktop save/open
src/lib/audio.ts         Web Audio decode, waveform peaks, onset/BPM detection, buffer cache
src/engine/content.ts    text layout and measurement, shape paths, image cache, layer sources
src/engine/effects.ts    19 effect implementations (canvas filters + pixel passes)
src/engine/render.ts     per-layer plane pipeline, masks, track mattes, adjustment layers, blend modes
src/engine/hitTest.ts    inverse geometry for viewer selection
src/engine/exporter.ts   PNG still and real-time WebM recording
src/components/*         panels, fields, dialogs, context menu, menu bar, viewer, timeline
src/components/AudioPlayback.tsx  one HTMLAudioElement per audio layer, synced to the clock
```

## State and history

A single Zustand store holds the project plus ephemeral editor state (playhead, selection,
expanded rows, zoom, preview resolution, view toggles). Every mutation goes through helpers that:

1. clone the previous project into `past` (capped at 50) unless a drag transaction is open;
2. clear `future`;
3. bump a render version so the viewer redraws.

`beginDrag()` snapshots the project once and suppresses further history entries; `endDrag()`
commits one entry. That is why scrubbing a number, dragging a layer in the viewer, moving a
keyframe or trimming a layer bar each undo as one action.

Selection of keyframes is separate from layer selection, so Delete can remove keys without
deleting layers.

## Render pipeline

```
for each layer, bottom → top:
  if hidden / outside in-out / filtered by solo / audio: skip
  if adjustment layer:
      copy current composite → run effect stack → replace composite
  else:
      source canvas = layer content + effect padding
      effects = stack of enabled effects, evaluated at the current frame
      masks = alpha union of add masks minus subtract masks
      plane = composition-sized canvas with worldMatrix applied
      if trackMatte: render the layer directly above to its own plane,
                     cut this plane by alpha or luma, skip that source when reached
      composite the plane with opacity (including parents) and blend mode
```

Audio layers never touch the canvas. A separate transport creates one `HTMLAudioElement` per
layer, computes the target time from `(compositionTime - inPoint) / fps`, corrects drift while
playing, seeks exactly while paused, and starts within the Play action so autoplay policy is
satisfied. Waveform peaks are decoded once at import and stored with the asset.

Layer content is measured in layer-local pixels: solids and images have a fixed size, text is
measured with the current font, shapes come from the shape spec. Effects that spread (blur, glow,
shadow, displacement, mask feather) get padding so they do not clip at the layer edge.

The viewer renders at `min(zoom × devicePixelRatio, 1.75) × previewResolution`, so a full-frame
preview is never more pixels than the screen needs, while exports render at 1:1 (or the chosen
size). Adjustment layers and per-layer offscreen canvases mean effects are applied in layer
space, before the transform, which matches how motion designers expect a blur on a scaled layer
to behave.

Playback is a single `requestAnimationFrame` loop in the viewer that reads the store directly.
It advances time by real elapsed seconds times the comp frame rate, so seeking, looping and
slow frames never change the duration of the piece.

## Timeline

DOM rows, not canvas: readable text, real buttons and accessible switches. The panel is one
scroll container with sticky headers, a `--track-w` pixel width derived from duration × zoom,
absolutely positioned keyframe diamonds, waveform paths, composition marker triangles, and a
single playhead line spanning the rows. Dragging uses window pointer listeners rather than
pointer capture, so a drag continues correctly outside the panel, and each drag is wrapped in a
store transaction for undo. Splitting a layer clones it and trims the two halves at the playhead,
keeping effects, masks, keys and audio payloads.

## Desktop integration

The renderer hands its menu tree to the main process once on mount; main builds a native menu and
sends command IDs back over IPC. Only Ctrl/Cmd accelerators are registered natively, so typing
plain letters in a name field cannot trigger a menu item. In the browser there is no bridge:
the in-app menu bar and the renderer keyboard map handle everything, and save/open/export fall
back to downloads and file inputs.

## Persistence

Projects are `JSON.stringify(project, null, 2)` with a format tag and version. Loading normalises
missing properties, clamps dimensions, repairs parent references and removes invalid active-comp
IDs. Autosave writes to `localStorage` 700 ms after the last change; explicit save uses native
dialogs in Electron. Imported images and audio are inlined as data URLs, so a project is portable
but can grow with large footage — acceptable for short motion pieces. Audio assets also store
duration, sample rate and waveform peaks; audio layers store volume and a track-matte field.
Composition markers are serialised with the comp.

## Verification

- `npm run build` — strict TypeScript plus production bundle (1619 modules).
- Browser preview; composition, text/shape layers, keyframes, effects, masks and adjustment
  layers checked visually. Captures are in `clone-screens/`; the cloud panel is narrower than
  the app minimum, so desktop shots use a scaled app canvas.
- Timeline interactions: keyframe drag, layer trim, playhead scrub, ease application, split.
- Audio: synthetic WAV import, waveform, 8 beat markers at 120 BPM, transport play call.
- Matte unit checks: alpha, luma and inverted-luma cases on synthetic comps.
- Export: PNG still inspected; WebM recorded and downloaded but decoded frames not inspected.
- Desktop: Electron shell, native menu and dialogs are wired but cannot be launched in this
  headless workspace; `npm run dev:desktop` and `npm run desktop` are the documented checks on a
  machine with a display.
