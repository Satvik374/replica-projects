import { useEffect, useState } from 'react';
import { MenuBar } from './components/MenuBar';
import { Toolbar } from './components/Toolbar';
import { ProjectPanel } from './components/ProjectPanel';
import { EffectsPanel } from './components/EffectsPanel';
import { Viewer } from './components/Viewer';
import { Timeline } from './components/Timeline';
import { Inspector } from './components/Inspector';
import { CharacterPanel, InfoPanel } from './components/SidePanels';
import { StatusBar } from './components/StatusBar';
import { AudioPlayback } from './components/AudioPlayback';
import { Dialogs } from './components/Dialogs';
import { ContextMenu } from './components/ContextMenu';
import { useEditor } from './store';
import { useUI } from './ui';
import { runCommand } from './commands';
import { MENUS, type MenuNode } from './menus';
import { saveAutosave } from './lib/project';

const SHORTCUT_TO_COMMAND = new Map<string, string>();

function normalizeCombo(combo: string): string {
  const parts = combo.split('+').map((part) => part.trim().toLowerCase());
  const key = parts.pop() ?? '';
  const mods = new Set(parts.map((part) => (part === 'cmd' || part === 'command' ? 'ctrl' : part)));
  const ordered = ['ctrl', 'alt', 'shift', 'meta'].filter((mod) => mods.has(mod));
  return [...ordered, key === ' ' ? 'space' : key].join('+');
}

function indexMenu(items: MenuNode[]): void {
  for (const node of items) {
    if (node.kind === 'item' && node.shortcut) SHORTCUT_TO_COMMAND.set(normalizeCombo(node.shortcut), node.command);
    if (node.kind === 'sub') indexMenu(node.items);
  }
}
MENUS.forEach((menu) => indexMenu(menu.items));

function toNativeMenu(items: MenuNode[]): unknown[] {
  return items.map((node) => {
    if (node.kind === 'sep') return { type: 'separator' };
    if (node.kind === 'sub') return { label: node.label, items: toNativeMenu(node.items) };
    const ctrl = node.shortcut?.includes('Ctrl');
    return {
      label: ctrl ? node.label : `${node.label}${node.shortcut ? `   (${node.shortcut})` : ''}`,
      accelerator: ctrl ? node.shortcut?.replace('Ctrl', 'CmdOrCtrl') : undefined,
      command: node.command,
    };
  });
}

function isEditable(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable
  );
}

export function App() {
  const showLeft = useUI((state) => state.showLeft);
  const showRight = useUI((state) => state.showRight);
  const [dragging, setDragging] = useState(false);
  const importAssets = useEditor((state) => state.importAssets);

  // Autosave the project a moment after it changes.
  useEffect(() => {
    let timer: number | undefined;
    const unsubscribe = useEditor.subscribe((state, previous) => {
      if (state.project === previous.project) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => saveAutosave(useEditor.getState().project), 700);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  // Native menu bridge for the desktop build.
  useEffect(() => {
    const bridge = window.cadence;
    if (!bridge) return;
    void bridge.setMenu(MENUS.map((menu) => ({ label: menu.label, items: toNativeMenu(menu.items) })));
    return bridge.onMenuCommand((command) => runCommand(command));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditable(event.target)) return;
      const desktop = Boolean(window.cadence);
      if (useUI.getState().dialog) return;

      if (event.key === 'Escape') {
        if (useUI.getState().contextMenu) useUI.getState().closeContextMenu();
        else useEditor.getState().clearSelection();
        return;
      }

      const parts: string[] = [];
      if (event.ctrlKey || event.metaKey) parts.push('ctrl');
      if (event.altKey) parts.push('alt');
      if (event.shiftKey) parts.push('shift');
      const rawKey = event.key === '?' ? '/' : event.key;
      parts.push(rawKey.length === 1 ? rawKey.toLowerCase() : rawKey.toLowerCase());
      let combo = parts.join('+');
      if (event.key === 'Backspace') combo = combo.replace('backspace', 'delete');

      // Ctrl/Cmd shortcuts live in the native menu when packaged.
      if (desktop && (event.ctrlKey || event.metaKey)) return;

      const command = SHORTCUT_TO_COMMAND.get(combo);
      if (command) {
        event.preventDefault();
        runCommand(command);
        return;
      }

      const state = useEditor.getState();
      if (event.code === 'Space') {
        event.preventDefault();
        state.togglePlay();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        state.stepTime(event.key === 'ArrowLeft' ? (event.shiftKey ? -10 : -1) : event.shiftKey ? 10 : 1);
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const comp = state.project.comps.find((c) => c.id === state.project.activeCompId) ?? state.project.comps[0];
        const current = comp.layers.findIndex((layer) => layer.id === state.selection[0]);
        const direction = event.key === 'ArrowUp' ? -1 : 1;
        const nextIndex = current < 0 ? 0 : Math.max(0, Math.min(comp.layers.length - 1, current + direction));
        const nextLayer = comp.layers[nextIndex];
        if (nextLayer) {
          event.preventDefault();
          state.setSelection([nextLayer.id]);
          state.setExpanded(nextLayer.id, true);
        }
        return;
      }
      if (event.altKey) return;

      const toolKeys: Record<string, 'select' | 'hand' | 'zoom' | 'text' | 'rect' | 'ellipse'> = {
        v: 'select',
        h: 'hand',
        z: 'zoom',
        t: 'text',
        r: 'rect',
        e: 'ellipse',
      };
      const tool = toolKeys[event.key.toLowerCase()];
      if (tool) {
        useUI.getState().setTool(tool);
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        if (state.selectedKeys.length > 0) state.deleteSelectedKeys();
        else state.deleteSelectedLayers();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="app"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const files = Array.from(event.dataTransfer.files).filter(
          (file) => file.type.startsWith('image/') || file.type.startsWith('audio/'),
        );
        if (files.length > 0) void importAssets(files);
        else useEditor.getState().setStatus('Drop images or WAV/MP3/M4A/OGG audio to import it.');
      }}
    >
      <MenuBar />
      <Toolbar />
      <main className={`workspace${showLeft ? '' : ' hide-project'}${showRight ? '' : ' hide-inspector'}`}>
        <ProjectPanel />
        <EffectsPanel />
        <Viewer />
        <Timeline />
        <div className="area-inspector inspector-stack">
          <Inspector />
          <InfoPanel />
          <CharacterPanel />
        </div>
      </main>
      <AudioPlayback />
      <StatusBar />
      <Dialogs />
      <ContextMenu />
      {dragging ? <div className="drop-hint">Drop images or audio to import into the project</div> : null}
    </div>
  );
}
