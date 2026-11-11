import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react';
import { useActiveComp, useEditor } from '../store';
import { useUI } from '../ui';
import { formatTimecode } from '../lib/core';
import type { TextSpec } from '../types';
import { Panel } from './Panel';
import { ColorField, NumberField, SelectField, TextCommitField } from './fields';

export function InfoPanel() {
  const comp = useActiveComp();
  const time = useEditor((state) => state.time);
  const zoom = useEditor((state) => state.viewerZoom);
  const resolution = useEditor((state) => state.previewResolution);
  const selection = useEditor((state) => state.selection);
  const cursor = useUI((state) => state.cursor);
  const tool = useUI((state) => state.tool);
  const layer = comp.layers.find((entry) => entry.id === selection[0]);
  const projectAssets = useEditor((state) => state.project.assets);

  return (
    <Panel title="Info" className="inspector-info">
      <div className="info-grid">
        <span className="info-key">Composition</span>
        <span className="info-value">{comp.name}</span>
        <span className="info-key">Frame</span>
        <span className="info-value">
          {Math.round(time)} / {comp.duration}
        </span>
        <span className="info-key">Timecode</span>
        <span className="info-value">{formatTimecode(time, comp.fps)}</span>
        <span className="info-key">Framerate</span>
        <span className="info-value">{comp.fps} fps</span>
        <span className="info-key">Resolution</span>
        <span className="info-value">
          {comp.width} × {comp.height} ({Math.round(resolution * 100)}%)
        </span>
        <span className="info-key">Viewer</span>
        <span className="info-value">{zoom === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`}</span>
        <span className="info-key">Pointer</span>
        <span className="info-value">{cursor ? `${cursor[0]}, ${cursor[1]} px` : '—'}</span>
        <span className="info-key">Selected</span>
        <span className="info-value">{layer ? layer.name : 'Nothing'}</span>
        <span className="info-key">Tool</span>
        <span className="info-value">{tool}</span>
        <span className="info-key">Footage</span>
        <span className="info-value">{projectAssets.length} items</span>
      </div>
    </Panel>
  );
}

export function CharacterPanel() {
  const comp = useActiveComp();
  const selection = useEditor((state) => state.selection);
  const layer = comp.layers.find((entry) => entry.id === selection[0]);
  const textLayer = layer && layer.type === 'text' && layer.text ? layer : null;

  if (!textLayer || !textLayer.text) {
    return (
      <Panel title="Character">
        <div className="panel-empty">
          <strong>No text layer selected.</strong>
          Add a text layer with the Text tool, then set its font here.
        </div>
      </Panel>
    );
  }

  const spec: TextSpec = textLayer.text;
  const update = (patch: Partial<TextSpec>) =>
    useEditor.getState().updateLayer(textLayer.id, { text: { ...spec, ...patch } });

  return (
    <Panel
      title="Character"
      actions={<span className="dim" style={{ fontSize: 'var(--text-2xs)' }}>{textLayer.name}</span>}
    >
      <div className="char-body">
        <TextCommitField
          value={spec.text}
          multiline
          ariaLabel="Text content"
          onCommit={(text) => update({ text })}
        />
        <div className="char-row">
          <span className="char-label">Font</span>
          <SelectField
            value={spec.fontFamily}
            label="Font family"
            onChange={(fontFamily) => update({ fontFamily })}
            options={[
              { value: 'Inter', label: 'Inter' },
              { value: 'Helvetica Neue', label: 'Helvetica Neue' },
              { value: 'Arial', label: 'Arial' },
              { value: 'Georgia', label: 'Georgia' },
              { value: 'Times New Roman', label: 'Times New Roman' },
              { value: 'Courier New', label: 'Courier New' },
              { value: 'Verdana', label: 'Verdana' },
              { value: 'Trebuchet MS', label: 'Trebuchet MS' },
              { value: 'Menlo', label: 'Menlo' },
            ]}
          />
        </div>
        <div className="char-row">
          <span className="char-label">Style</span>
          <SelectField
            value={String(spec.fontWeight)}
            label="Font weight"
            onChange={(weight) => update({ fontWeight: Number(weight) })}
            options={[
              { value: '300', label: 'Light' },
              { value: '400', label: 'Regular' },
              { value: '500', label: 'Medium' },
              { value: '600', label: 'Semibold' },
              { value: '700', label: 'Bold' },
              { value: '800', label: 'Black' },
            ]}
          />
          <button
            type="button"
            className="ease-btn"
            aria-pressed={spec.italic}
            style={spec.italic ? { color: 'var(--accent)', borderColor: 'var(--accent-line)' } : undefined}
            title="Italic"
            onClick={() => update({ italic: !spec.italic })}
          >
            I
          </button>
        </div>
        <div className="char-row">
          <span className="char-label">Size</span>
          <NumberField
            value={spec.fontSize}
            onChange={(fontSize) => update({ fontSize })}
            min={1}
            max={2000}
            unit="px"
            label="Font size"
          />
        </div>
        <div className="char-row">
          <span className="char-label">Leading</span>
          <NumberField
            value={spec.lineHeight}
            onChange={(lineHeight) => update({ lineHeight })}
            min={0.5}
            max={4}
            step={0.05}
            precision={2}
            label="Line height"
          />
          <span className="char-label" style={{ width: 'auto' }}>
            Tracking
          </span>
          <NumberField
            value={spec.letterSpacing}
            onChange={(letterSpacing) => update({ letterSpacing })}
            min={-50}
            max={200}
            unit="px"
            label="Tracking"
          />
        </div>
        <div className="char-row">
          <span className="char-label">Color</span>
          <ColorField value={spec.color} onChange={(color) => update({ color })} label="Text color" />
        </div>
        <div className="char-row">
          <span className="char-label">Align</span>
          <div className="segmented" style={{ flex: 1 }}>
            {(
              [
                { value: 'left', icon: AlignLeft },
                { value: 'center', icon: AlignCenter },
                { value: 'right', icon: AlignRight },
              ] as const
            ).map(({ value, icon: Icon }) => (
              <button
                key={value}
                type="button"
                className={spec.align === value ? 'active' : ''}
                aria-label={`Align ${value}`}
                aria-pressed={spec.align === value}
                onClick={() => update({ align: value })}
              >
                <Icon size={12} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
