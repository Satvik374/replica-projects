# Cadence

A motion graphics and compositing studio for the desktop: compositions, layers, keyframes,
masks, effects, a timeline and a renderer, in one dense dark window.

Cadence is a clean-room rebuild of the motion-design workflow popularised by Adobe After
Effects. The layout follows the conventions motion designers already know (project, composition
viewer, timeline, effect controls), while the code, copy, icons, palette and demo project are
original. It is not affiliated with or endorsed by Adobe; After Effects is their trademark.

## Run it

```bash
cd cadence
npm install            # React, Vite, Electron
npm run dev            # browser preview at http://localhost:3000
npm run dev:desktop    # Vite + Electron together, with hot reload
npm run build          # typecheck + production bundle
npm run desktop        # build, then launch the packaged renderer in Electron
npm run dist           # installers via electron-builder (release/)
```

The renderer runs on its own in a browser (used for the preview in this repo) and inside
Electron. In Electron, project save/open, file export and the application menu use native
dialogs; in the browser those fall back to downloads and uploads. The window has a 1120×620
minimum so the three-column workspace never collapses into unusable fragments.

Screenshots of the workspace, keyframe editing, render dialog and a real exported frame are in
[`../replica/cadence/clone-screens/`](../replica/cadence/clone-screens/).

## What is in it

**Project**
- Compositions with size, frame rate, duration and background, editable at any time.
- Project panel with live-rendered composition thumbnails, image footage, search and a context menu.
- Readable versioned JSON projects (`.cadence.json`) plus debounced autosave.
- Import images by picker or drag and drop anywhere in the window.

**Layers**
- Solids, text, shapes (rectangle, ellipse, star, polygon), images, null objects and adjustment layers.
- Parenting with correct world transforms, label colours, visibility, solo, lock, blend modes.
- In/out points, layer stacking, duplicate and clipboard copy/paste.

**Animation**
- Keyframes on every transform property and every effect parameter.
- Linear, Easy Ease, Ease In, Ease Out and Hold interpolation, per keyframe.
- Custom bezier influence per keyframe (in/out percentages) for curves the presets cannot express.
- Stopwatches in the inspector, Effect Controls and timeline; keyframe diamonds, drag in time,
  multi-select, delete, right-click interpolation, previous/next keyframe navigation.
- Frame-accurate playback clock, loop, scrubbing, timeline zoom and fit.

**Compositing and effects**
- Canvas 2D compositor: per-layer offscreen render, effect chain, masks, then transform and blend.
- 19 effects: Gaussian Blur, Directional Blur, Unsharp Mask, Glow, Drop Shadow, Brightness &
  Contrast, Exposure, Hue & Saturation, Levels, Tint, Fill, Gradient Ramp, Invert, Posterize,
  Threshold, Grain, Vignette, Mosaic, Wave Warp, Turbulent Displace.
- Rectangle and ellipse masks with add/subtract, feather, rotation and opacity.
- Adjustment layers grade everything beneath them.
- Viewer with fit/actual zoom, pan, full/half/quarter preview resolution, transparency grid,
  safe frames, thirds grid and a direct-manipulation gizmo (move, scale, rotate).

**Desktop**
- Electron main process with native application menu, accelerators and file dialogs.
- Hidden title bar with in-app menu and window controls on Windows/Linux.
- Packaging config for macOS (dmg/zip), Windows (nsis/portable) and Linux (AppImage/tar.gz).

## Shortcuts (the ones you will use)

| Key | Action |
| --- | --- |
| Space | Play / pause |
| ← / → | Step one frame (Shift for ten) |
| J / K | Previous / next keyframe |
| ↑ / ↓ | Select the previous / next layer |
| F9 | Easy ease selected keyframes |
| [ / ] | Set the layer in / out point at the playhead |
| U | Show only animated properties in the timeline |
| V / H / Z | Selection / hand / zoom tool |
| T / R / E | Text / rectangle / ellipse tool |
| 0 / 1 | Fit composition / actual size |
| Ctrl+N / Ctrl+Y | New composition / new solid |
| Ctrl+Alt+K | Key every transform property on the selected layer |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+S / Ctrl+O | Save / open project |
| Ctrl+D | Duplicate layers |
| Ctrl+M | Render dialog |

The full list is in Help ▸ Keyboard Shortcuts.

## How the renderer works

1. Each visible layer renders its source into an offscreen canvas sized to the layer plus
   effect padding (blur radius, shadow spread, displacement).
2. The layer's effect stack runs over that canvas, ping-ponging through canvas operations
   (filters, composite modes) and typed-array pixel passes for tonal effects.
3. Masks clip the alpha channel of the same canvas.
4. The result is drawn into the composition with the layer's world matrix (anchor → scale →
   rotation → position, composed through parents), opacity and blend mode.
5. Adjustment layers copy the composite so far, run their effect stack over it, and replace it.

The viewer renders at display resolution times the preview setting, and exports render at full
size. Playback advances composition time from a `requestAnimationFrame` clock, so changing the
frame rate changes how many frames are shown, not how long the composition lasts.

## Project format

```json
{
  "format": "cadence-project",
  "version": 1,
  "name": "Untitled Project",
  "comps": [
    {
      "id": "comp-…", "name": "Title Card", "width": 1920, "height": 1080,
      "fps": 30, "duration": 180, "bg": "#05070c",
      "layers": [
        {
          "type": "text", "name": "Title", "inPoint": 0, "outPoint": 180,
          "transform": {
            "position": { "value": [960, 520], "keys": [] },
            "scale": { "value": [100, 100], "keys": [{ "t": 0, "v": [90, 90], "ease": "easeOut" }] }
          },
          "effects": [], "masks": []
        }
      ]
    }
  ],
  "assets": [],
  "activeCompId": "comp-…"
}
```

Keyframe times are composition frames. Imported images are inlined as data URLs so a project
file is self-contained.

## Limits worth knowing

- Video export is VP9 WebM via MediaRecorder, rendered in real time. There is no H.264, ProRes,
  image sequence, audio pipeline, render queue or output-module template system.
- No 3D layers, cameras, lights, track mattes, expressions, text animators, graph editor,
  puppet tools, Lottie interchange or After Effects project import.
- Adjustment layers apply effects to the composite below, but their own transform and opacity
  are ignored.
- Masks are created from presets and edited numerically; there is no pen tool.
- Keyframes live in composition time, not layer time, and there is no time remapping.

These are recorded honestly in `../replica/cadence/features.csv`.

## References

- Public After Effects interface documentation (Adobe Help) for the panel model and shortcuts.
- [EffectCraft](https://github.com/storytold/effectcraft) (MIT OR Apache-2.0) as an open-source
  reference for the shape of a motion-graphics feature set. Its engine is Rust/egui; no code was
  copied into this TypeScript/Canvas implementation.
- Lucide icons (ISC), React, Vite and Electron.

Demo project, interface copy, icons and palette in this repository are original to Cadence.
