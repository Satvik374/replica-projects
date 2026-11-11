import type { Layer, Matrix } from '../types';
import { sampleNumber, sampleVec } from './keyframes';

export function identity(): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

/** m1 * m2: m2 is applied to the point first, then m1. */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export function applyMatrix(m: Matrix, point: [number, number]): [number, number] {
  return [m.a * point[0] + m.c * point[1] + m.e, m.b * point[0] + m.d * point[1] + m.f];
}

export function invertMatrix(m: Matrix): Matrix {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-9) return identity();
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  };
}

/** Anchor -> scale -> rotation -> position, the order motion designers expect. */
export function localMatrix(layer: Layer, time: number): Matrix {
  const anchor = sampleVec(layer.transform.anchor, time);
  const pos = sampleVec(layer.transform.position, time);
  const scale = sampleVec(layer.transform.scale, time, [100, 100]);
  const rot = (sampleNumber(layer.transform.rotation, time) * Math.PI) / 180;

  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const sx = scale[0] / 100;
  const sy = scale[1] / 100;

  // translate(position) * rotate * scale * translate(-anchor)
  return {
    a: cos * sx,
    b: sin * sx,
    c: -sin * sy,
    d: cos * sy,
    e: pos[0] - (cos * sx * anchor[0] - sin * sy * anchor[1]),
    f: pos[1] - (sin * sx * anchor[0] + cos * sy * anchor[1]),
  };
}

export function worldMatrix(layer: Layer, layersById: Map<string, Layer>, time: number): Matrix {
  let m = localMatrix(layer, time);
  let current = layer;
  const seen = new Set<string>([layer.id]);
  for (let depth = 0; depth < 12; depth++) {
    if (!current.parentId || seen.has(current.parentId)) break;
    const parent = layersById.get(current.parentId);
    if (!parent) break;
    seen.add(parent.id);
    m = multiply(parent.enabled ? localMatrix(parent, time) : localMatrix(parent, time), m);
    current = parent;
  }
  return m;
}

/** Opacity of a layer multiplied by its ancestors, so parent fades carry down. */
export function worldOpacity(layer: Layer, layersById: Map<string, Layer>, time: number): number {
  let opacity = sampleNumber(layer.transform.opacity, time, 100);
  let current = layer;
  const seen = new Set<string>([layer.id]);
  for (let depth = 0; depth < 12; depth++) {
    if (!current.parentId || seen.has(current.parentId)) break;
    const parent = layersById.get(current.parentId);
    if (!parent) break;
    seen.add(parent.id);
    opacity = (opacity * sampleNumber(parent.transform.opacity, time, 100)) / 100;
    current = parent;
  }
  return Math.max(0, Math.min(100, opacity));
}

export function transformPoint(m: Matrix, x: number, y: number): [number, number] {
  return applyMatrix(m, [x, y]);
}

export function matrixRotation(m: Matrix): number {
  return (Math.atan2(m.b, m.a) * 180) / Math.PI;
}
