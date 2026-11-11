import type { AnimatedProperty, Keyframe, Layer, PropValue, Transform, Vec2 } from '../types';

export function uid(prefix = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(16).slice(2, 10);
  return `${prefix}-${rand}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function round(n: number, digits = 1): number {
  const m = 10 ** digits;
  return Math.round(n * m) / m;
}

export function formatNumber(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '0';
  const r = round(n, digits);
  return Number.isInteger(r) ? String(r) : r.toFixed(digits);
}

export function formatTimecode(frame: number, fps: number): string {
  const safe = Math.max(0, frame);
  const totalSeconds = Math.floor(safe / fps);
  const f = Math.floor(safe % fps);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

export function formatSeconds(frame: number, fps: number): string {
  return `${formatNumber(frame / fps, 2)}s`;
}

export function num(value: PropValue | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function vec(value: PropValue | undefined, fallback: Vec2 = [0, 0]): Vec2 {
  if (Array.isArray(value) && value.length === 2) {
    return [Number(value[0]) || 0, Number(value[1]) || 0];
  }
  if (typeof value === 'number') return [value, value];
  return fallback;
}

export function str(value: PropValue | undefined, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function isColorString(value: PropValue | undefined): value is string {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const int = parseInt(h, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function mixColor(a: string, b: string, p: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * p, g1 + (g2 - g1) * p, b1 + (b2 - b1) * p);
}

/** Default properties, used by effects and new layers. */
export function prop(value: PropValue): AnimatedProperty {
  return { value, keys: [] };
}

export function key(t: number, v: PropValue, ease: Keyframe['ease'] = 'ease'): Keyframe {
  return { id: uid('key'), t, v, ease };
}

export function defaultTransform(compWidth: number, compHeight: number): Transform {
  return {
    anchor: prop([0, 0]),
    position: prop([compWidth / 2, compHeight / 2]),
    scale: prop([100, 100]),
    rotation: prop(0),
    opacity: prop(100),
  };
}

/** Sorted copy of the keyframes, so callers can rely on time order. */
export function sortedKeys(property: AnimatedProperty): Keyframe[] {
  return [...property.keys].sort((a, b) => a.t - b.t);
}

export function isAnimated(property: AnimatedProperty | null | undefined): boolean {
  return !!property && property.keys.length > 0;
}

export function layerIsVisible(layer: Layer, time: number): boolean {
  return layer.enabled && time >= layer.inPoint && time < layer.outPoint;
}
