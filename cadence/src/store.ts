import { create } from 'zustand';
import type {
  Asset,
  BlendMode,
  Comp,
  EaseKind,
  KeySelection,
  Layer,
  Mask,
  MaskShape,
  Project,
  PropValue,
  ShapeKind,
} from './types';
import { clamp, clone, uid } from './lib/core';
import { removeKey, moveKey, sampleProperty, upsertKey } from './lib/keyframes';
import { getProperty, withProperty } from './lib/property';
import {
  cloneComp,
  cloneLayer,
  createAdjustmentLayer,
  createAudioLayer,
  createImageLayer,
  createNullLayer,
  createShapeLayer,
  createSolidLayer,
  createTextLayer,
  makeComp,
  makeEffectInstance,
  makeEmptyProject,
  makeMask,
  nextLayerName,
  uniqueName,
  type CompSpec,
} from './lib/factory';
import { createSeedProject } from './lib/seed';
import {
  loadAutosave,
  normalizeProject,
  openProjectFile,
  saveProjectFile,
} from './lib/project';
import { readFileAsDataURL, loadImageSize } from './lib/files';
import { analyzeAudioData, detectBeatsFromSamples, loadAudioBuffer } from './lib/audio';

export type ViewFlag = 'transparency' | 'safe' | 'masks' | 'grid';
export type ViewerZoom = 'fit' | number;

export interface EditorState {
  project: Project;
  time: number;
  playing: boolean;
  loop: boolean;
  previewResolution: 1 | 0.5 | 0.25;
  selection: string[];
  selectedKeys: KeySelection[];
  expanded: Record<string, boolean>;
  viewerZoom: ViewerZoom;
  viewerPan: { x: number; y: number };
  viewFlags: Record<ViewFlag, boolean>;
  timelineZoom: number;
  animatedOnly: boolean;
  clipboard: Layer[];
  past: Project[];
  future: Project[];
  dirty: boolean;
  filePath: string | null;
  status: string;
  dragSnapshot: Project | null;
  renderVersion: number;

  setTime: (time: number) => void;
  stepTime: (frames: number) => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  setLoop: (loop: boolean) => void;
  setStatus: (status: string) => void;
  touch: () => void;
  setPreviewResolution: (resolution: 1 | 0.5 | 0.25) => void;
  setViewFlag: (flag: ViewFlag, value?: boolean) => void;
  setViewerZoom: (zoom: ViewerZoom) => void;
  setViewerPan: (pan: { x: number; y: number }) => void;
  setTimelineZoom: (zoom: number) => void;
  setAnimatedOnly: (value: boolean) => void;
  toggleExpanded: (layerId: string) => void;
  setExpanded: (layerId: string, open: boolean) => void;
  setSelection: (ids: string[]) => void;
  addToSelection: (id: string) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  setSelectedKeys: (keys: KeySelection[]) => void;
  addSolidLayer: () => void;
  addTextLayer: () => void;
  addShapeLayer: (kind: ShapeKind) => void;
  addNullLayer: () => void;
  addAdjustmentLayer: () => void;
  addImageLayer: (assetId: string) => void;
  addAudioLayer: (assetId: string) => void;
  splitSelectedLayers: () => void;
  detectAudioBeats: (layerId: string) => Promise<void>;
  addMarker: (at?: number, label?: string) => void;
  removeMarker: (markerId: string) => void;
  deleteSelectedLayers: () => void;
  duplicateSelectedLayers: () => void;
  copySelectedLayers: () => void;
  pasteLayers: () => void;
  updateLayer: (layerId: string, patch: Partial<Layer>) => void;
  renameLayer: (layerId: string, name: string) => void;
  setLayerFlag: (layerId: string, flag: 'enabled' | 'solo' | 'locked', value?: boolean) => void;
  setLayerBlend: (layerId: string, blend: BlendMode) => void;
  setLayerParent: (layerId: string, parentId: string | null) => void;
  setLayerTime: (layerId: string, inPoint: number, outPoint: number) => void;
  moveLayer: (layerId: string, targetIndex: number) => void;
  setPropertyValue: (layerId: string, path: string, value: PropValue) => void;
  toggleStopwatch: (layerId: string, path: string) => void;
  addKeyframe: (layerId: string, path: string) => void;
  deleteKeyframe: (layerId: string, path: string, keyId: string) => void;
  moveKeyframe: (layerId: string, path: string, keyId: string, frame: number) => void;
  setKeyframeEase: (layerId: string, path: string, keyId: string, ease: EaseKind) => void;
  setKeyframeInfluence: (
    layerId: string,
    path: string,
    keyId: string,
    side: 'in' | 'out',
    value: number,
  ) => void;
  deleteSelectedKeys: () => void;
  setSelectedKeysEase: (ease: EaseKind) => void;
  addEffect: (layerId: string, defId: string) => void;
  removeEffect: (layerId: string, effectId: string) => void;
  toggleEffect: (layerId: string, effectId: string, enabled: boolean) => void;
  moveEffect: (layerId: string, effectId: string, direction: -1 | 1) => void;
  addMask: (layerId: string, shape: MaskShape) => void;
  updateMask: (layerId: string, maskId: string, patch: Partial<Mask>) => void;
  removeMask: (layerId: string, maskId: string) => void;
  toggleMask: (layerId: string, maskId: string, enabled: boolean) => void;
  beginDrag: () => void;
  endDrag: () => void;
  undo: () => void;
  redo: () => void;
  newProject: () => void;
  newComp: (spec: CompSpec) => void;
  updateCompSettings: (patch: Partial<Pick<Comp, 'name' | 'width' | 'height' | 'fps' | 'duration' | 'bg'>>) => void;
  duplicateComp: (compId: string) => void;
  deleteComp: (compId: string) => void;
  setActiveComp: (compId: string) => void;
  importAssets: (files: File[]) => Promise<void>;
  removeAsset: (assetId: string) => void;
  save: (forceDialog?: boolean) => Promise<void>;
  open: () => Promise<void>;
  loadProject: (project: Project, path?: string | null) => void;
  setProjectName: (name: string) => void;
}

function activeCompOf(state: EditorState): Comp {
  return state.project.comps.find((c) => c.id === state.project.activeCompId) ?? state.project.comps[0];
}

export const useActiveComp = (): Comp =>
  useEditor((state) => state.project.comps.find((c) => c.id === state.project.activeCompId) ?? state.project.comps[0]);

export const useActiveLayers = (): Layer[] => {
  const comp = useActiveComp();
  const selection = useEditor((s) => s.selection);
  return comp.layers.filter((l) => selection.includes(l.id));
};

const initialProject = loadAutosave() ?? createSeedProject();

export const useEditor = create<EditorState>((set, get) => {
  const writeProject = (fn: (project: Project, state: EditorState) => Project, extra: Partial<EditorState> = {}) => {
    const state = get();
    const project = fn(state.project, state);
    const base: Partial<EditorState> = { project, dirty: true, renderVersion: state.renderVersion + 1, ...extra };
    if (state.dragSnapshot) {
      set(base);
      return;
    }
    set({ ...base, past: [...state.past.slice(-49), state.project], future: [] });
  };

  const writeComp = (fn: (comp: Comp, project: Project, state: EditorState) => Comp, extra: Partial<EditorState> = {}) => {
    writeProject((project, state) => {
      const current = activeCompOf(state);
      return {
        ...project,
        comps: project.comps.map((comp) => (comp.id === current.id ? fn(comp, project, state) : comp)),
      };
    }, extra);
  };

  const writeLayer = (layerId: string, fn: (layer: Layer, comp: Comp, state: EditorState) => Layer, extra: Partial<EditorState> = {}) => {
    writeComp(
      (comp, _project, state) => ({
        ...comp,
        layers: comp.layers.map((layer) => (layer.id === layerId ? fn(layer, comp, state) : layer)),
      }),
      extra,
    );
  };

  const addCreatedLayer = (create: (comp: Comp) => Layer) => {
    const comp = activeCompOf(get());
    if (!comp) return;
    const layer = create(comp);
    layer.name = nextLayerName(comp, layer.name);
    layer.outPoint = Math.min(layer.outPoint, comp.duration);
    writeComp((current) => ({ ...current, layers: [layer, ...current.layers] }), {
      selection: [layer.id],
      selectedKeys: [],
      expanded: { ...get().expanded, [layer.id]: true },
    });
    set({ status: `Added ${layer.name}.` });
  };

  return {
    project: initialProject,
    time: 0,
    playing: false,
    loop: true,
    previewResolution: 1,
    selection: [],
    selectedKeys: [],
    expanded: {},
    viewerZoom: 'fit',
    viewerPan: { x: 0, y: 0 },
    viewFlags: { transparency: false, safe: false, masks: true, grid: false },
    timelineZoom: 8,
    animatedOnly: false,
    clipboard: [],
    past: [],
    future: [],
    dirty: false,
    filePath: null,
    status: 'Ready',
    dragSnapshot: null,
    renderVersion: 0,

    setTime: (time) => {
      const comp = activeCompOf(get());
      set({ time: clamp(time, 0, comp.duration) });
    },
    stepTime: (frames) => {
      const state = get();
      const comp = activeCompOf(state);
      set({ time: clamp(Math.round(state.time) + frames, 0, comp.duration), playing: false });
    },
    togglePlay: () => {
      const state = get();
      const comp = activeCompOf(state);
      const atEnd = state.time >= comp.duration - 0.5;
      set({ playing: !state.playing, time: atEnd && !state.playing ? 0 : state.time });
    },
    setPlaying: (playing) => set({ playing }),
    setLoop: (loop) => set({ loop }),
    setStatus: (status) => set({ status }),
    touch: () => set((state) => ({ renderVersion: state.renderVersion + 1 })),
    setPreviewResolution: (previewResolution) => set({ previewResolution }),
    setViewFlag: (flag, value) =>
      set((state) => ({ viewFlags: { ...state.viewFlags, [flag]: value ?? !state.viewFlags[flag] } })),
    setViewerZoom: (viewerZoom) => set({ viewerZoom, viewerPan: viewerZoom === 'fit' ? { x: 0, y: 0 } : get().viewerPan }),
    setViewerPan: (viewerPan) => set({ viewerPan }),
    setTimelineZoom: (timelineZoom) => set({ timelineZoom: clamp(timelineZoom, 1, 40) }),
    setAnimatedOnly: (animatedOnly) => set({ animatedOnly }),
    toggleExpanded: (layerId) =>
      set((state) => ({ expanded: { ...state.expanded, [layerId]: !state.expanded[layerId] } })),
    setExpanded: (layerId, open) => set((state) => ({ expanded: { ...state.expanded, [layerId]: open } })),
    setSelection: (selection) => set({ selection, selectedKeys: [] }),
    addToSelection: (id) => set((state) => ({ selection: state.selection.includes(id) ? state.selection : [...state.selection, id] })),
    toggleSelection: (id) =>
      set((state) => ({
        selection: state.selection.includes(id) ? state.selection.filter((x) => x !== id) : [...state.selection, id],
      })),
    clearSelection: () => set({ selection: [], selectedKeys: [] }),
    setSelectedKeys: (selectedKeys) => set({ selectedKeys }),

    addSolidLayer: () => addCreatedLayer((comp) => createSolidLayer(comp)),
    addTextLayer: () => addCreatedLayer((comp) => createTextLayer(comp)),
    addShapeLayer: (kind) => addCreatedLayer((comp) => createShapeLayer(comp, kind)),
    addNullLayer: () => addCreatedLayer((comp) => createNullLayer(comp)),
    addAdjustmentLayer: () => addCreatedLayer((comp) => createAdjustmentLayer(comp)),
    addImageLayer: (assetId) => {
      const asset = get().project.assets.find((a) => a.id === assetId);
      if (!asset) return;
      addCreatedLayer((comp) => createImageLayer(comp, asset));
    },
    addAudioLayer: (assetId) => {
      const asset = get().project.assets.find((a) => a.id === assetId);
      if (!asset) return;
      addCreatedLayer((comp) => createAudioLayer(comp, asset));
    },

    splitSelectedLayers: () => {
      const state = get();
      const comp = activeCompOf(state);
      const frame = clamp(Math.round(state.time), 0, comp.duration);
      const selected = new Set(state.selection);
      if (selected.size === 0) {
        set({ status: 'Select a layer to split.' });
        return;
      }
      const next: Layer[] = [];
      const ids: string[] = [];
      for (const layer of comp.layers) {
        if (!selected.has(layer.id) || frame <= layer.inPoint + 0.001 || frame >= layer.outPoint - 0.001) {
          next.push(layer);
          continue;
        }
        const left: Layer = { ...layer, outPoint: frame };
        const right = cloneLayer(layer);
        right.inPoint = frame;
        right.outPoint = layer.outPoint;
        right.name = nextLayerName(comp, `${layer.name} 2`);
        next.push(left, right);
        ids.push(right.id);
      }
      if (ids.length === 0) {
        set({ status: 'Park the playhead inside the selected layer to split it.' });
        return;
      }
      writeComp((current) => ({ ...current, layers: next }), {
        selection: ids,
        selectedKeys: [],
        status: `Split ${ids.length} layer${ids.length === 1 ? '' : 's'} at frame ${frame}.`,
      });
    },

    detectAudioBeats: async (layerId) => {
      const state = get();
      const comp = activeCompOf(state);
      const layer = comp.layers.find((item) => item.id === layerId);
      const asset = layer?.audio ? state.project.assets.find((item) => item.id === layer.audio?.assetId) : null;
      if (!layer || !asset) {
        set({ status: 'Select an audio layer that still has its source file.' });
        return;
      }
      set({ status: `Analyzing ${asset.name}…` });
      try {
        const buffer = await loadAudioBuffer(asset);
        const mixed = new Float32Array(buffer.length);
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
          const data = buffer.getChannelData(channel);
          for (let i = 0; i < data.length; i++) mixed[i] += data[i] / buffer.numberOfChannels;
        }
        const result = detectBeatsFromSamples(mixed, buffer.sampleRate, comp.fps);
        const frames = [...new Set(result.frames.map((frame) => Math.round(layer.inPoint + frame)))]
          .filter((frame) => frame >= layer.inPoint && frame <= Math.min(layer.outPoint, comp.duration))
          .slice(0, 400);
        if (frames.length === 0) {
          set({ status: `No clear beats found in ${asset.name}.` });
          return;
        }
        writeComp(
          (current) => {
            const existing = current.markers ?? [];
            const fresh = frames.filter((frame) => !existing.some((marker) => Math.abs(marker.t - frame) < 0.5));
            if (fresh.length === 0) return current;
            return {
              ...current,
              markers: [
                ...existing,
                ...fresh.map((frame, index) => ({
                  id: uid('marker'),
                  t: frame,
                  label: `Beat ${existing.length + index + 1}`,
                  color: '#a284e0',
                })),
              ],
            };
          },
          {
            status: `Added ${frames.length} beat markers${result.bpm ? ` at about ${result.bpm} BPM` : ''}.`,
          },
        );
      } catch (error) {
        set({ status: error instanceof Error ? `Beat detection failed: ${error.message}` : 'Beat detection failed.' });
      }
    },

    addMarker: (at, label) => {
      const state = get();
      const comp = activeCompOf(state);
      const t = clamp(Math.round(at ?? state.time), 0, comp.duration);
      writeComp((current) => {
        const markers = current.markers ?? [];
        return {
          ...current,
          markers: [
            ...markers,
            { id: uid('marker'), t, label: label?.trim() || `Marker ${markers.length + 1}`, color: '#e8a33d' },
          ],
        };
      }, { status: `Added marker at frame ${t}.` });
    },
    removeMarker: (markerId) =>
      writeComp((current) => ({
        ...current,
        markers: (current.markers ?? []).filter((marker) => marker.id !== markerId),
      }), { status: 'Removed marker.' }),

    deleteSelectedLayers: () => {
      const { selection } = get();
      if (selection.length === 0) return;
      const removed = new Set(selection);
      writeComp((comp) => ({
        ...comp,
        layers: comp.layers
          .filter((layer) => !removed.has(layer.id))
          .map((layer) => (layer.parentId && removed.has(layer.parentId) ? { ...layer, parentId: null } : layer)),
      }), { selection: [], selectedKeys: [] });
      set({ status: `Deleted ${removed.size} layer${removed.size === 1 ? '' : 's'}.` });
    },
    duplicateSelectedLayers: () => {
      const comp = activeCompOf(get());
      const selected = comp.layers.filter((l) => get().selection.includes(l.id));
      if (selected.length === 0) return;
      const copies = selected.map((layer) => cloneLayer(layer));
      const selectedCopyIds = copies.map((l) => l.id);
      writeComp((current) => ({ ...current, layers: [...copies, ...current.layers] }), {
        selection: selectedCopyIds,
        selectedKeys: [],
      });
      set({ status: 'Duplicated layers.' });
    },
    copySelectedLayers: () => {
      const comp = activeCompOf(get());
      const selected = comp.layers.filter((l) => get().selection.includes(l.id));
      set({ clipboard: clone(selected), status: selected.length ? `Copied ${selected.length} layer${selected.length === 1 ? '' : 's'}.` : 'Nothing selected.' });
    },
    pasteLayers: () => {
      const clipboard = get().clipboard;
      if (clipboard.length === 0) return;
      const copies = clipboard.map((layer) => cloneLayer(layer));
      writeComp((comp) => ({ ...comp, layers: [...copies, ...comp.layers] }), {
        selection: copies.map((l) => l.id),
        selectedKeys: [],
      });
      set({ status: 'Pasted layers.' });
    },
    updateLayer: (layerId, patch) => writeLayer(layerId, (layer) => ({ ...layer, ...patch })),
    renameLayer: (layerId, name) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      writeLayer(layerId, (layer) => ({ ...layer, name: trimmed }));
    },
    setLayerFlag: (layerId, flag, value) =>
      writeLayer(layerId, (layer) => ({ ...layer, [flag]: value ?? !layer[flag] })),
    setLayerBlend: (layerId, blend) => writeLayer(layerId, (layer) => ({ ...layer, blend })),
    setLayerParent: (layerId, parentId) =>
      writeLayer(layerId, (layer) => ({ ...layer, parentId: parentId === layer.id ? null : parentId })),
    setLayerTime: (layerId, inPoint, outPoint) =>
      writeLayer(layerId, (layer) => ({
        ...layer,
        inPoint: clamp(Math.round(inPoint), 0, Number.MAX_SAFE_INTEGER),
        outPoint: clamp(Math.round(outPoint), 1, 100000),
      })),
    moveLayer: (layerId, targetIndex) =>
      writeComp((comp) => {
        const layers = [...comp.layers];
        const index = layers.findIndex((l) => l.id === layerId);
        if (index < 0) return comp;
        const [layer] = layers.splice(index, 1);
        layers.splice(clamp(targetIndex, 0, layers.length), 0, layer);
        return { ...comp, layers };
      }),

    setPropertyValue: (layerId, path, value) => {
      const state = get();
      const comp = activeCompOf(state);
      const layer = comp.layers.find((l) => l.id === layerId);
      const property = layer ? getProperty(layer, path) : null;
      if (!property) return;
      const next = property.keys.length > 0 ? upsertKey(property, state.time, value) : { ...property, value };
      writeLayer(layerId, (current) => withProperty(current, path, next));
    },
    toggleStopwatch: (layerId, path) => {
      const state = get();
      const comp = activeCompOf(state);
      const layer = comp.layers.find((l) => l.id === layerId);
      const property = layer ? getProperty(layer, path) : null;
      if (!property) return;
      if (property.keys.length > 0) {
        const fixed = clone(property.keys).find((k) => Math.abs(k.t - state.time) < 0.01);
        writeLayer(layerId, (current) =>
          withProperty(current, path, { value: fixed?.v ?? sampleProperty(property, state.time), keys: [] }),
        );
      } else {
        writeLayer(layerId, (current) =>
          withProperty(current, path, upsertKey({ ...property, keys: [] }, state.time, property.value)),
        );
      }
      set((s) => ({ expanded: { ...s.expanded, [layerId]: true } }));
    },
    addKeyframe: (layerId, path) => {
      const state = get();
      const comp = activeCompOf(state);
      const layer = comp.layers.find((l) => l.id === layerId);
      const property = layer ? getProperty(layer, path) : null;
      if (!property) return;
      const value = sampleProperty(property, state.time);
      writeLayer(layerId, (current) =>
        withProperty(current, path, upsertKey({ ...property, keys: [...property.keys] }, state.time, value)),
      );
    },
    deleteKeyframe: (layerId, path, keyId) =>
      writeLayer(layerId, (layer) => {
        const property = getProperty(layer, path);
        if (!property) return layer;
        return withProperty(layer, path, removeKey(property, keyId));
      }),
    moveKeyframe: (layerId, path, keyId, frame) => {
      const comp = activeCompOf(get());
      writeLayer(layerId, (layer) => {
        const property = getProperty(layer, path);
        if (!property) return layer;
        return withProperty(layer, path, moveKey(property, keyId, clamp(frame, 0, comp.duration)));
      });
    },
    setKeyframeEase: (layerId, path, keyId, ease) =>
      writeLayer(layerId, (layer) => {
        const property = getProperty(layer, path);
        if (!property) return layer;
        return withProperty(layer, path, {
          ...property,
          keys: property.keys.map((k) => (k.id === keyId ? { ...k, ease } : k)),
        });
      }),
    setKeyframeInfluence: (layerId, path, keyId, side, value) =>
      writeLayer(layerId, (layer) => {
        const property = getProperty(layer, path);
        if (!property) return layer;
        return withProperty(layer, path, {
          ...property,
          keys: property.keys.map((k) =>
            k.id === keyId
              ? {
                  ...k,
                  ease: 'bezier',
                  [side === 'in' ? 'inInfluence' : 'outInfluence']: clamp(value, 0, 1),
                }
              : k,
          ),
        });
      }),
    deleteSelectedKeys: () => {
      const selected = get().selectedKeys;
      if (selected.length === 0) return;
      writeProject((project, state) => {
        const comp = activeCompOf(state);
        return {
          ...project,
          comps: project.comps.map((c) =>
            c.id !== comp.id
              ? c
              : {
                  ...c,
                  layers: c.layers.map((layer) => {
                    const byPath = selected.filter((k) => k.layerId === layer.id);
                    if (byPath.length === 0) return layer;
                    let next = layer;
                    for (const entry of byPath) {
                      const property = getProperty(next, entry.path);
                      if (property) next = withProperty(next, entry.path, removeKey(property, entry.keyId));
                    }
                    return next;
                  }),
                },
          ),
        };
      }, { selectedKeys: [] });
    },
    setSelectedKeysEase: (ease) => {
      const selected = get().selectedKeys;
      if (selected.length === 0) return;
      writeProject((project, state) => {
        const comp = activeCompOf(state);
        return {
          ...project,
          comps: project.comps.map((c) =>
            c.id !== comp.id
              ? c
              : {
                  ...c,
                  layers: c.layers.map((layer) => {
                    const byPath = selected.filter((k) => k.layerId === layer.id);
                    if (byPath.length === 0) return layer;
                    let next = layer;
                    for (const entry of byPath) {
                      const property = getProperty(next, entry.path);
                      if (!property) continue;
                      next = withProperty(next, entry.path, {
                        ...property,
                        keys: property.keys.map((k) => (k.id === entry.keyId ? { ...k, ease } : k)),
                      });
                    }
                    return next;
                  }),
                },
          ),
        };
      }, { status: 'Updated keyframe interpolation.' });
    },

    addEffect: (layerId, defId) => {
      const created = makeEffectInstance(defId);
      if (!created) return;
      writeLayer(layerId, (layer) => {
        const effect = { ...created, name: uniqueName(layer.effects.map((fx) => fx.name), created.name) };
        return { ...layer, effects: [...layer.effects, effect] };
      });
      set((state) => ({ status: `Added ${created.name}.`, expanded: { ...state.expanded, [layerId]: true } }));
    },
    removeEffect: (layerId, effectId) =>
      writeLayer(layerId, (layer) => ({ ...layer, effects: layer.effects.filter((fx) => fx.id !== effectId) })),
    toggleEffect: (layerId, effectId, enabled) =>
      writeLayer(layerId, (layer) => ({
        ...layer,
        effects: layer.effects.map((fx) => (fx.id === effectId ? { ...fx, enabled } : fx)),
      })),
    moveEffect: (layerId, effectId, direction) =>
      writeLayer(layerId, (layer) => {
        const index = layer.effects.findIndex((fx) => fx.id === effectId);
        if (index < 0) return layer;
        const effects = [...layer.effects];
        const next = index + direction;
        if (next < 0 || next >= effects.length) return layer;
        [effects[index], effects[next]] = [effects[next], effects[index]];
        return { ...layer, effects };
      }),

    addMask: (layerId, shape) => {
      const comp = activeCompOf(get());
      writeLayer(layerId, (layer) => ({ ...layer, masks: [...layer.masks, makeMask(shape, comp)] }));
    },
    updateMask: (layerId, maskId, patch) =>
      writeLayer(layerId, (layer) => ({
        ...layer,
        masks: layer.masks.map((mask) => (mask.id === maskId ? { ...mask, ...patch } : mask)),
      })),
    removeMask: (layerId, maskId) =>
      writeLayer(layerId, (layer) => ({ ...layer, masks: layer.masks.filter((mask) => mask.id !== maskId) })),
    toggleMask: (layerId, maskId, enabled) =>
      writeLayer(layerId, (layer) => ({
        ...layer,
        masks: layer.masks.map((mask) => (mask.id === maskId ? { ...mask, enabled } : mask)),
      })),

    beginDrag: () => {
      if (get().dragSnapshot) return;
      set({ dragSnapshot: clone(get().project) });
    },
    endDrag: () => {
      const { dragSnapshot, project } = get();
      if (!dragSnapshot) return;
      set({
        dragSnapshot: null,
        past: [...get().past.slice(-49), dragSnapshot],
        future: [],
        dirty: true,
        project,
      });
    },
    undo: () => {
      const state = get();
      const previous = state.past[state.past.length - 1];
      if (!previous) return;
      const comp = previous.comps.find((c) => c.id === state.project.activeCompId) ?? previous.comps[0];
      set({
        project: previous,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future].slice(0, 50),
        time: clamp(state.time, 0, comp.duration),
        selection: state.selection.filter((id) => comp.layers.some((l) => l.id === id)),
        selectedKeys: [],
        status: 'Undo',
        renderVersion: state.renderVersion + 1,
      });
    },
    redo: () => {
      const state = get();
      const next = state.future[0];
      if (!next) return;
      const comp = next.comps.find((c) => c.id === state.project.activeCompId) ?? next.comps[0];
      set({
        project: next,
        past: [...state.past, state.project].slice(-50),
        future: state.future.slice(1),
        time: clamp(state.time, 0, comp.duration),
        selection: [],
        selectedKeys: [],
        status: 'Redo',
        renderVersion: state.renderVersion + 1,
      });
    },

    newProject: () => {
      const project = makeEmptyProject();
      set({
        project,
        time: 0,
        selection: [],
        selectedKeys: [],
        past: [],
        future: [],
        dirty: false,
        filePath: null,
        expanded: {},
        playing: false,
        viewerZoom: 'fit',
        viewerPan: { x: 0, y: 0 },
        status: 'New project.',
        renderVersion: get().renderVersion + 1,
      });
    },
    newComp: (spec) => {
      const comp = makeComp(spec);
      writeProject((project) => ({
        ...project,
        comps: [...project.comps, comp],
        activeCompId: comp.id,
      }), { selection: [], selectedKeys: [], time: 0, expanded: {}, status: `Created ${comp.name}.` });
    },
    updateCompSettings: (patch) =>
      writeComp((comp) => {
        const next = { ...comp, ...patch };
        const duration = patch.duration ? Math.max(1, Math.round(patch.duration)) : comp.duration;
        return {
          ...next,
          duration,
          width: patch.width ? Math.max(16, Math.round(patch.width)) : next.width,
          height: patch.height ? Math.max(16, Math.round(patch.height)) : next.height,
          fps: patch.fps ? Math.max(1, patch.fps) : next.fps,
          layers: comp.layers.map((layer) => ({
            ...layer,
            outPoint: Math.min(layer.outPoint, duration),
            inPoint: Math.min(layer.inPoint, Math.max(0, duration - 1)),
          })),
        };
      }),
    duplicateComp: (compId) => {
      const source = get().project.comps.find((c) => c.id === compId);
      if (!source) return;
      const copy = cloneComp(source, uniqueName(get().project.comps.map((c) => c.name), source.name));
      writeProject((project) => ({
        ...project,
        comps: [...project.comps, copy],
        activeCompId: copy.id,
      }), { selection: [], selectedKeys: [], time: 0, status: `Duplicated ${source.name}.` });
    },
    deleteComp: (compId) => {
      const project = get().project;
      if (project.comps.length <= 1) {
        set({ status: 'A project needs at least one composition.' });
        return;
      }
      const remaining = project.comps.filter((c) => c.id !== compId);
      writeProject(() => ({
        ...project,
        comps: remaining,
        activeCompId: project.activeCompId === compId ? remaining[0].id : project.activeCompId,
      }), { selection: [], selectedKeys: [], time: 0 });
    },
    setActiveComp: (compId) => {
      if (!get().project.comps.some((c) => c.id === compId)) return;
      writeProject((project) => ({ ...project, activeCompId: compId }), {
        selection: [],
        selectedKeys: [],
        time: 0,
        playing: false,
      });
    },

    importAssets: async (files) => {
      const imported: Asset[] = [];
      const comp = activeCompOf(get());
      set({ status: 'Importing media…' });
      for (const file of files) {
        const isImage = file.type.startsWith('image/');
        const isAudio = file.type.startsWith('audio/') || /\.(wav|mp3|m4a|aac|ogg|flac|aif|aiff)$/i.test(file.name);
        if (!isImage && !isAudio) continue;
        try {
          const dataUrl = await readFileAsDataURL(file);
          if (isImage) {
            const size = await loadImageSize(dataUrl);
            imported.push({
              id: uid('asset'),
              name: file.name,
              kind: 'image',
              dataUrl,
              width: size.w,
              height: size.h,
            });
          } else {
            const analysis = await analyzeAudioData(dataUrl, comp.fps);
            imported.push({
              id: uid('asset'),
              name: file.name,
              kind: 'audio',
              dataUrl,
              width: 0,
              height: 0,
              duration: analysis.duration,
              peaks: analysis.peaks,
              sampleRate: analysis.sampleRate,
            });
          }
        } catch {
          // Skip files that cannot be decoded.
        }
      }
      if (imported.length === 0) {
        set({ status: 'No usable image or audio files were found.' });
        return;
      }
      writeProject((project) => ({ ...project, assets: [...project.assets, ...imported] }));
      const audioCount = imported.filter((asset) => asset.kind === 'audio').length;
      set({
        status: `Imported ${imported.length} item${imported.length === 1 ? '' : 's'}${audioCount ? ` · ${audioCount} audio` : ''}. Double-click to add to the timeline.`,
        renderVersion: get().renderVersion + 1,
      });
    },
    removeAsset: (assetId) => {
      const used = get().project.comps.some((comp) =>
        comp.layers.some(
          (layer) => layer.image?.assetId === assetId || layer.audio?.assetId === assetId,
        ),
      );
      if (used) {
        set({ status: 'This item is used by a layer. Remove those layers first.' });
        return;
      }
      writeProject((project) => ({ ...project, assets: project.assets.filter((a) => a.id !== assetId) }));
    },

    save: async (forceDialog = false) => {
      const state = get();
      try {
        const result = await saveProjectFile(state.project, state.filePath, forceDialog);
        if (!result.canceled) {
          set({ filePath: result.path ?? state.filePath, dirty: false, status: `Saved ${state.project.name}.` });
        }
      } catch (error) {
        set({ status: error instanceof Error ? error.message : 'Could not save the project.' });
      }
    },
    open: async () => {
      const result = await openProjectFile();
      if (result.canceled) return;
      if (result.error) {
        set({ status: result.error });
        return;
      }
      if (result.project) get().loadProject(result.project, result.path ?? null);
    },
    loadProject: (project, path = null) => {
      const normalized = normalizeProject(project);
      set({
        project: normalized,
        time: 0,
        selection: [],
        selectedKeys: [],
        past: [],
        future: [],
        dirty: false,
        filePath: path,
        expanded: {},
        playing: false,
        status: `Opened ${normalized.name}.`,
        renderVersion: get().renderVersion + 1,
      } as Partial<EditorState>);
    },
    setProjectName: (name) => writeProject((project) => ({ ...project, name: name.trim() || 'Untitled Project' })),
  };
});

export function selectionLayerIds(state: EditorState): string[] {
  return state.selection;
}

export function findLayer(comp: Comp, layerId: string): Layer | undefined {
  return comp.layers.find((layer) => layer.id === layerId);
}

export function hasKeyframes(state: EditorState, layerId: string, path: string): boolean {
  const comp = activeCompOf(state);
  const layer = comp.layers.find((l) => l.id === layerId);
  const property = layer ? getProperty(layer, path) : null;
  return !!property && property.keys.length > 0;
}
