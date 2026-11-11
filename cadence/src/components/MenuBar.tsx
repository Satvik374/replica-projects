import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minus, X } from 'lucide-react';
import { MENUS, type MenuNode } from '../menus';
import { runCommand } from '../commands';
import { useEditor } from '../store';
import { BrandMark } from './BrandMark';

function MenuList({ items, onRun }: { items: MenuNode[]; onRun: (command: string) => void }) {
  return (
    <>
      {items.map((node, index) => {
        if (node.kind === 'sep') return <div className="menu-sep" key={`sep-${index}`} />;
        if (node.kind === 'sub') {
          return (
            <div className="menu-sub" key={node.label}>
              <button className="menu-entry submenu-parent" type="button">
                {node.label}
              </button>
              <div className="menu-dropdown">
                <MenuList items={node.items} onRun={onRun} />
              </div>
            </div>
          );
        }
        return (
          <button
            className="menu-entry"
            key={`${node.label}-${index}`}
            type="button"
            disabled={node.disabled}
            onClick={() => onRun(node.command)}
          >
            <span>{node.label}</span>
            {node.shortcut ? <span className="menu-shortcut">{node.shortcut}</span> : null}
          </button>
        );
      })}
    </>
  );
}

export function MenuBar() {
  const [open, setOpen] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dirty = useEditor((state) => state.dirty);
  const projectName = useEditor((state) => state.project.name);
  const desktop = typeof window !== 'undefined' ? window.cadence : undefined;

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const run = (command: string) => {
    setOpen(null);
    runCommand(command);
  };

  return (
    <header className="menubar" ref={rootRef}>
      <div className="brand">
        <BrandMark size={16} />
        <span>Cadence</span>
      </div>
      {MENUS.map((menu, index) => (
        <div className="menu-root" key={menu.label}>
          <button
            type="button"
            className={`menu-trigger${open === index ? ' open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={open === index}
            onClick={() => setOpen(open === index ? null : index)}
            onPointerEnter={() => {
              if (open !== null) setOpen(index);
            }}
          >
            {menu.label}
          </button>
          {open === index ? (
            <div className="menu-dropdown" role="menu">
              <MenuList items={menu.items} onRun={run} />
            </div>
          ) : null}
        </div>
      ))}
      <div className="menubar-spacer" />
      <div className="menubar-project" title={dirty ? 'Unsaved changes' : 'All changes saved'}>
        <span className={`save-dot${dirty ? ' dirty' : ''}`} />
        <span>{projectName}</span>
      </div>
      {desktop && desktop.platform !== 'darwin' ? (
        <div className="window-controls">
          <button type="button" aria-label="Minimize window" onClick={() => void desktop.windowAction('minimize')}>
            <Minus size={13} />
          </button>
          <button type="button" aria-label="Maximize window" onClick={() => void desktop.windowAction('maximize')}>
            <Maximize2 size={11} />
          </button>
          <button
            type="button"
            className="close"
            aria-label="Close window"
            onClick={() => void desktop.windowAction('close')}
          >
            <X size={13} />
          </button>
        </div>
      ) : null}
    </header>
  );
}
