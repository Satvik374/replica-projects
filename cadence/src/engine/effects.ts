import type { EffectInstance } from '../types';
import { clamp, hexToRgb } from '../lib/core';
import { sampleColor, sampleNumber } from '../lib/keyframes';

type Canvas = HTMLCanvasElement;
type Ctx = CanvasRenderingContext2D;

function makeCanvas(width: number, height: number): Canvas {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function context(canvas: Canvas): Ctx {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  return ctx;
}

function cloneCanvas(source: Canvas): Canvas {
  const out = makeCanvas(source.width, source.height);
  context(out).drawImage(source, 0, 0);
  return out;
}

function drawFiltered(source: Canvas, filter: string): Canvas {
  const out = makeCanvas(source.width, source.height);
  const ctx = context(out);
  ctx.filter = filter;
  ctx.drawImage(source, 0, 0);
  return out;
}

function screenOver(base: Canvas, add: Canvas, alpha: number): Canvas {
  const out = cloneCanvas(base);
  const ctx = context(out);
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(add, 0, 0);
  return out;
}

function pixelPass(
  source: Canvas,
  fn: (r: number, g: number, b: number, a: number, x: number, y: number) => [number, number, number, number],
): Canvas {
  const out = cloneCanvas(source);
  const ctx = context(out);
  const image = ctx.getImageData(0, 0, out.width, out.height);
  const d = image.data;
  const w = out.width;
  for (let i = 0; i < d.length; i += 4) {
    const pixel = i / 4;
    const [r, g, b, a] = fn(d[i], d[i + 1], d[i + 2], d[i + 3], pixel % w, Math.floor(pixel / w));
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = a;
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function grassHash(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 144665;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function paramColor(fx: EffectInstance, key: string, time: number, fallback: string): string {
  return sampleColor(fx.params[key], time, fallback);
}

function param(fx: EffectInstance, key: string, time: number, fallback = 0): number {
  return sampleNumber(fx.params[key], time, fallback);
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

function glow(source: Canvas, fx: EffectInstance, time: number, scale: number): Canvas {
  const threshold = clamp(param(fx, 'threshold', time, 40) / 100, 0, 1);
  const radius = Math.max(0, param(fx, 'radius', time, 40)) * scale;
  const intensity = clamp(param(fx, 'intensity', time, 130) / 100, 0, 3);
  const bright = pixelPass(source, (r, g, b, a) => {
    const lum = luminance(r, g, b) / 255;
    if (lum <= threshold || a === 0) return [r, g, b, 0];
    const boost = clamp((lum - threshold) / Math.max(0.05, 1 - threshold), 0, 1);
    return [r * boost, g * boost, b * boost, a * boost];
  });
  const blurred = radius > 0.2 ? drawFiltered(bright, `blur(${radius}px)`) : bright;
  return screenOver(source, blurred, intensity);
}

function directionalBlur(source: Canvas, fx: EffectInstance, time: number, scale: number): Canvas {
  const angle = (param(fx, 'direction', time, 0) * Math.PI) / 180;
  const length = Math.max(0, param(fx, 'length', time, 24)) * scale;
  if (length < 1) return source;
  const steps = 14;
  const out = makeCanvas(source.width, source.height);
  const ctx = context(out);
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1) - 0.5;
    const dx = Math.cos(angle) * length * t;
    const dy = Math.sin(angle) * length * t;
    ctx.globalAlpha = 1 / steps;
    ctx.drawImage(source, dx, dy);
  }
  return out;
}

function dropShadow(source: Canvas, fx: EffectInstance, time: number, scale: number): Canvas {
  const color = paramColor(fx, 'color', time, '#000000');
  const opacity = clamp(param(fx, 'opacity', time, 60) / 100, 0, 1);
  const angle = (param(fx, 'direction', time, 135) * Math.PI) / 180;
  const distance = param(fx, 'distance', time, 12) * scale;
  const softness = Math.max(0, param(fx, 'softness', time, 18)) * scale;
  const out = makeCanvas(source.width, source.height);
  const ctx = context(out);
  ctx.shadowColor = withAlpha(color, opacity);
  ctx.shadowBlur = softness;
  ctx.shadowOffsetX = Math.sin(angle) * distance;
  ctx.shadowOffsetY = Math.cos(angle) * distance;
  ctx.drawImage(source, 0, 0);
  return out;
}

function unsharpMask(source: Canvas, fx: EffectInstance, time: number, scale: number): Canvas {
  const amount = clamp(param(fx, 'amount', time, 60) / 100, 0, 3);
  const radius = Math.max(0.5, param(fx, 'radius', time, 4) * scale);
  const blurred = drawFiltered(source, `blur(${radius}px)`);
  const out = cloneCanvas(source);
  const outCtx = context(out);
  const sharp = outCtx.getImageData(0, 0, out.width, out.height);
  const soft = context(blurred).getImageData(0, 0, out.width, out.height);
  const d = sharp.data;
  const b = soft.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    d[i] = clamp(d[i] + (d[i] - b[i]) * amount, 0, 255);
    d[i + 1] = clamp(d[i + 1] + (d[i + 1] - b[i + 1]) * amount, 0, 255);
    d[i + 2] = clamp(d[i + 2] + (d[i + 2] - b[i + 2]) * amount, 0, 255);
  }
  outCtx.putImageData(sharp, 0, 0);
  return out;
}

function applyOne(source: Canvas, fx: EffectInstance, time: number, scale: number): Canvas {
  switch (fx.defId) {
    case 'gaussian-blur': {
      const radius = Math.max(0, param(fx, 'blurriness', time, 12)) * scale;
      return radius > 0.1 ? drawFiltered(source, `blur(${radius}px)`) : cloneCanvas(source);
    }
    case 'directional-blur':
      return directionalBlur(source, fx, time, scale);
    case 'glow':
      return glow(source, fx, time, scale);
    case 'sharpen':
      return unsharpMask(source, fx, time, scale);
    case 'drop-shadow':
      return dropShadow(source, fx, time, scale);
    case 'brightness-contrast': {
      const brightness = 1 + param(fx, 'brightness', time, 0) / 100;
      const contrast = 1 + param(fx, 'contrast', time, 0) / 100;
      return drawFiltered(source, `brightness(${clamp(brightness, 0, 4)}) contrast(${clamp(contrast, 0, 4)})`);
    }
    case 'exposure': {
      const exposure = 2 ** param(fx, 'exposure', time, 0);
      const gamma = clamp(param(fx, 'gamma', time, 1), 0.05, 4);
      const out = pixelPass(source, (r, g, b, a) => {
        const map = (v: number) => 255 * (clamp(v / 255, 0, 1) ** (1 / gamma)) * exposure;
        return [clamp(map(r), 0, 255), clamp(map(g), 0, 255), clamp(map(b), 0, 255), a];
      });
      return out;
    }
    case 'hue-saturation': {
      const hue = param(fx, 'hue', time, 0);
      const saturation = 1 + param(fx, 'saturation', time, 0) / 100;
      const lightness = 1 + param(fx, 'lightness', time, 0) / 100;
      return drawFiltered(
        source,
        `hue-rotate(${hue}deg) saturate(${clamp(saturation, 0, 4)}) brightness(${clamp(lightness, 0, 4)})`,
      );
    }
    case 'levels': {
      const black = clamp(param(fx, 'black', time, 0), 0, 254);
      const white = Math.max(black + 1, clamp(param(fx, 'white', time, 255), 1, 255));
      const gamma = clamp(param(fx, 'gamma', time, 1), 0.05, 4);
      return pixelPass(source, (r, g, b, a) => {
        const map = (v: number) => {
          const n = clamp((v - black) / (white - black), 0, 1);
          return clamp(255 * n ** (1 / gamma), 0, 255);
        };
        return [map(r), map(g), map(b), a];
      });
    }
    case 'tint': {
      const black = paramColor(fx, 'black', time, '#20163a');
      const white = paramColor(fx, 'white', time, '#ffd9a0');
      const amount = clamp(param(fx, 'amount', time, 100) / 100, 0, 1);
      const [br, bg, bb] = hexToRgb(black);
      const [wr, wg, wb] = hexToRgb(white);
      return pixelPass(source, (r, g, b, a) => {
        const lum = luminance(r, g, b) / 255;
        const tr = br + (wr - br) * lum;
        const tg = bg + (wg - bg) * lum;
        const tb = bb + (wb - bb) * lum;
        return [r + (tr - r) * amount, g + (tg - g) * amount, b + (tb - b) * amount, a];
      });
    }
    case 'fill': {
      const out = cloneCanvas(source);
      const ctx = context(out);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = paramColor(fx, 'color', time, '#f5a623');
      ctx.fillRect(0, 0, out.width, out.height);
      return out;
    }
    case 'gradient-ramp': {
      const start = paramColor(fx, 'start', time, '#f5a623');
      const end = paramColor(fx, 'end', time, '#7f8cff');
      const angle = (param(fx, 'angle', time, 90) * Math.PI) / 180;
      const blend = clamp(param(fx, 'blend', time, 100) / 100, 0, 1);
      const out = cloneCanvas(source);
      const ctx = context(out);
      const cx = out.width / 2;
      const cy = out.height / 2;
      const reach = Math.max(out.width, out.height) / 2;
      const gradient = ctx.createLinearGradient(
        cx - Math.cos(angle) * reach,
        cy + Math.sin(angle) * reach,
        cx + Math.cos(angle) * reach,
        cy - Math.sin(angle) * reach,
      );
      gradient.addColorStop(0, start);
      gradient.addColorStop(1, end);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = blend;
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, out.width, out.height);
      return out;
    }
    case 'invert': {
      const amount = clamp(param(fx, 'amount', time, 100) / 100, 0, 1);
      return drawFiltered(source, `invert(${amount})`);
    }
    case 'posterize': {
      const levels = Math.max(2, Math.round(param(fx, 'levels', time, 8)));
      return pixelPass(source, (r, g, b, a) => {
        const map = (v: number) => Math.round((v / 255) * (levels - 1)) * (255 / (levels - 1));
        return [map(r), map(g), map(b), a];
      });
    }
    case 'threshold': {
      const level = clamp(param(fx, 'level', time, 128), 0, 255);
      return pixelPass(source, (r, g, b, a) => {
        const v = luminance(r, g, b) >= level ? 255 : 0;
        return [v, v, v, a];
      });
    }
    case 'grain': {
      const amount = clamp(param(fx, 'amount', time, 14), 0, 100) * 1.3;
      const size = Math.max(1, Math.round(param(fx, 'size', time, 1)));
      const seed = Math.round(param(fx, 'seed', time, 7));
      return pixelPass(source, (r, g, b, a, x, y) => {
        if (a === 0) return [r, g, b, a];
        const n = (grassHash(Math.floor(x / size), Math.floor(y / size), seed) - 0.5) * 2;
        return [clamp(r + n * amount, 0, 255), clamp(g + n * amount, 0, 255), clamp(b + n * amount, 0, 255), a];
      });
    }
    case 'vignette': {
      const amount = clamp(param(fx, 'amount', time, 55) / 100, 0, 1);
      const softness = clamp(param(fx, 'softness', time, 60) / 100, 0, 1);
      const color = paramColor(fx, 'color', time, '#000000');
      const out = cloneCanvas(source);
      const ctx = context(out);
      const cx = out.width / 2;
      const cy = out.height / 2;
      const radius = Math.hypot(cx, cy);
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, withAlpha(color, 0));
      gradient.addColorStop(clamp(softness * 0.85, 0.01, 0.99), withAlpha(color, 0));
      gradient.addColorStop(1, withAlpha(color, amount));
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, out.width, out.height);
      return out;
    }
    case 'mosaic': {
      const columns = Math.max(2, Math.round(param(fx, 'columns', time, 24)));
      const rows = Math.max(2, Math.round(param(fx, 'rows', time, 16)));
      const small = makeCanvas(columns, rows);
      const sctx = context(small);
      sctx.imageSmoothingEnabled = true;
      sctx.drawImage(source, 0, 0, columns, rows);
      const out = makeCanvas(source.width, source.height);
      const ctx = context(out);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, out.width, out.height);
      return out;
    }
    case 'wave-warp': {
      const amplitude = param(fx, 'amplitude', time, 24) * scale;
      const wavelength = Math.max(1, param(fx, 'wavelength', time, 80) * scale);
      const phase = (param(fx, 'phase', time, 0) * Math.PI) / 180;
      const out = makeCanvas(source.width, source.height);
      const ctx = context(out);
      const band = Math.max(1, Math.round(2 * scale));
      for (let y = 0; y < source.height; y += band) {
        const dx = Math.sin((y / wavelength) * Math.PI * 2 + phase) * amplitude;
        ctx.drawImage(source, 0, y, source.width, band, dx, y, source.width, band);
      }
      return out;
    }
    case 'turbulent-displace': {
      const amount = param(fx, 'amount', time, 18) * scale;
      const size = Math.max(4, param(fx, 'size', time, 90) * scale);
      const complexity = Math.round(param(fx, 'complexity', time, 2));
      const seed = param(fx, 'seed', time, 3);
      const out = makeCanvas(source.width, source.height);
      const ctx = context(out);
      const band = Math.max(1, Math.round(2 * scale));
      for (let y = 0; y < source.height; y += band) {
        let dx = 0;
        for (let o = 0; o < complexity; o++) {
          const freq = (Math.PI * 2) / (size / (o + 1));
          dx += Math.sin(y * freq + seed * (o + 1) * 1.7) * (amount / complexity);
        }
        ctx.drawImage(source, 0, y, source.width, band, dx, y, source.width, band);
      }
      return out;
    }
    default:
      return cloneCanvas(source);
  }
}

export function applyEffects(
  input: Canvas,
  effects: EffectInstance[],
  time: number,
  scale: number,
): Canvas {
  let current = input;
  for (const fx of effects) {
    if (!fx.enabled) continue;
    try {
      current = applyOne(current, fx, time, scale);
    } catch {
      // A single failing effect should not take down the frame.
    }
  }
  return current;
}
