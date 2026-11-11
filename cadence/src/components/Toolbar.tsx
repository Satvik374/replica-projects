import { Circle, Clapperboard, Hand, MousePointer2, Save, Square, Star, Type, ZoomIn } from 'lucide-react';
import { useEditor } from '../store';
import { useUI, type Tool } from '../ui';
import { runCommand } from '../commands';
import { useActiveComp } from '../store';

const TOOLS: { id: Tool; label: string; shortcut: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: 'Selection', shortcut: 'V', icon: MousePointer2 },
  { id: 'hand', label: 'Hand', shortcut: 'H', icon: Hand },
  { id: 'zoom', label: 'Zoom', shortcut: 'Z', icon: ZoomIn },
  { id: 'text', label: 'Text', shortcut: 'T', icon: Type },
  { id: 'rect', label: 'Rectangle', shortcut: 'R', icon: Square },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'E', icon: Circle },
  { id: 'star', label: 'Star', shortcut: '', icon: Star },
];

export function Toolbar() {
  const tool = useUI((state) => state.tool);
  const setTool = useUI((state) => state.setTool);
  const comp = useActiveComp();
  const dirty = useEditor((state) => state.dirty);
  const save = useEditor((state) => state.save);

  return (
    <div className="toolbar" role="toolbar" aria-label="Tools">
      <div className="tool-group">
        {TOOLS.map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.id}
              type="button"
              className={`tool-btn${tool === entry.id ? ' active' : ''}`}
              title={`${entry.label}${entry.shortcut ? ` (${entry.shortcut})` : ''}`}
              aria-label={entry.label}
              aria-pressed={tool === entry.id}
              onClick={() => setTool(entry.id)}
            >
              <Icon size={14} strokeWidth={1.6} />
            </button>
          );
        })}
      </div>
      <div className="toolbar-sep" />
      <div className="workspace-pill" title="Active composition">
        <span className="mono">{comp.name}</span>
        <span className="dim">
          {comp.width}×{comp.height} · {comp.fps} fps
        </span>
      </div>
      <div className="toolbar-spacer" />
      <button type="button" className="toolbar-btn" onClick={() => void save(false)} title="Save project (Ctrl+S)">
        <Save size={13} />
        {dirty ? 'Save' : 'Saved'}
      </button>
      <button
        type="button"
        className="toolbar-btn primary"
        onClick={() => runCommand('file.exportVideo')}
        title="Export video (Ctrl+M)"
      >
        <Clapperboard size={13} />
        Render
      </button>
    </div>
  );
}
