import type { Asset, BlendMode, Comp, Layer, Mask } from '../types';
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

function drawLayer(
  ctx: CanvasRenderingContext2D,
  layer: Layer,
  comp: Comp,
  frame: number,
  scale: number,
  assets: Asset[],
  layersById: Map<string, Layer>,
): void {
  const matrix = worldMatrix(layer, layersById, frame);
  const opacity = clamp(worldOpacity(layer, layersById, frame) / 100, 0, 1);
  if (opacity <= 0) return;

  const pad = effectPadding(layer, frame);
  const content = renderLayerContent(layer, comp, assets, scale, pad);
  let rendered = applyEffects(content.canvas, layer.effects, frame, scale);
  rendered = applyMasks(rendered, layer, scale, content.width, content.height, pad);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = BLEND_MAP[layer.blend] ?? 'source-over';
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
  ctx.drawImage(
    rendered,
    -(pad + content.width / 2),
    -(pad + content.height / 2),
    content.width + pad * 2,
    content.height + pad * 2,
  );
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

  for (let i = comp.layers.length - 1; i >= 0; i--) {
    const layer = comp.layers[i];
    if (!layer.enabled) continue;
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

    drawLayer(ctx, layer, comp, frame, scale, opts.assets, layersById);
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

