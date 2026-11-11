import type { Asset, Comp, Layer, ShapeSpec, TextSpec } from '../types';
import { clamp } from '../lib/core';

const measureCanvas = document.createElement('canvas');

export const FONT_STACK =
  'Inter, "Helvetica Neue", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';

export function fontString(spec: TextSpec): string {
  return `${spec.italic ? 'italic ' : ''}${spec.fontWeight} ${Math.max(1, spec.fontSize)}px ${FONT_STACK}`;
}

export interface TextLayout {
  lines: string[];
  width: number;
  height: number;
  lineHeight: number;
  lineWidths: number[];
}

export function layoutText(spec: TextSpec): TextLayout {
  const ctx = measureCanvas.getContext('2d');
  const lines = spec.text.split('\n');
  const lineHeight = Math.max(1, spec.fontSize * spec.lineHeight);
  if (!ctx) {
    return { lines, width: spec.fontSize * 4, height: lineHeight * lines.length, lineHeight, lineWidths: [] };
  }
  ctx.font = fontString(spec);
  const typed = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  typed.letterSpacing = `${spec.letterSpacing}px`;
  const lineWidths = lines.map((line) => Math.max(spec.fontSize * 0.3, ctx.measureText(line || ' ').width));
  typed.letterSpacing = '0px';
  return {
    lines,
    width: Math.max(1, ...lineWidths),
    height: Math.max(lineHeight, lineHeight * lines.length),
    lineHeight,
    lineWidths,
  };
}

const imageCache = new Map<string, HTMLImageElement>();
let onAssetDecoded: (() => void) | null = null;

export function setAssetDecodedHandler(handler: () => void): void {
  onAssetDecoded = handler;
}

export function getLoadedImage(assetId: string, assets: Asset[]): HTMLImageElement | null {
  const asset = assets.find((a) => a.id === assetId);
  if (!asset) return null;
  const cached = imageCache.get(asset.id);
  if (cached) {
    return cached.complete && cached.naturalWidth > 0 ? cached : null;
  }
  const img = new Image();
  img.onload = () => onAssetDecoded?.();
  img.src = asset.dataUrl;
  imageCache.set(asset.id, img);
  return img.complete && img.naturalWidth > 0 ? img : null;
}

export interface ContentSize {
  w: number;
  h: number;
}

export function contentSize(layer: Layer, comp: Comp, assets: Asset[]): ContentSize {
  switch (layer.type) {
    case 'solid':
      return { w: layer.solid?.width ?? comp.width, h: layer.solid?.height ?? comp.height };
    case 'text': {
      if (!layer.text) return { w: 200, h: 80 };
      const layout = layoutText(layer.text);
      return { w: layout.width, h: layout.height };
    }
    case 'shape':
      return { w: layer.shape?.width ?? 200, h: layer.shape?.height ?? 200 };
    case 'image': {
      const asset = assets.find((a) => a.id === layer.image?.assetId);
      return { w: asset?.width ?? 640, h: asset?.height ?? 360 };
    }
    case 'null':
      return { w: 100, h: 100 };
    case 'adjustment':
      return { w: comp.width, h: comp.height };
  }
}

function pathForShape(ctx: CanvasRenderingContext2D, shape: ShapeSpec): void {
  const w = shape.width / 2;
  const h = shape.height / 2;
  ctx.beginPath();
  if (shape.kind === 'ellipse') {
    ctx.ellipse(0, 0, Math.abs(w), Math.abs(h), 0, 0, Math.PI * 2);
    return;
  }
  if (shape.kind === 'rect') {
    const r = clamp(shape.radius, 0, Math.min(Math.abs(w), Math.abs(h)));
    ctx.moveTo(-w + r, -h);
    ctx.lineTo(w - r, -h);
    ctx.quadraticCurveTo(w, -h, w, -h + r);
    ctx.lineTo(w, h - r);
    ctx.quadraticCurveTo(w, h, w - r, h);
    ctx.lineTo(-w + r, h);
    ctx.quadraticCurveTo(-w, h, -w, h - r);
    ctx.lineTo(-w, -h + r);
    ctx.quadraticCurveTo(-w, -h, -w + r, -h);
    ctx.closePath();
    return;
  }
  const points = Math.max(3, Math.round(shape.points));
  if (shape.kind === 'polygon') {
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(angle) * w;
      const py = Math.sin(angle) * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    return;
  }
  const inner = clamp(shape.innerRadius / 100, 0.05, 1);
  for (let i = 0; i < points * 2; i++) {
    const angle = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const radiusX = i % 2 === 0 ? w : w * inner;
    const radiusY = i % 2 === 0 ? h : h * inner;
    const px = Math.cos(angle) * radiusX;
    const py = Math.sin(angle) * radiusY;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export interface LayerContent {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  pad: number;
}

export function renderLayerContent(
  layer: Layer,
  comp: Comp,
  assets: Asset[],
  scale: number,
  pad: number,
): LayerContent {
  const size = contentSize(layer, comp, assets);
  const width = Math.max(1, size.w);
  const height = Math.max(1, size.h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((width + pad * 2) * scale));
  canvas.height = Math.max(1, Math.round((height + pad * 2) * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, width, height, pad };

  ctx.scale(scale, scale);
  ctx.translate(pad + width / 2, pad + height / 2);

  if (layer.type === 'solid') {
    ctx.fillStyle = layer.solid?.color ?? '#ffffff';
    ctx.fillRect(-width / 2, -height / 2, width, height);
  }

  if (layer.type === 'shape' && layer.shape) {
    const shape = layer.shape;
    pathForShape(ctx, shape);
    if (shape.fill && shape.fill !== 'none' && shape.fill !== 'transparent') {
      ctx.fillStyle = shape.fill;
      ctx.fill();
    }
    if (shape.strokeWidth > 0 && shape.stroke && shape.stroke !== 'none') {
      ctx.lineWidth = shape.strokeWidth;
      ctx.strokeStyle = shape.stroke;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  }

  if (layer.type === 'text' && layer.text) {
    const spec = layer.text;
    const layout = layoutText(spec);
    ctx.font = fontString(spec);
    const typed = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    typed.letterSpacing = `${spec.letterSpacing}px`;
    ctx.fillStyle = spec.color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    layout.lines.forEach((line, index) => {
      const lineWidth = layout.lineWidths[index] ?? layout.width;
      let x = -width / 2;
      if (spec.align === 'center') x = -lineWidth / 2;
      if (spec.align === 'right') x = width / 2 - lineWidth;
      const y = -height / 2 + layout.lineHeight * (index + 0.5);
      ctx.fillText(line, x, y);
    });
    typed.letterSpacing = '0px';
  }

  if (layer.type === 'image' && layer.image) {
    const image = getLoadedImage(layer.image.assetId, assets);
    if (image) {
      ctx.drawImage(image, -width / 2, -height / 2, width, height);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-width / 2 + 1, -height / 2 + 1, width - 2, height - 2);
      ctx.beginPath();
      ctx.moveTo(-width / 2, -height / 2);
      ctx.lineTo(width / 2, height / 2);
      ctx.moveTo(width / 2, -height / 2);
      ctx.lineTo(-width / 2, height / 2);
      ctx.stroke();
    }
  }

  return { canvas, width, height, pad };
}
