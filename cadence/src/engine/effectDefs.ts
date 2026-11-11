import type { PropValue } from '../types';

export type EffectParamKind = 'number' | 'percent' | 'angle' | 'color' | 'point';

export interface EffectParamDef {
  key: string;
  label: string;
  kind: EffectParamKind;
  min?: number;
  max?: number;
  step?: number;
  defaultValue: PropValue;
}

export interface EffectDef {
  id: string;
  name: string;
  category: string;
  hint: string;
  params: EffectParamDef[];
}

export const EFFECT_CATEGORIES = [
  'Blur & Sharpen',
  'Color Correction',
  'Distort',
  'Generate',
  'Noise & Grain',
  'Stylize',
] as const;

export const EFFECTS: EffectDef[] = [
  {
    id: 'gaussian-blur',
    name: 'Gaussian Blur',
    category: 'Blur & Sharpen',
    hint: 'Softens a layer with a smooth, even blur.',
    params: [
      { key: 'blurriness', label: 'Blurriness', kind: 'number', min: 0, max: 300, step: 1, defaultValue: 12 },
    ],
  },
  {
    id: 'directional-blur',
    name: 'Directional Blur',
    category: 'Blur & Sharpen',
    hint: 'Streaks the layer along one axis. Good for speed and whips.',
    params: [
      { key: 'direction', label: 'Direction', kind: 'angle', min: -360, max: 360, step: 1, defaultValue: 0 },
      { key: 'length', label: 'Blur Length', kind: 'number', min: 0, max: 300, step: 1, defaultValue: 24 },
    ],
  },
  {
    id: 'glow',
    name: 'Glow',
    category: 'Stylize',
    hint: 'Blooms the bright parts of the layer outwards.',
    params: [
      { key: 'threshold', label: 'Threshold', kind: 'percent', min: 0, max: 100, step: 1, defaultValue: 40 },
      { key: 'radius', label: 'Radius', kind: 'number', min: 0, max: 300, step: 1, defaultValue: 40 },
      { key: 'intensity', label: 'Intensity', kind: 'percent', min: 0, max: 300, step: 1, defaultValue: 130 },
    ],
  },
  {
    id: 'sharpen',
    name: 'Unsharp Mask',
    category: 'Blur & Sharpen',
    hint: 'Adds edge contrast by subtracting a blurred copy.',
    params: [
      { key: 'amount', label: 'Amount', kind: 'percent', min: 0, max: 300, step: 1, defaultValue: 60 },
      { key: 'radius', label: 'Radius', kind: 'number', min: 0, max: 60, step: 1, defaultValue: 4 },
    ],
  },
  {
    id: 'drop-shadow',
    name: 'Drop Shadow',
    category: 'Stylize',
    hint: 'Casts the layer’s alpha channel onto a soft offset shadow.',
    params: [
      { key: 'color', label: 'Shadow Color', kind: 'color', defaultValue: '#000000' },
      { key: 'opacity', label: 'Opacity', kind: 'percent', min: 0, max: 100, step: 1, defaultValue: 60 },
      { key: 'direction', label: 'Direction', kind: 'angle', min: -360, max: 360, step: 1, defaultValue: 135 },
      { key: 'distance', label: 'Distance', kind: 'number', min: 0, max: 400, step: 1, defaultValue: 12 },
      { key: 'softness', label: 'Softness', kind: 'number', min: 0, max: 200, step: 1, defaultValue: 18 },
    ],
  },
  {
    id: 'brightness-contrast',
    name: 'Brightness & Contrast',
    category: 'Color Correction',
    hint: 'Lifts or crushes the whole layer.',
    params: [
      { key: 'brightness', label: 'Brightness', kind: 'number', min: -100, max: 100, step: 1, defaultValue: 0 },
      { key: 'contrast', label: 'Contrast', kind: 'number', min: -100, max: 100, step: 1, defaultValue: 0 },
    ],
  },
  {
    id: 'exposure',
    name: 'Exposure',
    category: 'Color Correction',
    hint: 'Exposure in stops, like a camera.',
    params: [
      { key: 'exposure', label: 'Exposure', kind: 'number', min: -4, max: 4, step: 0.05, defaultValue: 0 },
      { key: 'gamma', label: 'Gamma', kind: 'number', min: 0.1, max: 3, step: 0.05, defaultValue: 1 },
    ],
  },
  {
    id: 'hue-saturation',
    name: 'Hue & Saturation',
    category: 'Color Correction',
    hint: 'Rotates hue and pushes saturation and lightness.',
    params: [
      { key: 'hue', label: 'Master Hue', kind: 'angle', min: -180, max: 180, step: 1, defaultValue: 0 },
      { key: 'saturation', label: 'Saturation', kind: 'number', min: -100, max: 100, step: 1, defaultValue: 0 },
      { key: 'lightness', label: 'Lightness', kind: 'number', min: -100, max: 100, step: 1, defaultValue: 0 },
    ],
  },
  {
    id: 'levels',
    name: 'Levels',
    category: 'Color Correction',
    hint: 'Sets black point, white point and midtone gamma.',
    params: [
      { key: 'black', label: 'Black Point', kind: 'number', min: 0, max: 254, step: 1, defaultValue: 0 },
      { key: 'white', label: 'White Point', kind: 'number', min: 1, max: 255, step: 1, defaultValue: 255 },
      { key: 'gamma', label: 'Gamma', kind: 'number', min: 0.1, max: 3, step: 0.05, defaultValue: 1 },
    ],
  },
  {
    id: 'tint',
    name: 'Tint',
    category: 'Color Correction',
    hint: 'Maps darks and lights onto two chosen colors.',
    params: [
      { key: 'black', label: 'Map Black To', kind: 'color', defaultValue: '#20163a' },
      { key: 'white', label: 'Map White To', kind: 'color', defaultValue: '#ffd9a0' },
      { key: 'amount', label: 'Amount', kind: 'percent', min: 0, max: 100, step: 1, defaultValue: 100 },
    ],
  },
  {
    id: 'fill',
    name: 'Fill',
    category: 'Generate',
    hint: 'Floods the layer’s alpha with a solid color.',
    params: [{ key: 'color', label: 'Color', kind: 'color', defaultValue: '#f5a623' }],
  },
  {
    id: 'gradient-ramp',
    name: 'Gradient Ramp',
    category: 'Generate',
    hint: 'Paints a linear gradient across the layer bounds.',
    params: [
      { key: 'start', label: 'Start Color', kind: 'color', defaultValue: '#f5a623' },
      { key: 'end', label: 'End Color', kind: 'color', defaultValue: '#7f8cff' },
      { key: 'angle', label: 'Angle', kind: 'angle', min: -360, max: 360, step: 1, defaultValue: 90 },
      { key: 'blend', label: 'Blend', kind: 'percent', min: 0, max: 100, step: 1, defaultValue: 100 },
    ],
  },
  {
    id: 'invert',
    name: 'Invert',
    category: 'Color Correction',
    hint: 'Inverts channels, fully or by a blend amount.',
    params: [{ key: 'amount', label: 'Blend', kind: 'percent', min: 0, max: 100, step: 1, defaultValue: 100 }],
  },
  {
    id: 'posterize',
    name: 'Posterize',
    category: 'Stylize',
    hint: 'Quantizes each channel into a few flat steps.',
    params: [{ key: 'levels', label: 'Levels', kind: 'number', min: 2, max: 64, step: 1, defaultValue: 8 }],
  },
  {
    id: 'threshold',
    name: 'Threshold',
    category: 'Stylize',
    hint: 'Turns the layer into a two-tone stencil at a luminance cutoff.',
    params: [{ key: 'level', label: 'Level', kind: 'number', min: 0, max: 255, step: 1, defaultValue: 128 }],
  },
  {
    id: 'grain',
    name: 'Grain',
    category: 'Noise & Grain',
    hint: 'Adds deterministic film-style noise, stable across frames.',
    params: [
      { key: 'amount', label: 'Amount', kind: 'percent', min: 0, max: 100, step: 1, defaultValue: 14 },
      { key: 'size', label: 'Size', kind: 'number', min: 1, max: 12, step: 1, defaultValue: 1 },
      { key: 'seed', label: 'Seed', kind: 'number', min: 0, max: 999, step: 1, defaultValue: 7 },
    ],
  },
  {
    id: 'vignette',
    name: 'Vignette',
    category: 'Stylize',
    hint: 'Darkens the edges of the frame with a soft falloff.',
    params: [
      { key: 'amount', label: 'Amount', kind: 'percent', min: 0, max: 100, step: 1, defaultValue: 55 },
      { key: 'softness', label: 'Softness', kind: 'percent', min: 0, max: 100, step: 1, defaultValue: 60 },
      { key: 'color', label: 'Color', kind: 'color', defaultValue: '#000000' },
    ],
  },
  {
    id: 'mosaic',
    name: 'Mosaic',
    category: 'Stylize',
    hint: 'Splits the layer into hard blocks.',
    params: [
      { key: 'columns', label: 'Blocks Across', kind: 'number', min: 2, max: 120, step: 1, defaultValue: 24 },
      { key: 'rows', label: 'Blocks Down', kind: 'number', min: 2, max: 120, step: 1, defaultValue: 16 },
    ],
  },
  {
    id: 'wave-warp',
    name: 'Wave Warp',
    category: 'Distort',
    hint: 'Slides scanlines sideways on a sine wave. Animate Phase to travel.',
    params: [
      { key: 'amplitude', label: 'Amplitude', kind: 'number', min: 0, max: 300, step: 1, defaultValue: 24 },
      { key: 'wavelength', label: 'Wavelength', kind: 'number', min: 4, max: 400, step: 1, defaultValue: 80 },
      { key: 'phase', label: 'Phase', kind: 'angle', min: -720, max: 720, step: 1, defaultValue: 0 },
    ],
  },
  {
    id: 'turbulent-displace',
    name: 'Turbulent Displace',
    category: 'Distort',
    hint: 'Organic, noisy displacement across scanlines.',
    params: [
      { key: 'amount', label: 'Amount', kind: 'number', min: 0, max: 200, step: 1, defaultValue: 18 },
      { key: 'size', label: 'Size', kind: 'number', min: 4, max: 400, step: 1, defaultValue: 90 },
      { key: 'complexity', label: 'Complexity', kind: 'number', min: 1, max: 5, step: 1, defaultValue: 2 },
      { key: 'seed', label: 'Seed', kind: 'number', min: 0, max: 999, step: 1, defaultValue: 3 },
    ],
  },
];

export const EFFECTS_BY_ID: Record<string, EffectDef> = Object.fromEntries(EFFECTS.map((e) => [e.id, e]));

export function effectsInCategory(category: string): EffectDef[] {
  return EFFECTS.filter((e) => e.category === category);
}
