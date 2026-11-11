import { create } from 'zustand';

export type Tool = 'select' | 'hand' | 'zoom' | 'text' | 'rect' | 'ellipse' | 'star';
export type DialogKind = 'newComp' | 'compSettings' | 'render' | 'shortcuts' | 'about';

export type ContextTarget =
  | { kind: 'layer'; x: number; y: number; layerId: string }
  | { kind: 'keyframe'; x: number; y: number; layerId: string; path: string; keyId: string }
  | { kind: 'comp'; x: number; y: number; compId: string }
  | { kind: 'asset'; x: number; y: number; assetId: string };

export interface UIState {
  tool: Tool;
  setTool: (tool: Tool) => void;
  dialog: DialogKind | null;
  renderMode: 'frame' | 'video';
  openDialog: (dialog: DialogKind, options?: { renderMode?: 'frame' | 'video' }) => void;
  closeDialog: () => void;
  contextMenu: ContextTarget | null;
  openContextMenu: (target: ContextTarget) => void;
  closeContextMenu: () => void;
  cursor: [number, number] | null;
  setCursor: (cursor: [number, number] | null) => void;
  showLeft: boolean;
  showRight: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  resetWorkspace: () => void;
  projectSearch: string;
  setProjectSearch: (value: string) => void;
  fxSearch: string;
  setFxSearch: (value: string) => void;
  draggingOver: boolean;
  setDraggingOver: (value: boolean) => void;
}

export const useUI = create<UIState>((set) => ({
  tool: 'select',
  setTool: (tool) => set({ tool }),
  dialog: null,
  renderMode: 'video',
  openDialog: (dialog, options) =>
    set({ dialog, renderMode: options?.renderMode ?? (dialog === 'render' ? 'video' : 'video') }),
  closeDialog: () => set({ dialog: null }),
  contextMenu: null,
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
  cursor: null,
  setCursor: (cursor) => set({ cursor }),
  showLeft: true,
  showRight: true,
  toggleLeft: () => set((state) => ({ showLeft: !state.showLeft })),
  toggleRight: () => set((state) => ({ showRight: !state.showRight })),
  resetWorkspace: () => set({ showLeft: true, showRight: true }),
  projectSearch: '',
  setProjectSearch: (projectSearch) => set({ projectSearch }),
  fxSearch: '',
  setFxSearch: (fxSearch) => set({ fxSearch }),
  draggingOver: false,
  setDraggingOver: (draggingOver) => set({ draggingOver }),
}));
