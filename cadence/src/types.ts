export type Vec2 = [number, number];

export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}
export type PropValue = number | Vec2 | string | boolean;

export type EaseKind = 'linear' | 'ease' | 'easeIn' | 'easeOut' | 'hold' | 'bezier';

export interface Keyframe {
  id: string;
  /** Frame number in composition time. */
  t: number;
  v: PropValue;
  ease: EaseKind;
  /** 0..1 influence on the outgoing segment. Omitted means derive from the ease preset. */
  outInfluence?: number;
  /** 0..1 influence on the incoming segment. */
  inInfluence?: number;
}

/** A property is either a static value or a value with keyframes. */
export interface AnimatedProperty {
  value: PropValue;
  keys: Keyframe[];
}

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'darken', label: 'Darken' },
  { id: 'lighten', label: 'Lighten' },
  { id: 'color-dodge', label: 'Color Dodge' },
  { id: 'color-burn', label: 'Color Burn' },
  { id: 'hard-light', label: 'Hard Light' },
  { id: 'soft-light', label: 'Soft Light' },
  { id: 'difference', label: 'Difference' },
  { id: 'exclusion', label: 'Exclusion' },
  { id: 'hue', label: 'Hue' },
  { id: 'saturation', label: 'Saturation' },
  { id: 'color', label: 'Color' },
  { id: 'luminosity', label: 'Luminosity' },
];

export type LayerType = 'solid' | 'text' | 'shape' | 'image' | 'null' | 'adjustment';

export type LabelColor =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'aqua'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'grey';

export const LABEL_COLORS: Record<LabelColor, string> = {
  red: '#e2685f',
  orange: '#e8a33d',
  yellow: '#d9c95c',
  green: '#7ec26b',
  aqua: '#57b7b0',
  blue: '#5b9be0',
  purple: '#a284e0',
  pink: '#df86b4',
  grey: '#8b8b95',
};

export interface Transform {
  anchor: AnimatedProperty;
  position: AnimatedProperty;
  scale: AnimatedProperty;
  rotation: AnimatedProperty;
  opacity: AnimatedProperty;
}

export interface TextSpec {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  letterSpacing: number;
  lineHeight: number;
  color: string;
  align: 'left' | 'center' | 'right';
}

export type ShapeKind = 'rect' | 'ellipse' | 'star' | 'polygon';

export interface ShapeSpec {
  kind: ShapeKind;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  radius: number;
  points: number;
  innerRadius: number;
}

export interface SolidSpec {
  color: string;
  width: number;
  height: number;
}

export interface ImageSpec {
  assetId: string;
}

export type MaskShape = 'rect' | 'ellipse';
export type MaskMode = 'add' | 'subtract';

export interface Mask {
  id: string;
  name: string;
  shape: MaskShape;
  mode: MaskMode;
  enabled: boolean;
  position: Vec2;
  size: Vec2;
  rotation: number;
  feather: number;
  opacity: number;
}

export interface EffectInstance {
  id: string;
  defId: string;
  name: string;
  enabled: boolean;
  params: Record<string, AnimatedProperty>;
}

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  label: LabelColor;
  enabled: boolean;
  solo: boolean;
  locked: boolean;
  inPoint: number;
  outPoint: number;
  parentId: string | null;
  blend: BlendMode;
  transform: Transform;
  effects: EffectInstance[];
  masks: Mask[];
  text?: TextSpec;
  shape?: ShapeSpec;
  solid?: SolidSpec;
  image?: ImageSpec;
}

export interface Comp {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  bg: string;
  layers: Layer[];
}

export interface Asset {
  id: string;
  name: string;
  kind: 'image';
  dataUrl: string;
  width: number;
  height: number;
}

export interface Project {
  format: 'cadence-project';
  version: 1;
  name: string;
  comps: Comp[];
  assets: Asset[];
  activeCompId: string;
}

export interface KeySelection {
  layerId: string;
  path: string;
  keyId: string;
}
