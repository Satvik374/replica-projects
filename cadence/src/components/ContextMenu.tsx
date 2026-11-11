import { useEffect } from 'react';
import { useEditor } from '../store';
import { useUI } from '../ui';
import { runCommand } from '../commands';
import { clamp } from '../lib/core';

type Entry = { label: string; run: () => void; danger?: boolean } | 'sep';

export function ContextMenu() {
  const menu = useUI((state) => state.contextMenu);
  const close = useUI((state) => state.closeContextMenu);

  useEffect(() => {
    if (!menu) return;
    const onPointer = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest('.context-menu')) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer, { capture: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, { capture: true });
      document.removeEventListener('keydown', onKey);
    };
  }, [menu, close]);

  if (!menu) return null;
  const editor = useEditor.getState();
  let entries: Entry[] = [];

  if (menu.kind === 'layer') {
    entries = [
      { label: 'Duplicate layer', run: () => runCommand('edit.duplicate') },
      { label: 'Copy layer', run: () => runCommand('edit.copy') },
      'sep',
      { label: 'Bring forward', run: () => runCommand('layer.bringForward') },
      { label: 'Send backward', run: () => runCommand('layer.sendBackward') },
      'sep',
      { label: 'Solo', run: () => runCommand('layer.solo') },
      { label: 'Lock', run: () => runCommand('layer.lock') },
      { label: 'Hide', run: () => runCommand('layer.visible') },
      'sep',
      { label: 'Add Gaussian Blur', run: () => runCommand('effect.add:gaussian-blur') },
      { label: 'Add Glow', run: () => runCommand('effect.add:glow') },
      'sep',
      { label: 'Delete layer', run: () => runCommand('edit.delete'), danger: true },
    ];
  } else if (menu.kind === 'keyframe') {
    const selectThis = () =>
      editor.setSelectedKeys([{ layerId: menu.layerId, path: menu.path, keyId: menu.keyId }]);
    entries = [
      { label: 'Linear', run: () => { selectThis(); useEditor.getState().setSelectedKeysEase('linear'); } },
      { label: 'Easy Ease', run: () => { selectThis(); useEditor.getState().setSelectedKeysEase('ease'); } },
      { label: 'Ease In', run: () => { selectThis(); useEditor.getState().setSelectedKeysEase('easeIn'); } },
      { label: 'Ease Out', run: () => { selectThis(); useEditor.getState().setSelectedKeysEase('easeOut'); } },
      { label: 'Hold', run: () => { selectThis(); useEditor.getState().setSelectedKeysEase('hold'); } },
      'sep',
      {
        label: 'Delete keyframe',
        danger: true,
        run: () => useEditor.getState().deleteKeyframe(menu.layerId, menu.path, menu.keyId),
      },
    ];
  } else if (menu.kind === 'comp') {
    const comp = editor.project.comps.find((c) => c.id === menu.compId);
    entries = [
      { label: 'Open in viewer', run: () => useEditor.getState().setActiveComp(menu.compId) },
      {
        label: 'Composition settings…',
        run: () => {
          useEditor.getState().setActiveComp(menu.compId);
          useUI.getState().openDialog('compSettings');
        },
      },
      'sep',
      { label: 'Duplicate composition', run: () => useEditor.getState().duplicateComp(menu.compId) },
      {
        label: 'Delete composition',
        danger: true,
        run: () => {
          if (comp && window.confirm(`Delete ${comp.name}? This cannot be undone.`)) {
            useEditor.getState().deleteComp(menu.compId);
          }
        },
      },
    ];
  } else {
    entries = [
      {
        label: 'Add as a layer',
        run: () => {
          useEditor.getState().addImageLayer(menu.assetId);
        },
      },
      'sep',
      {
        label: 'Remove from project',
        danger: true,
        run: () => useEditor.getState().removeAsset(menu.assetId),
      },
    ];
  }

  const left = clamp(menu.x, 8, window.innerWidth - 220);
  const top = clamp(menu.y, 8, window.innerHeight - (entries.length * 24 + 20));

  return (
    <div className="context-menu" style={{ left, top }} role="menu">
      {entries.map((entry, index) =>
        entry === 'sep' ? (
          <div className="menu-sep" key={`sep-${index}`} />
        ) : (
          <button
            key={entry.label}
            type="button"
            className="menu-entry"
            style={entry.danger ? { color: 'var(--danger)' } : undefined}
            onClick={() => {
              close();
              entry.run();
            }}
          >
            <span>{entry.label}</span>
          </button>
        ),
      )}
    </div>
  );
}
