import type { Asset, Comp, Layer, Matrix, Vec2 } from '../types';
import { contentSize } from './content';
import { worldMatrix } from '../lib/matrix';

export interface LayerGeometry {
  layer: Layer;
  matrix: Matrix;
  width: number;
  height: number;
  corners: Vec2[];
  center: Vec2;
  rotation: number;
  scale: Vec2;
}

export function layerGeometry(
  layer: Layer,
  comp: Comp,
  time: number,
  assets: Asset[],
  layersById: Map<string, Layer>,
): LayerGeometry {
  const matrix = worldMatrix(layer, layersById, time);
  const size = layer.type === 'adjustment' ? { w: comp.width, h: comp.height } : contentSize(layer, comp, assets);
  const corners: Vec2[] = [
    [-size.w / 2, -size.h / 2],
    [size.w / 2, -size.h / 2],
    [size.w / 2, size.h / 2],
    [-size.w / 2, size.h / 2],
  ].map(([x, y]) => [matrix.a * x + matrix.c * y + matrix.e, matrix.b * x + matrix.d * y + matrix.f] as Vec2);
  const center: Vec2 = [matrix.e, matrix.f];
  const rotation = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
  const scale: Vec2 = [Math.hypot(matrix.a, matrix.b), Math.hypot(matrix.c, matrix.d)];
  return { layer, matrix, width: size.w, height: size.h, corners, center, rotation, scale };
}

export function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Topmost visible layer under a composition-space point. */
export function hitTestLayers(comp: Comp, point: Vec2, time: number, assets: Asset[]): Layer | null {
  const layersById = new Map(comp.layers.map((l) => [l.id, l]));
  const soloActive = comp.layers.some((l) => l.solo && l.enabled);
  for (const layer of comp.layers) {
    if (!layer.enabled || layer.locked) continue;
    if (soloActive && !layer.solo) continue;
    if (time < layer.inPoint || time >= layer.outPoint) continue;
    if (layer.type === 'null' || layer.type === 'adjustment') continue;
    const geometry = layerGeometry(layer, comp, time, assets, layersById);
    if (pointInPolygon(point, geometry.corners)) return layer;
  }
  return null;
}
