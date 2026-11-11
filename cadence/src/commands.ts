import { useEditor } from './store';
import { useUI } from './ui';
import type { EaseKind, KeySelection } from './types';
import { getProperty } from './lib/property';
import { TRANSFORM_ROWS } from './lib/property';

const editor = () => useEditor.getState();
const ui = () => useUI.getState();

function activeComp() {
  const state = editor();
  return state.project.comps.find((c) => c.id === state.project.activeCompId) ?? state.project.comps[0];
}

function selectedLayers() {
  const comp = activeComp();
  const selection = editor().selection;
  return comp.layers.filter((layer) => selection.includes(layer.id));
}

export function pickImages(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = () => {
    if (input.files && input.files.length > 0) void editor().importAssets(Array.from(input.files));
  };
  input.click();
}

function keyframesAtPlayhead(): KeySelection[] {
  const state = editor();
  const comp = activeComp();
  const frame = Math.round(state.time);
  const keys: KeySelection[] = [];
  for (const layer of comp.layers.filter((l) => state.selection.includes(l.id))) {
    const paths = [
      ...TRANSFORM_ROWS.map((row) => `transform.${row.key}`),
      ...layer.effects.flatMap((fx) => Object.keys(fx.params).map((key) => `effects/${fx.id}/${key}`)),
    ];
    for (const path of paths) {
      const property = getProperty(layer, path);
      const hit = property?.keys.find((k) => Math.abs(k.t - frame) < 0.01);
      if (hit) keys.push({ layerId: layer.id, path, keyId: hit.id });
    }
  }
  return keys;
}

function applyEase(ease: EaseKind): void {
  const state = editor();
  if (state.selectedKeys.length === 0) {
    const keys = keyframesAtPlayhead();
    if (keys.length === 0) {
      editor().setStatus('Select keyframes, or park the playhead on one.');
      return;
    }
    state.setSelectedKeys(keys);
  }
  editor().setSelectedKeysEase(ease);
}

function keyTimes(): number[] {
  const layers = selectedLayers();
  const times: number[] = [];
  for (const layer of layers) {
    for (const row of TRANSFORM_ROWS) {
      const property = getProperty(layer, `transform.${row.key}`);
      property?.keys.forEach((k) => times.push(k.t));
    }
    layer.effects.forEach((fx) =>
      Object.values(fx.params).forEach((property) => property.keys.forEach((k) => times.push(k.t))),
    );
  }
  return [...new Set(times)].sort((a, b) => a - b);
}

function jumpToKey(direction: 1 | -1): void {
  const times = keyTimes();
  const now = editor().time;
  const next = direction === 1 ? times.find((t) => t > now + 0.01) : [...times].reverse().find((t) => t < now - 0.01);
  if (next !== undefined) editor().setTime(next);
  else editor().setStatus(direction === 1 ? 'No later keyframes.' : 'No earlier keyframes.');
}

function moveSelected(order: 'forward' | 'backward'): void {
  const state = editor();
  const comp = activeComp();
  for (const layerId of state.selection) {
    const index = comp.layers.findIndex((l) => l.id === layerId);
    if (index < 0) continue;
    const target = order === 'forward' ? index - 1 : index + 1;
    state.moveLayer(layerId, target);
  }
}

function withSelectedLayers(fn: (layerId: string) => void): void {
  const state = editor();
  if (state.selection.length === 0) {
    state.setStatus('Select a layer first.');
    return;
  }
  [...state.selection].forEach(fn);
}

export function runCommand(id: string): void {
  const state = editor();

  if (id.startsWith('effect.add:')) {
    const defId = id.slice('effect.add:'.length);
    if (state.selection.length === 0) {
      state.setStatus('Select a layer before adding an effect.');
      return;
    }
    withSelectedLayers((layerId) => state.addEffect(layerId, defId));
    return;
  }

  switch (id) {
    case 'file.new':
      if (state.dirty && !window.confirm('Start a new project? Unsaved changes will be lost.')) return;
      state.newProject();
      break;
    case 'file.newComp':
      ui().openDialog('newComp');
      break;
    case 'file.open':
      void state.open();
      break;
    case 'file.save':
      void state.save(false);
      break;
    case 'file.saveAs':
      void state.save(true);
      break;
    case 'file.compSettings':
      ui().openDialog('compSettings');
      break;
    case 'file.import':
      pickImages();
      break;
    case 'file.exportFrame':
      ui().openDialog('render', { renderMode: 'frame' });
      break;
    case 'file.exportVideo':
      ui().openDialog('render', { renderMode: 'video' });
      break;
    case 'file.quit':
      if (window.cadence) void window.cadence.windowAction('close');
      else window.close();
      break;

    case 'edit.undo':
      state.undo();
      break;
    case 'edit.redo':
      state.redo();
      break;
    case 'edit.copy':
      state.copySelectedLayers();
      break;
    case 'edit.cut':
      state.copySelectedLayers();
      state.deleteSelectedLayers();
      break;
    case 'edit.paste':
      state.pasteLayers();
      break;
    case 'edit.duplicate':
      state.duplicateSelectedLayers();
      break;
    case 'edit.delete':
      state.deleteSelectedLayers();
      break;
    case 'edit.selectAll':
      state.setSelection(activeComp().layers.map((layer) => layer.id));
      break;
    case 'edit.deselect':
      state.clearSelection();
      break;

    case 'comp.duplicate':
      state.duplicateComp(state.project.activeCompId);
      break;
    case 'comp.delete':
      state.deleteComp(state.project.activeCompId);
      break;
    case 'comp.fit':
      state.setViewerZoom('fit');
      break;
    case 'comp.actual':
      state.setViewerZoom(1);
      break;
    case 'comp.zoomIn':
      state.setViewerZoom(Math.min(8, (state.viewerZoom === 'fit' ? 0.5 : state.viewerZoom) * 1.25));
      break;
    case 'comp.zoomOut':
      state.setViewerZoom(Math.max(0.05, (state.viewerZoom === 'fit' ? 0.5 : state.viewerZoom) / 1.25));
      break;

    case 'layer.solid':
      state.addSolidLayer();
      break;
    case 'layer.text':
      state.addTextLayer();
      break;
    case 'layer.rect':
      state.addShapeLayer('rect');
      break;
    case 'layer.ellipse':
      state.addShapeLayer('ellipse');
      break;
    case 'layer.star':
      state.addShapeLayer('star');
      break;
    case 'layer.null':
      state.addNullLayer();
      break;
    case 'layer.adjustment':
      state.addAdjustmentLayer();
      break;
    case 'layer.visible':
      withSelectedLayers((layerId) => {
        const layer = activeComp().layers.find((l) => l.id === layerId);
        if (layer) state.setLayerFlag(layerId, 'enabled', !layer.enabled);
      });
      break;
    case 'layer.lock':
      withSelectedLayers((layerId) => {
        const layer = activeComp().layers.find((l) => l.id === layerId);
        if (layer) state.setLayerFlag(layerId, 'locked', !layer.locked);
      });
      break;
    case 'layer.solo':
      withSelectedLayers((layerId) => {
        const layer = activeComp().layers.find((l) => l.id === layerId);
        if (layer) state.setLayerFlag(layerId, 'solo', !layer.solo);
      });
      break;
    case 'layer.bringForward':
      moveSelected('forward');
      break;
    case 'layer.sendBackward':
      moveSelected('backward');
      break;
    case 'layer.trimIn':
      withSelectedLayers((layerId) => {
        const layer = activeComp().layers.find((l) => l.id === layerId);
        if (!layer) return;
        const frame = Math.min(Math.round(state.time), layer.outPoint - 1);
        state.setLayerTime(layerId, Math.max(0, frame), layer.outPoint);
      });
      break;
    case 'layer.trimOut':
      withSelectedLayers((layerId) => {
        const layer = activeComp().layers.find((l) => l.id === layerId);
        if (!layer) return;
        const frame = Math.max(Math.round(state.time), layer.inPoint + 1);
        state.setLayerTime(layerId, layer.inPoint, frame);
      });
      break;

    case 'effect.removeAll':
      withSelectedLayers((layerId) => {
        const layer = activeComp().layers.find((l) => l.id === layerId);
        layer?.effects.forEach((fx) => state.removeEffect(layerId, fx.id));
      });
      break;

    case 'animation.addKeys':
      withSelectedLayers((layerId) => {
        TRANSFORM_ROWS.forEach((row) => state.addKeyframe(layerId, `transform.${row.key}`));
      });
      break;
    case 'animation.easyEase':
      applyEase('ease');
      break;
    case 'animation.easeIn':
      applyEase('easeIn');
      break;
    case 'animation.easeOut':
      applyEase('easeOut');
      break;
    case 'animation.linear':
      applyEase('linear');
      break;
    case 'animation.hold':
      applyEase('hold');
      break;
    case 'animation.deleteKeys':
      state.deleteSelectedKeys();
      break;
    case 'animation.animatedOnly': {
      const next = !state.animatedOnly;
      state.setAnimatedOnly(next);
      if (next) withSelectedLayers((layerId) => state.setExpanded(layerId, true));
      state.setStatus(next ? 'Showing animated properties only.' : 'Showing all properties.');
      break;
    }
    case 'animation.twirl':
      withSelectedLayers((layerId) => state.toggleExpanded(layerId));
      break;
    case 'animation.prevKey':
      jumpToKey(-1);
      break;
    case 'animation.nextKey':
      jumpToKey(1);
      break;
    case 'animation.start':
      state.setTime(0);
      break;
    case 'animation.end':
      state.setTime(activeComp().duration);
      break;

    case 'toggle.transparency':
      state.setViewFlag('transparency');
      break;
    case 'toggle.safe':
      state.setViewFlag('safe');
      break;
    case 'toggle.masks':
      state.setViewFlag('masks');
      break;
    case 'toggle.grid':
      state.setViewFlag('grid');
      break;
    case 'workspace.reset':
      ui().resetWorkspace();
      state.setViewerZoom('fit');
      state.setViewerPan({ x: 0, y: 0 });
      state.setTimelineZoom(8);
      state.setStatus('Workspace reset.');
      break;
    case 'window.project':
      ui().toggleLeft();
      break;
    case 'window.inspector':
      ui().toggleRight();
      break;

    case 'help.shortcuts':
      ui().openDialog('shortcuts');
      break;
    case 'help.about':
      ui().openDialog('about');
      break;

    default:
      break;
  }
}

export interface ShortcutSpec {
  label: string;
  keys: string;
}

export const SHORTCUTS: ShortcutSpec[] = [
  { label: 'Play / pause', keys: 'Space' },
  { label: 'Step one frame', keys: '← / →' },
  { label: 'Step ten frames', keys: 'Shift + ← / →' },
  { label: 'Go to start / end', keys: 'Home / End' },
  { label: 'Previous / next keyframe', keys: 'J / K' },
  { label: 'Easy ease selected keys', keys: 'F9' },
  { label: 'Select / hand / zoom tool', keys: 'V / H / Z' },
  { label: 'Text tool', keys: 'T' },
  { label: 'Rectangle / ellipse tool', keys: 'R / E' },
  { label: 'Fit comp in viewer', keys: '0' },
  { label: 'Actual size', keys: '1' },
  { label: 'New composition', keys: 'Ctrl + N' },
  { label: 'New solid', keys: 'Ctrl + Y' },
  { label: 'Save project', keys: 'Ctrl + S' },
  { label: 'Duplicate layers', keys: 'Ctrl + D' },
  { label: 'Copy / paste layers', keys: 'Ctrl + C / V' },
  { label: 'Undo / redo', keys: 'Ctrl + Z / Ctrl + Shift + Z' },
  { label: 'Delete selection', keys: 'Delete' },
  { label: 'Pan viewer', keys: 'Space + drag' },
  { label: 'Zoom viewer', keys: 'Wheel' },
  { label: 'Add keyframes for transform', keys: 'Ctrl + Alt + K' },
];
