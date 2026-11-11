import type { AnimatedProperty, EaseKind, Keyframe, PropValue, Vec2 } from '../types';
import { clamp, hexToRgb, isColorString, mixColor, rgbToHex, sortedKeys } from './core';

/** CSS-style cubic bezier, solved for y at a given x. */
export function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-5) break;
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    return clamp(sampleY(t), 0, 1);
  };
}

const EASE_FNS: Record<EaseKind, (p: number) => number> = {
  linear: (p) => p,
  ease: cubicBezier(0.33, 0, 0.67, 1),
  easeIn: cubicBezier(0.42, 0, 1, 1),
  easeOut: cubicBezier(0, 0, 0.58, 1),
  hold: () => 0,
  bezier: cubicBezier(0.33, 0, 0.67, 1),
};

export function easeProgress(p: number, ease: EaseKind): number {
  return (EASE_FNS[ease] ?? EASE_FNS.linear)(p);
}

function defaultInfluence(ease: EaseKind, side: 'in' | 'out'): number {
  if (ease === 'ease' || ease === 'bezier') return 1 / 3;
  if (ease === 'easeIn') return side === 'out' ? 0.42 : 0;
  if (ease === 'easeOut') return side === 'out' ? 0 : 0.42;
  return 0;
}

/**
 * Easing for the segment between two keys, with After Effects-style influence:
 * the outgoing key's influence pulls the curve out, the incoming key's pulls it in.
 */
export function segmentEase(a: Keyframe, b: Keyframe): (p: number) => number {
  if (a.ease === 'hold') return () => 0;
  const out = clamp(a.outInfluence ?? defaultInfluence(a.ease, 'out'), 0, 1);
  const incoming = clamp(b.inInfluence ?? defaultInfluence(a.ease, 'in'), 0, 1);
  const linear =
    a.ease === 'linear' && a.outInfluence === undefined && b.inInfluence === undefined;
  if (linear) return (p) => p;
  return cubicBezier(out, 0, 1 - incoming, 1);
}

export function mixValue(a: PropValue, b: PropValue, p: number): PropValue {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * p;
  if (Array.isArray(a) && Array.isArray(b)) {
    const av = a as Vec2;
    const bv = b as Vec2;
    return [av[0] + (bv[0] - av[0]) * p, av[1] + (bv[1] - av[1]) * p] as Vec2;
  }
  if (isColorString(a) && isColorString(b) && p > 0 && p < 1) return mixColor(a, b, p);
  return p < 1 ? a : b;
}

/** Sample a property at a (possibly fractional) composition frame. */
export function sampleProperty(property: AnimatedProperty | undefined, time: number): PropValue {
  if (!property) return 0;
  const keys = sortedKeys(property);
  if (keys.length === 0) return property.value;
  if (keys.length === 1) return keys[0].v;
  if (time <= keys[0].t) return keys[0].v;
  if (time >= keys[keys.length - 1].t) return keys[keys.length - 1].v;

  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= time) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = b.t - a.t;
  if (span <= 0) return b.v;
  const p = segmentEase(a, b)((time - a.t) / span);
  return mixValue(a.v, b.v, p);
}

export function sampleNumber(property: AnimatedProperty | undefined, time: number, fallback = 0): number {
  const v = sampleProperty(property, time);
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function sampleVec(property: AnimatedProperty | undefined, time: number, fallback: Vec2 = [0, 0]): Vec2 {
  const v = sampleProperty(property, time);
  if (Array.isArray(v) && v.length === 2) return [Number(v[0]) || 0, Number(v[1]) || 0];
  if (typeof v === 'number') return [v, v];
  return fallback;
}

export function sampleColor(property: AnimatedProperty | undefined, time: number, fallback = '#000000'): string {
  const v = sampleProperty(property, time);
  return typeof v === 'string' ? v : fallback;
}

/** Find the keyframe at a frame, within a small tolerance. */
export function keyAt(property: AnimatedProperty, frame: number): Keyframe | undefined {
  return property.keys.find((k) => Math.abs(k.t - frame) < 0.01);
}

/** Add or replace a keyframe on a property without mutating it. */
export function upsertKey(property: AnimatedProperty, frame: number, value: PropValue, ease?: EaseKind): AnimatedProperty {
  const t = Math.round(frame);
  const existing = keyAt(property, t);
  if (existing) {
    return {
      ...property,
      keys: property.keys.map((k) => (k.id === existing.id ? { ...k, v: value, ease: ease ?? k.ease } : k)),
    };
  }
  const newKey: Keyframe = {
    id: `key-${Math.random().toString(16).slice(2, 10)}`,
    t,
    v: value,
    ease: ease ?? 'ease',
  };
  return { ...property, keys: [...property.keys, newKey].sort((a, b) => a.t - b.t) };
}

export function removeKey(property: AnimatedProperty, keyId: string): AnimatedProperty {
  return { ...property, keys: property.keys.filter((k) => k.id !== keyId) };
}

export function moveKey(property: AnimatedProperty, keyId: string, frame: number): AnimatedProperty {
  return {
    ...property,
    keys: property.keys
      .map((k) => (k.id === keyId ? { ...k, t: Math.round(frame) } : k))
      .sort((a, b) => a.t - b.t),
  };
}

export function colorLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function hexWithAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

export function rgbaToHex(rgba: string): string {
  const match = rgba.match(/rgba?\(([^)]+)\)/i);
  if (!match) return rgba;
  const parts = match[1].split(',').map((v) => parseFloat(v));
  return rgbToHex(parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0);
}
