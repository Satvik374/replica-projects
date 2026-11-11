import type {
  Asset,
  BlendMode,
  Comp,
  EffectInstance,
  LabelColor,
  Layer,
  Mask,
  MaskShape,
  Project,
  ShapeKind,
  ShapeSpec,
  TextSpec,
  Transform,
  Keyframe,
} from '../types';
import { defaultTransform, prop, uid } from './core';
import { EFFECTS_BY_ID } from '../engine/effectDefs';

export interface CompSpec {
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  bg: string;
}

export function makeComp(spec: CompSpec): Comp {
  return {
    id: uid('comp'),
    name: spec.name,
    width: Math.max(16, Math.round(spec.width)),
    height: Math.max(16, Math.round(spec.height)),
    fps: Math.max(1, spec.fps),
    duration: Math.max(1, Math.round(spec.duration)),
    bg: spec.bg,
    layers: [],
  };
}

export function makeEmptyProject(name = 'Untitled Project'): Project {
  const comp = makeComp({
    name: 'Composition 1',
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 150,
    bg: '#0b0b0f',
  });
  return {
    format: 'cadence-project',
    version: 1,
    name,
    comps: [comp],
    assets: [],
    activeCompId: comp.id,
  };
}

export function makeTextSpec(partial: Partial<TextSpec> = {}): TextSpec {
  return {
    text: 'Your text here',
    fontFamily: 'Inter',
    fontSize: 96,
    fontWeight: 600,
    italic: false,
    letterSpacing: 0,
    lineHeight: 1.15,
    color: '#f4f4f6',
    align: 'center',
    ...partial,
  };
}

export function makeShapeSpec(kind: ShapeKind): ShapeSpec {
  return {
    kind,
    width: 320,
    height: 320,
    fill: '#f5a623',
    stroke: 'none',
    strokeWidth: 0,
    radius: 12,
    points: 6,
    innerRadius: 48,
  };
}

export function makeLayer(type: Layer['type'], name: string, comp: Comp, label: LabelColor): Layer {
  return {
    id: uid('layer'),
    name,
    type,
    label,
    enabled: true,
    solo: false,
    locked: false,
    inPoint: 0,
    outPoint: comp.duration,
    parentId: null,
    blend: 'normal',
    transform: defaultTransform(comp.width, comp.height),
    effects: [],
    masks: [],
  };
}

export function createSolidLayer(comp: Comp, color = '#26303f', width = comp.width, height = comp.height): Layer {
  const layer = makeLayer('solid', 'Solid', comp, 'blue');
  layer.solid = { color, width, height };
  return layer;
}

export function createTextLayer(comp: Comp, text = 'Your text here'): Layer {
  const layer = makeLayer('text', 'Text', comp, 'yellow');
  layer.text = makeTextSpec({ text });
  return layer;
}

export function createShapeLayer(comp: Comp, kind: ShapeKind): Layer {
  const layer = makeLayer('shape', kind === 'rect' ? 'Rectangle' : kind === 'ellipse' ? 'Ellipse' : kind === 'star' ? 'Star' : 'Polygon', comp, 'aqua');
  layer.shape = makeShapeSpec(kind);
  return layer;
}

export function createNullLayer(comp: Comp): Layer {
  return makeLayer('null', 'Null', comp, 'grey');
}

export function createAdjustmentLayer(comp: Comp): Layer {
  return makeLayer('adjustment', 'Adjustment', comp, 'purple');
}

export function createImageLayer(comp: Comp, asset: Asset): Layer {
  const layer = makeLayer('image', asset.name.replace(/\.[a-z0-9]+$/i, ''), comp, 'green');
  layer.image = { assetId: asset.id };
  layer.transform.position = prop([comp.width / 2, comp.height / 2]);
  return layer;
}

export function makeEffectInstance(defId: string): EffectInstance | null {
  const def = EFFECTS_BY_ID[defId];
  if (!def) return null;
  const params: Record<string, ReturnType<typeof prop>> = {};
  for (const param of def.params) params[param.key] = prop(param.defaultValue);
  return { id: uid('fx'), defId, name: def.name, enabled: true, params };
}

export function makeMask(shape: MaskShape, comp: Comp): Mask {
  return {
    id: uid('mask'),
    name: shape === 'ellipse' ? 'Ellipse Mask' : 'Rectangle Mask',
    shape,
    mode: 'add',
    enabled: true,
    position: [0, 0],
    size: [Math.round(comp.width * 0.7), Math.round(comp.height * 0.7)],
    rotation: 0,
    feather: 0,
    opacity: 100,
  };
}

export function uniqueName(existing: string[], base: string): string {
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export function nextLayerName(comp: Comp, base: string): string {
  return uniqueName(comp.layers.map((l) => l.name), base);
}

/** Deep clone that gives every nested object a fresh id (for duplicated comps and layers). */
export function cloneComp(comp: Comp, name: string): Comp {
  const idMap = new Map<string, string>();
  const layers: Layer[] = comp.layers.map((layer) => {
    const newId = uid('layer');
    idMap.set(layer.id, newId);
    return {
      ...layer,
      id: newId,
      effects: layer.effects.map((fx) => ({
        ...fx,
        id: uid('fx'),
        params: Object.fromEntries(
          Object.entries(fx.params).map(([k, v]) => [
            k,
            { ...v, keys: v.keys.map((kf: Keyframe) => ({ ...kf, id: uid('key') })) },
          ]),
        ),
      })),
      masks: layer.masks.map((mask) => ({ ...mask, id: uid('mask') })),
      transform: Object.fromEntries(
        Object.entries(layer.transform).map(([k, v]) => [
          k,
          { ...v, keys: v.keys.map((kf: Keyframe) => ({ ...kf, id: uid('key') })) },
        ]),
      ) as unknown as Transform,
      solid: layer.solid ? { ...layer.solid } : undefined,
      shape: layer.shape ? { ...layer.shape } : undefined,
      text: layer.text ? { ...layer.text } : undefined,
      image: layer.image ? { ...layer.image } : undefined,
    };
  });
  for (const layer of layers) {
    if (layer.parentId) layer.parentId = idMap.get(layer.parentId) ?? null;
  }
  return { ...comp, id: uid('comp'), name, layers };
}

export function cloneLayer(layer: Layer): Layer {
  return {
    ...layer,
    id: uid('layer'),
    effects: layer.effects.map((fx) => ({
      ...fx,
      id: uid('fx'),
      params: Object.fromEntries(
        Object.entries(fx.params).map(([k, v]) => [
          k,
          { ...v, keys: v.keys.map((kf: Keyframe) => ({ ...kf, id: uid('key') })) },
        ]),
      ),
    })),
    masks: layer.masks.map((mask) => ({ ...mask, id: uid('mask') })),
    transform: Object.fromEntries(
      Object.entries(layer.transform).map(([k, v]) => [
        k,
        { ...v, keys: v.keys.map((kf: Keyframe) => ({ ...kf, id: uid('key') })) },
      ]),
    ) as unknown as Transform,
    solid: layer.solid ? { ...layer.solid } : undefined,
    shape: layer.shape ? { ...layer.shape } : undefined,
    text: layer.text ? { ...layer.text } : undefined,
    image: layer.image ? { ...layer.image } : undefined,
  };
}

export const DEFAULT_BLEND: BlendMode = 'normal';
