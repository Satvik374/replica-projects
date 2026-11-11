import type { Asset, BlendMode, Comp, Layer, Mask, TrackMatte } from '../types';
import { clamp } from '../lib/core';
import { sampleNumber } from '../lib/keyframes';
import { worldMatrix, worldOpacity } from '../lib/matrix';
import { applyEffects } from './effects';
import { renderLayerContent } from './content';

const BLEND_MAP: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
};

export interface RenderOptions {
  scale: number;
  assets: Asset[];
  transparent?: boolean;
}

/** Extra room around a layer so blurs, glows and shadows are not clipped. */
export function effectPadding(layer: Layer, time: number): number {
  let pad = 2;
  for (const fx of layer.effects) {
    if (!fx.enabled) continue;
    const value = (key: string, fallback: number) => sampleNumber(fx.params[key], time, fallback);
    switch (fx.defId) {
      case 'gaussian-blur':
        pad = Math.max(pad, value('blurriness', 12) * 1.6 + 4);
        break;
      case 'directional-blur':
        pad = Math.max(pad, value('length', 24) + 4);
        break;
      case 'glow':
        pad = Math.max(pad, value('radius', 40) * 1.6 + 4);
        break;
      case 'sharpen':
        pad = Math.max(pad, value('radius', 4) * 2 + 4);
        break;
      case 'drop-shadow':
        pad = Math.max(pad, value('distance', 12) + value('softness', 18) * 1.6 + 4);
        break;
      case 'wave-warp':
        pad = Math.max(pad, value('amplitude', 24) + 4);
        break;
      case 'turbulent-displace':
        pad = Math.max(pad, value('amount', 18) + 4);
        break;
      default:
        break;
    }
  }
  for (const mask of layer.masks) {
    if (mask.enabled) pad = Math.max(pad, mask.feather + 2);
  }
  return Math.min(420, pad);
}

function maskPath(ctx: CanvasRenderingContext2D, mask: Mask): void {
  const w = Math.max(1, mask.size[0] / 2);
  const h = Math.max(1, mask.size[1] / 2);
  ctx.beginPath();
  if (mask.shape === 'ellipse') ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
  else ctx.rect(-w, -h, w * 2, h * 2);
}

function applyMasks(
  source: HTMLCanvasElement,
  layer: Layer,
  scale: number,
  width: number,
  height: number,
  pad: number,
): HTMLCanvasElement {
  const active = layer.masks.filter((m) => m.enabled);
  if (active.length === 0) return source;

  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = source.width;
  maskCanvas.height = source.height;
  const mctx = maskCanvas.getContext('2d');
  if (!mctx) return source;
  mctx.scale(scale, scale);
  mctx.translate(pad + width / 2, pad + height / 2);

  for (const mask of active) {
    mctx.save();
    mctx.translate(mask.position[0], mask.position[1]);
    mctx.rotate((mask.rotation * Math.PI) / 180);
    mctx.globalAlpha = clamp(mask.opacity / 100, 0, 1);
    mctx.filter = mask.feather > 0 ? `blur(${mask.feather * scale}px)` : 'none';
    mctx.fillStyle = '#ffffff';
    if (mask.mode === 'subtract') mctx.globalCompositeOperation = 'destination-out';
    else mctx.globalCompositeOperation = 'lighter';
    maskPath(mctx, mask);
    mctx.fill();
    mctx.restore();
  }
  mctx.filter = 'none';

  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const octx = out.getContext('2d');
  if (!octx) return source;
  octx.drawImage(source, 0, 0);
  octx.globalCompositeOperation = 'destination-in';
  octx.drawImage(maskCanvas, 0, 0);
  return out;
}

/**
 * Renders a layer into a composition-sized transparent plane, with its contents, effects,
 * masks and world transform already applied. Track mattes and normal compositing both use this.
 */
function renderLayerPlane(
  layer: Layer,
  comp: Comp,
  frame: number,
  scale: number,
  assets: Asset[],
  layersById: Map<string, Layer>,
  bakeOpacity: boolean,
): HTMLCanvasElement | null {
  const opacity = clamp(worldOpacity(layer, layersById, frame) / 100, 0, 1);
  if (opacity <= 0) return null;
  const matrix = worldMatrix(layer, layersById, frame);
  const pad = effectPadding(layer, frame);
  const content = renderLayerContent(layer, comp, assets, scale, pad);
  let rendered = applyEffects(content.canvas, layer.effects, frame, scale);
  rendered = applyMasks(rendered, layer, scale, content.width, content.height, pad);

  const plane = document.createElement('canvas');
  plane.width = Math.max(1, Math.round(comp.width * scale));
  plane.height = Math.max(1, Math.round(comp.height * scale));
  const pctx = plane.getContext('2d');
  if (!pctx) return null;
  pctx.save();
  if (bakeOpacity) pctx.globalAlpha = opacity;
  pctx.setTransform(scale, 0, 0, scale, 0, 0);
  pctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
  pctx.drawImage(
    rendered,
    -(pad + content.width / 2),
    -(pad + content.height / 2),
    content.width + pad * 2,
    content.height + pad * 2,
  );
  pctx.restore();
  return plane;
}

/** Cuts the layer plane by the source layer directly above it. */
function applyTrackMatte(target: HTMLCanvasElement, matte: HTMLCanvasElement, mode: TrackMatte): void {
  const ctx = target.getContext('2d');
  if (!ctx) return;
  if (mode === 'alpha' || mode === 'alpha-inverted') {
    ctx.globalCompositeOperation = mode === 'alpha' ? 'destination-in' : 'destination-out';
    ctx.drawImage(matte, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    return;
  }
  const source = matte.getContext('2d')?.getImageData(0, 0, matte.width, matte.height);
  if (!source) return;
  const alpha = document.createElement('canvas');
  alpha.width = matte.width;
  alpha.height = matte.height;
  const alphaCtx = alpha.getContext('2d');
  if (!alphaCtx) return;
  const out = alphaCtx.createImageData(matte.width, matte.height);
  const inverted = mode === 'luma-inverted';
  for (let i = 0; i < source.data.length; i += 4) {
    const luma = 0.2126 * source.data[i] + 0.7152 * source.data[i + 1] + 0.0722 * source.data[i + 2];
    out.data[i] = 255;
    out.data[i + 1] = 255;
    out.data[i + 2] = 255;
    out.data[i + 3] = ((inverted ? 255 - luma : luma) * source.data[i + 3]) / 255;
  }
  alphaCtx.putImageData(out, 0, 0);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(alpha, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  comp: Comp,
  frame: number,
  scale: number,
  assets: Asset[],
  layersById: Map<string, Layer>,
  matte: HTMLCanvasElement | null,
): void {
  const opacity = clamp(worldOpacity(layer, layersById, frame) / 100, 0, 1);
  if (opacity <= 0) return;
  const plane = renderLayerPlane(layer, comp, frame, scale, assets, layersById, false);
  if (!plane) return;
  if (matte && layer.trackMatte && layer.trackMatte !== 'none') applyTrackMatte(plane, matte, layer.trackMatte);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = BLEND_MAP[layer.blend] ?? 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(plane, 0, 0);
  ctx.restore();
}

/** Renders one frame of a composition into a canvas at the requested scale. */
export function renderComp(target: HTMLCanvasElement, comp: Comp, frame: number, opts: RenderOptions): void {
  const scale = opts.scale;
  const width = Math.max(1, Math.round(comp.width * scale));
  const height = Math.max(1, Math.round(comp.height * scale));
  if (target.width !== width || target.height !== height) {
    target.width = width;
    target.height = height;
  }
  const ctx = target.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, width, height);
  if (!opts.transparent) {
    ctx.fillStyle = comp.bg;
    ctx.fillRect(0, 0, width, height);
  }

  const layersById = new Map(comp.layers.map((l) => [l.id, l]));
  const soloActive = comp.layers.some((l) => l.solo && l.enabled);
  const usedAsMatte = new Set<string>();

  for (let i = comp.layers.length - 1; i >= 0; i--) {
    const layer = comp.layers[i];
    if (usedAsMatte.has(layer.id)) continue;
    if (!layer.enabled) continue;
    if (layer.type === 'audio') continue;
    if (soloActive && !layer.solo) continue;
    if (frame < layer.inPoint || frame >= layer.outPoint) continue;

    if (layer.type === 'adjustment') {
      const hasEffects = layer.effects.some((fx) => fx.enabled);
      if (!hasEffects) continue;
      const copy = document.createElement('canvas');
      copy.width = target.width;
      copy.height = target.height;
      const cctx = copy.getContext('2d');
      if (!cctx) continue;
      cctx.drawImage(target, 0, 0);
      const processed = applyEffects(copy, layer.effects, frame, scale);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(processed, 0, 0);
      continue;
    }

    let matte: HTMLCanvasElement | null = null;
    const matteLayer = i > 0 ? comp.layers[i - 1] : null;
    if (
      layer.trackMatte &&
      layer.trackMatte !== 'none' &&
      matteLayer &&
      matteLayer.type !== 'audio' &&
      matteLayer.type !== 'adjustment' &&
      !usedAsMatte.has(matteLayer.id) &&
      matteLayer.enabled &&
      (!soloActive || matteLayer.solo) &&
      frame >= matteLayer.inPoint &&
      frame < matteLayer.outPoint
    ) {
      matte = renderLayerPlane(matteLayer, comp, frame, scale, opts.assets, layersById, true);
      if (matte) usedAsMatte.add(matteLayer.id);
    }

    drawLayer(ctx, layer, comp, frame, scale, opts.assets, layersById, matte);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

