import type { Layer, Project, PropValue } from '../types';
import { key, prop } from './core';
import {
  createShapeLayer,
  createSolidLayer,
  createTextLayer,
  makeComp,
  makeEffectInstance,
  makeLayer,
  makeTextSpec,
} from './factory';

function effect(defId: string, params: Record<string, PropValue> = {}) {
  const fx = makeEffectInstance(defId);
  if (!fx) throw new Error(`Unknown effect ${defId}`);
  for (const [paramKey, value] of Object.entries(params)) {
    if (fx.params[paramKey]) fx.params[paramKey].value = value;
  }
  return fx;
}

function textLayer(name: string, text: string, spec: Parameters<typeof makeTextSpec>[0]) {
  const comp = makeComp({ name: 'scratch', width: 1920, height: 1080, fps: 30, duration: 180, bg: '#000000' });
  const layer = createTextLayer(comp, text);
  layer.name = name;
  layer.text = makeTextSpec({ text, ...spec });
  return layer;
}

/**
 * A small opening project, written for Cadence: a ring orbiting a title,
 * a draw-on rule, and a grade pass. Shows keyframes, parenting and effects.
 */
export function createSeedProject(): Project {
  const main = makeComp({
    name: 'Title Card',
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 180,
    bg: '#05070c',
  });

  const backdrop = createSolidLayer(main, '#0b1020');
  backdrop.name = 'Backdrop';
  backdrop.effects = [effect('gradient-ramp', { start: '#172440', end: '#06070c', angle: 100, blend: 100 })];

  const orbit = makeLayer('null', 'Orbit', main, 'grey');
  orbit.transform.position = prop([960, 540]);
  orbit.transform.rotation = {
    value: 0,
    keys: [key(0, 0, 'linear'), key(180, -150, 'linear')],
  };

  const halo = createShapeLayer(main, 'ellipse');
  halo.name = 'Halo';
  halo.shape = {
    kind: 'ellipse',
    width: 520,
    height: 520,
    fill: 'none',
    stroke: '#3ecfa6',
    strokeWidth: 6,
    radius: 0,
    points: 6,
    innerRadius: 48,
  };
  halo.parentId = orbit.id;
  halo.transform.position = prop([0, -310]);
  halo.transform.scale = {
    value: [90, 90],
    keys: [key(0, [88, 88], 'ease'), key(60, [108, 108], 'ease'), key(120, [88, 88], 'ease')],
  };
  halo.effects = [effect('glow', { threshold: 10, radius: 34, intensity: 110 })];

  const inner = createShapeLayer(main, 'ellipse');
  inner.name = 'Core';
  inner.shape = {
    kind: 'ellipse',
    width: 140,
    height: 140,
    fill: '#f5a623',
    stroke: 'none',
    strokeWidth: 0,
    radius: 0,
    points: 6,
    innerRadius: 48,
  };
  inner.parentId = orbit.id;
  inner.transform.position = prop([0, -310]);
  inner.transform.scale = {
    value: [100, 100],
    keys: [key(0, [70, 70], 'ease'), key(45, [110, 110], 'ease'), key(90, [70, 70], 'ease')],
  };
  inner.effects = [effect('glow', { threshold: 25, radius: 46, intensity: 160 })];

  const title = textLayer('Title', 'CADENCE', {
    fontSize: 128,
    fontWeight: 700,
    letterSpacing: 14,
    color: '#f7f5ee',
    align: 'center',
    lineHeight: 1.05,
  });
  title.transform.position = prop([960, 520]);
  title.transform.scale = {
    value: [92, 92],
    keys: [key(0, [90, 90], 'easeOut'), key(42, [100, 100], 'ease')],
  };
  title.transform.opacity = { value: 100, keys: [key(0, 0, 'ease'), key(26, 100, 'ease')] };
  title.effects = [effect('glow', { threshold: 55, radius: 18, intensity: 40 })];

  const rule = createShapeLayer(main, 'rect');
  rule.name = 'Rule';
  rule.shape = {
    kind: 'rect',
    width: 460,
    height: 3,
    fill: '#f5a623',
    stroke: 'none',
    strokeWidth: 0,
    radius: 2,
    points: 6,
    innerRadius: 48,
  };
  rule.transform.position = prop([960, 610]);
  rule.transform.scale = { value: [100, 100], keys: [key(8, [6, 100], 'easeOut'), key(56, [100, 100], 'ease')] };

  const subtitle = textLayer('Subtitle', 'motion, composed', {
    fontSize: 32,
    fontWeight: 500,
    letterSpacing: 9,
    color: '#9fb3c8',
    align: 'center',
  });
  subtitle.transform.position = { value: [960, 670], keys: [key(20, [960, 690], 'easeOut'), key(60, [960, 670], 'ease')] };
  subtitle.transform.opacity = { value: 100, keys: [key(16, 0, 'ease'), key(46, 100, 'ease')] };

  const grade = makeLayer('adjustment', 'Grade', main, 'purple');
  grade.effects = [
    effect('grain', { amount: 7, size: 1, seed: 11 }),
    effect('vignette', { amount: 62, softness: 68, color: '#000000' }),
  ];

  main.layers = [grade, subtitle, rule, title, inner, halo, orbit, backdrop];

  const lower = makeComp({
    name: 'Lower Third',
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 120,
    bg: '#05070c',
  });
  const lowerBackdrop = createSolidLayer(lower, '#0a0e16');
  lowerBackdrop.name = 'Backdrop';
  const panel = createShapeLayer(lower, 'rect');
  panel.name = 'Panel';
  panel.shape = { kind: 'rect', width: 760, height: 132, fill: '#131c2b', stroke: '#22314a', strokeWidth: 2, radius: 10, points: 6, innerRadius: 48 };
  panel.transform.position = prop([990, 900]);
  const accent = createShapeLayer(lower, 'rect');
  accent.name = 'Accent';
  accent.shape = { kind: 'rect', width: 8, height: 132, fill: '#f5a623', stroke: 'none', strokeWidth: 0, radius: 2, points: 6, innerRadius: 48 };
  accent.transform.position = prop([614, 900]);
  const name = textLayer('Name', 'Riley Nakamura', { fontSize: 44, fontWeight: 600, color: '#f4f5f7', align: 'center' });
  name.transform.position = prop([1000, 878]);
  const role = textLayer('Role', 'Compositor — Studio North', { fontSize: 21, fontWeight: 400, color: '#8fa3ba', align: 'center' });
  role.transform.position = prop([1000, 922]);
  lower.layers = [role, name, accent, panel, lowerBackdrop];

  return {
    format: 'cadence-project',
    version: 1,
    name: 'Untitled Project',
    comps: [main, lower],
    assets: [],
    activeCompId: main.id,
  };
}

export const seedLayerNames: string[] = ['Backdrop', 'Halo', 'Core', 'Title', 'Rule', 'Subtitle', 'Grade', 'Orbit'];

export function describeLayer(layer: Layer): string {
  switch (layer.type) {
    case 'solid':
      return 'Solid';
    case 'text':
      return 'Text layer';
    case 'shape':
      return layer.shape ? `${layer.shape.kind[0].toUpperCase()}${layer.shape.kind.slice(1)} layer` : 'Shape layer';
    case 'image':
      return 'Footage';
    case 'null':
      return 'Null object';
    case 'adjustment':
      return 'Adjustment layer';
  }
}
