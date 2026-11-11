import { useActiveComp, useEditor } from '../store';
import { useUI } from '../ui';
import { formatTimecode } from '../lib/core';

const TOOL_NAMES: Record<string, string> = {
  select: 'Selection',
  hand: 'Hand',
  zoom: 'Zoom',
  text: 'Text',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  star: 'Star',
};

export function StatusBar() {
  const status = useEditor((state) => state.status);
  const time = useEditor((state) => state.time);
  const selection = useEditor((state) => state.selection);
  const projectName = useEditor((state) => state.project.name);
  const tool = useUI((state) => state.tool);
  const comp = useActiveComp();

  return (
    <footer className="statusbar">
      <span className="status-chip">
        <span className="dim">Frame</span>
        <span className="mono">{Math.round(time)}</span>
        <span className="dim">/ {comp.duration}</span>
      </span>
      <span className="status-chip mono">{formatTimecode(time, comp.fps)}</span>
      <span className="status-msg">{status}</span>
      <span className="status-chip">{selection.length ? `${selection.length} selected` : 'No layer selected'}</span>
      <span className="status-chip">{TOOL_NAMES[tool] ?? tool}</span>
      <span className="status-chip">{projectName}</span>
    </footer>
  );
}
