import type { Asset, Comp, Layer, Project, AnimatedProperty } from '../types';
import { uid } from './core';
import { downloadBlob, blobToBase64 } from './files';

export const AUTOSAVE_KEY = 'cadence.autosave.v1';

const desktop = () => (typeof window !== 'undefined' ? window.cadence : undefined);

function normalizeProperty(value: unknown): AnimatedProperty {
  if (value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    const p = value as Partial<AnimatedProperty>;
    return { value: p.value ?? 0, keys: Array.isArray(p.keys) ? p.keys : [] };
  }
  return { value: (value as AnimatedProperty['value']) ?? 0, keys: [] };
}

function normalizeLayer(raw: Layer): Layer {
  return {
    ...raw,
    id: raw.id || uid('layer'),
    enabled: raw.enabled !== false,
    solo: !!raw.solo,
    locked: !!raw.locked,
    inPoint: Number(raw.inPoint) || 0,
    outPoint: Number(raw.outPoint) || 1,
    parentId: raw.parentId ?? null,
    blend: raw.blend ?? 'normal',
    effects: Array.isArray(raw.effects) ? raw.effects : [],
    masks: Array.isArray(raw.masks) ? raw.masks : [],
    transform: {
      anchor: normalizeProperty(raw.transform?.anchor),
      position: normalizeProperty(raw.transform?.position),
      scale: normalizeProperty(raw.transform?.scale),
      rotation: normalizeProperty(raw.transform?.rotation),
      opacity: normalizeProperty(raw.transform?.opacity),
    },
  };
}

export function normalizeProject(raw: Project): Project {
  const comps: Comp[] = (Array.isArray(raw.comps) ? raw.comps : []).map((comp) => ({
    ...comp,
    id: comp.id || uid('comp'),
    width: Math.max(16, Number(comp.width) || 1920),
    height: Math.max(16, Number(comp.height) || 1080),
    fps: Math.max(1, Number(comp.fps) || 30),
    duration: Math.max(1, Number(comp.duration) || 150),
    bg: comp.bg || '#0b0b0f',
    layers: (Array.isArray(comp.layers) ? comp.layers : []).map(normalizeLayer),
  }));
  const assets: Asset[] = Array.isArray(raw.assets) ? raw.assets : [];
  const activeCompId = comps.some((c) => c.id === raw.activeCompId) ? raw.activeCompId : comps[0]?.id ?? '';
  return {
    format: 'cadence-project',
    version: 1,
    name: raw.name || 'Untitled Project',
    comps,
    assets,
    activeCompId,
  };
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function parseProject(json: string): Project {
  const data = JSON.parse(json) as Project;
  if (!data || typeof data !== 'object' || !Array.isArray(data.comps)) {
    throw new Error('That file is not a Cadence project.');
  }
  if (data.comps.length === 0) throw new Error('That project has no compositions.');
  return normalizeProject(data);
}

export function loadAutosave(): Project | null {
  try {
    const json = localStorage.getItem(AUTOSAVE_KEY);
    if (!json) return null;
    return parseProject(json);
  } catch {
    return null;
  }
}

export function saveAutosave(project: Project): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeProject(project));
  } catch {
    // Storage can be full when large images are imported; autosave is best effort.
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}

export interface SaveResult {
  canceled: boolean;
  path?: string;
}

export async function saveProjectFile(project: Project, path: string | null, forceDialog = false): Promise<SaveResult> {
  const json = serializeProject(project);
  const bridge = desktop();
  if (bridge) {
    const result = await bridge.saveProject({
      json,
      name: project.name,
      path: forceDialog ? null : path,
    });
    return { canceled: result.canceled, path: result.path };
  }
  downloadBlob(`${project.name || 'Untitled'}.cadence.json`, new Blob([json], { type: 'application/json' }));
  return { canceled: false, path: `${project.name || 'Untitled'}.cadence.json` };
}

export async function openProjectFile(): Promise<{ canceled: boolean; project?: Project; path?: string; error?: string }> {
  const bridge = desktop();
  if (bridge) {
    const result = await bridge.openProject();
    if (result.canceled || !result.json) return { canceled: true };
    try {
      return { canceled: false, project: parseProject(result.json), path: result.path };
    } catch (error) {
      return { canceled: false, error: error instanceof Error ? error.message : 'Could not open that project.' };
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ canceled: true });
        return;
      }
      try {
        resolve({ canceled: false, project: parseProject(await file.text()), path: file.name });
      } catch (error) {
        resolve({ canceled: false, error: error instanceof Error ? error.message : 'Could not open that project.' });
      }
    };
    input.click();
  });
}

export async function saveBinaryFile(
  defaultName: string,
  blob: Blob,
  mimeType: string,
  filters: { name: string; extensions: string[] }[],
): Promise<SaveResult> {
  const bridge = desktop();
  if (bridge) {
    const base64 = await blobToBase64(blob);
    const result = await bridge.saveBinary({ base64, defaultName, filters });
    return { canceled: result.canceled, path: result.path };
  }
  downloadBlob(defaultName, new Blob([blob], { type: mimeType }));
  return { canceled: false, path: defaultName };
}
