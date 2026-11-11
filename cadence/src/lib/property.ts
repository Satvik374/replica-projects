import type { AnimatedProperty, Layer, PropValue } from '../types';
import { num, vec } from './core';

export interface PropertySlot {
  property: AnimatedProperty;
  label: string;
  kind: 'number' | 'percent' | 'angle' | 'point' | 'color';
  suffix?: string;
}

export const TRANSFORM_ROWS: { key: 'anchor' | 'position' | 'scale' | 'rotation' | 'opacity'; label: string; kind: PropertySlot['kind']; suffix?: string }[] = [
  { key: 'anchor', label: 'Anchor Point', kind: 'point', suffix: 'px' },
  { key: 'position', label: 'Position', kind: 'point', suffix: 'px' },
  { key: 'scale', label: 'Scale', kind: 'point', suffix: '%' },
  { key: 'rotation', label: 'Rotation', kind: 'angle', suffix: '°' },
  { key: 'opacity', label: 'Opacity', kind: 'percent', suffix: '%' },
];

export function getProperty(layer: Layer, path: string): AnimatedProperty | null {
  if (path.startsWith('transform.')) {
    const key = path.slice('transform.'.length) as keyof Layer['transform'];
    return layer.transform[key] ?? null;
  }
  if (path.startsWith('effects/')) {
    const [, effectId, paramKey] = path.split('/');
    const effect = layer.effects.find((e) => e.id === effectId);
    if (!effect) return null;
    return effect.params[paramKey] ?? null;
  }
  return null;
}

export function withProperty(layer: Layer, path: string, next: AnimatedProperty): Layer {
  if (path.startsWith('transform.')) {
    const key = path.slice('transform.'.length) as keyof Layer['transform'];
    return { ...layer, transform: { ...layer.transform, [key]: next } };
  }
  if (path.startsWith('effects/')) {
    const [, effectId, paramKey] = path.split('/');
    return {
      ...layer,
      effects: layer.effects.map((e) =>
        e.id === effectId ? { ...e, params: { ...e.params, [paramKey]: next } } : e,
      ),
    };
  }
  return layer;
}

export function formatPropertyValue(value: PropValue, kind: PropertySlot['kind'], suffix = ''): string {
  if (kind === 'point') {
    const [x, y] = vec(value);
    return `${num(x).toFixed(1)}, ${num(y).toFixed(1)}${suffix}`;
  }
  if (kind === 'color') return typeof value === 'string' ? value : '#000000';
  const n = num(value);
  if (kind === 'percent') return `${n.toFixed(1)}${suffix || '%'}`;
  if (kind === 'angle') return `${n.toFixed(1)}${suffix || '°'}`;
  return `${Number.isInteger(n) ? n : n.toFixed(2)}${suffix}`;
}

export function kindForEffectParam(kind: string): PropertySlot['kind'] {
  if (kind === 'color') return 'color';
  if (kind === 'point') return 'point';
  if (kind === 'angle') return 'angle';
  if (kind === 'percent') return 'percent';
  return 'number';
}

/**
 * Human readable property path, used in the timeline and tooltips.
 */
export function propertyLabel(layer: Layer, path: string): string {
  if (path.startsWith('transform.')) {
    const key = path.slice('transform.'.length) as keyof Layer['transform'];
    return TRANSFORM_ROWS.find((r) => r.key === key)?.label ?? key;
  }
  if (path.startsWith('effects/')) {
    const [, effectId, paramKey] = path.split('/');
    const effect = layer.effects.find((e) => e.id === effectId);
    const param = effect ? effect.params[paramKey] : null;
    return param ? paramKey : effectId;
  }
  return path;
}
