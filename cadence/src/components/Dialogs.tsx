import { useEffect, useRef, useState } from 'react';
import { Clapperboard, FileImage, Info, Keyboard, MonitorPlay, X } from 'lucide-react';
import { useActiveComp, useEditor } from '../store';
import { useUI } from '../ui';
import { SHORTCUTS } from '../commands';
import { exportStill, exportVideo } from '../engine/exporter';
import { saveBinaryFile } from '../lib/project';
import { BrandMark } from './BrandMark';

const closeDialog = () => useUI.getState().closeDialog();

function Modal({
  title,
  subtitle,
  children,
  footer,
  wide = false,
  closable = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  closable?: boolean;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closable) closeDialog();
    };
    document.addEventListener('keydown', onKey);
    bodyRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [closable]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && closable) closeDialog();
      }}
    >
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle ? <div className="modal-sub">{subtitle}</div> : null}
          </div>
          <span style={{ flex: 1 }} />
          {closable ? (
            <button type="button" className="panel-icon" aria-label="Close dialog" onClick={closeDialog}>
              <X size={14} />
            </button>
          ) : null}
        </div>
        <div className="modal-body" ref={bodyRef} tabIndex={-1}>
          {children}
        </div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

const PRESETS = [
  { label: 'HD 1920 × 1080', width: 1920, height: 1080 },
  { label: '4K UHD 3840 × 2160', width: 3840, height: 2160 },
  { label: 'Square 1080 × 1080', width: 1080, height: 1080 },
  { label: 'Vertical 1080 × 1920', width: 1080, height: 1920 },
  { label: 'Cinema 2048 × 858', width: 2048, height: 858 },
];

function NewCompDialog() {
  const comps = useEditor((state) => state.project.comps);
  const [name, setName] = useState(`Composition ${comps.length + 1}`);
  const [presetIndex, setPresetIndex] = useState(0);
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [fps, setFps] = useState(30);
  const [duration, setDuration] = useState(150);
  const [bg, setBg] = useState('#0b0b0f');

  const applyPreset = (index: number) => {
    setPresetIndex(index);
    if (index < PRESETS.length) {
      setWidth(PRESETS[index].width);
      setHeight(PRESETS[index].height);
    }
  };

  return (
    <Modal
      title="New Composition"
      subtitle="Compositions are the canvases that hold layers."
      footer={
        <>
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              useEditor.getState().newComp({ name: name.trim() || 'Composition', width, height, fps, duration, bg });
              closeDialog();
            }}
          >
            Create composition
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label htmlFor="comp-name">Name</label>
        <input id="comp-name" value={name} onChange={(event) => setName(event.target.value)} />
        <label htmlFor="comp-preset">Preset</label>
        <select
          id="comp-preset"
          className="select wide"
          value={presetIndex}
          onChange={(event) => applyPreset(Number(event.target.value))}
        >
          {PRESETS.map((preset, index) => (
            <option key={preset.label} value={index}>
              {preset.label}
            </option>
          ))}
          <option value={PRESETS.length}>Custom</option>
        </select>
        <label htmlFor="comp-width">Width</label>
        <input
          id="comp-width"
          type="number"
          min={16}
          max={8192}
          value={width}
          onChange={(event) => {
            setWidth(Number(event.target.value));
            setPresetIndex(PRESETS.length);
          }}
        />
        <label htmlFor="comp-height">Height</label>
        <input
          id="comp-height"
          type="number"
          min={16}
          max={8192}
          value={height}
          onChange={(event) => {
            setHeight(Number(event.target.value));
            setPresetIndex(PRESETS.length);
          }}
        />
        <label htmlFor="comp-fps">Frame rate</label>
        <input
          id="comp-fps"
          type="number"
          min={1}
          max={120}
          step={1}
          value={fps}
          onChange={(event) => setFps(Number(event.target.value))}
        />
        <label htmlFor="comp-duration">Duration</label>
        <input
          id="comp-duration"
          type="number"
          min={1}
          max={20000}
          value={duration}
          onChange={(event) => setDuration(Number(event.target.value))}
        />
        <label htmlFor="comp-bg">Background</label>
        <input id="comp-bg" type="color" value={bg} onChange={(event) => setBg(event.target.value)} style={{ height: 24 }} />
        <span className="hint">
          {Math.round((duration / fps) * 100) / 100}s at {fps} fps. You can change all of this later.
        </span>
      </div>
    </Modal>
  );
}

function CompSettingsDialog() {
  const comp = useActiveComp();
  const [name, setName] = useState(comp.name);
  const [width, setWidth] = useState(comp.width);
  const [height, setHeight] = useState(comp.height);
  const [fps, setFps] = useState(comp.fps);
  const [duration, setDuration] = useState(comp.duration);
  const [bg, setBg] = useState(comp.bg);

  return (
    <Modal
      title="Composition Settings"
      subtitle={comp.name}
      footer={
        <>
          <button type="button" className="btn" onClick={closeDialog}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              useEditor.getState().updateCompSettings({ name, width, height, fps, duration, bg });
              closeDialog();
            }}
          >
            Apply settings
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label htmlFor="settings-name">Name</label>
        <input id="settings-name" value={name} onChange={(event) => setName(event.target.value)} />
        <label htmlFor="settings-width">Width</label>
        <input
          id="settings-width"
          type="number"
          min={16}
          max={8192}
          value={width}
          onChange={(event) => setWidth(Number(event.target.value))}
        />
        <label htmlFor="settings-height">Height</label>
        <input
          id="settings-height"
          type="number"
          min={16}
          max={8192}
          value={height}
          onChange={(event) => setHeight(Number(event.target.value))}
        />
        <label htmlFor="settings-fps">Frame rate</label>
        <input
          id="settings-fps"
          type="number"
          min={1}
          max={120}
          value={fps}
          onChange={(event) => setFps(Number(event.target.value))}
        />
        <label htmlFor="settings-duration">Duration (frames)</label>
        <input
          id="settings-duration"
          type="number"
          min={1}
          max={20000}
          value={duration}
          onChange={(event) => setDuration(Number(event.target.value))}
        />
        <label htmlFor="settings-bg">Background</label>
        <input
          id="settings-bg"
          type="color"
          value={bg}
          onChange={(event) => setBg(event.target.value)}
          style={{ height: 24 }}
        />
        <span className="hint">Shortening the composition trims layers that extend past the end.</span>
      </div>
    </Modal>
  );
}

function safeName(name: string): string {
  return name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'composition';
}

function RenderDialog() {
  const comp = useActiveComp();
  const assets = useEditor((state) => state.project.assets);
  const time = useEditor((state) => state.time);
  const initialMode = useUI((state) => state.renderMode);
  const [format, setFormat] = useState<'video' | 'frame'>(initialMode);
  const [scale, setScale] = useState(1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    setProgress(0);
    try {
      if (format === 'frame') {
        const frame = Math.round(time);
        const blob = await exportStill(comp, frame, assets, scale);
        const result = await saveBinaryFile(
          `${safeName(comp.name)}-${String(frame).padStart(5, '0')}.png`,
          blob,
          'image/png',
          [{ name: 'PNG image', extensions: ['png'] }],
        );
        if (result.canceled) setError('Export canceled.');
        else {
          setDone(result.path ?? 'Frame exported');
          useEditor.getState().setStatus(`Exported frame ${frame}.`);
        }
      } else {
        const blob = await exportVideo(comp, assets, {
          scale,
          onProgress: (value) => setProgress(value),
        });
        const result = await saveBinaryFile(`${safeName(comp.name)}.webm`, blob, 'video/webm', [
          { name: 'WebM video', extensions: ['webm'] },
        ]);
        if (result.canceled) setError('Export canceled.');
        else {
          setDone(result.path ?? 'Video exported');
          useEditor.getState().setStatus(`Rendered ${comp.name}.`);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The render failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Render"
      subtitle={`${comp.name} · ${comp.duration} frames at ${comp.fps} fps`}
      wide
      closable={!busy}
      footer={
        <>
          <button type="button" className="btn" disabled={busy} onClick={closeDialog}>
            Close
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void start()}>
            {busy ? 'Rendering…' : format === 'video' ? 'Render video' : 'Export frame'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <span>Format</span>
        <div className="segmented" style={{ maxWidth: 300 }}>
          <button
            type="button"
            className={format === 'video' ? 'active' : ''}
            disabled={busy}
            onClick={() => setFormat('video')}
          >
            <MonitorPlay size={11} style={{ marginRight: 4 }} /> WebM video
          </button>
          <button
            type="button"
            className={format === 'frame' ? 'active' : ''}
            disabled={busy}
            onClick={() => setFormat('frame')}
          >
            <FileImage size={11} style={{ marginRight: 4 }} /> PNG frame
          </button>
        </div>
        <span>Size</span>
        <div className="segmented" style={{ maxWidth: 300 }}>
          {[
            { label: 'Full', value: 1 },
            { label: 'Half', value: 0.5 },
            { label: 'Quarter', value: 0.25 },
          ].map((entry) => (
            <button
              key={entry.label}
              type="button"
              className={scale === entry.value ? 'active' : ''}
              disabled={busy}
              onClick={() => setScale(entry.value)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <span>Details</span>
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.6 }}>
          {format === 'video' ? (
            <>
              VP9 WebM at {Math.round(comp.width * scale)} × {Math.round(comp.height * scale)}. Frames render in real
              time, so a {Math.round((comp.duration / comp.fps) * 10) / 10}s composition takes about that long.
              Effects such as blurs and glows render in the preview exactly as they do here.
            </>
          ) : (
            <>
              One PNG at frame {Math.round(time)} ({comp.width * scale} × {comp.height * scale}).
            </>
          )}
        </div>
        {busy ? (
          <div style={{ gridColumn: '1 / -1' }}>
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="dim" style={{ fontSize: 'var(--text-xs)', marginTop: 4 }}>
              {Math.round(progress * 100)}% complete
            </div>
          </div>
        ) : null}
        {error ? (
          <div style={{ gridColumn: '1 / -1', color: 'var(--danger)', fontSize: 'var(--text-xs)' }}>{error}</div>
        ) : null}
        {done ? (
          <div style={{ gridColumn: '1 / -1', color: 'var(--success)', fontSize: 'var(--text-xs)' }}>Saved {done}</div>
        ) : null}
      </div>
    </Modal>
  );
}

function ShortcutsDialog() {
  return (
    <Modal title="Keyboard shortcuts" subtitle="Everything here works from the viewer and timeline." wide>
      <div className="shortcut-grid">
        {SHORTCUTS.map((shortcut) => (
          <div className="shortcut-row" key={shortcut.label}>
            <span>{shortcut.label}</span>
            <kbd>{shortcut.keys}</kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function AboutDialog() {
  return (
    <Modal
      title="About Cadence"
      subtitle="A motion graphics and compositing studio"
      footer={
        <button type="button" className="btn primary" onClick={closeDialog}>
          Close
        </button>
      }
    >
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <BrandMark size={56} />
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          <p style={{ margin: 0, color: 'var(--text)' }}>
            <strong>Cadence 0.1</strong>
          </p>
          <p style={{ margin: '6px 0 0' }}>
            Compositions, layers, keyframes, masks and effects — rendered on a canvas, saved as readable JSON, packaged
            as a desktop app with Electron.
          </p>
          <p style={{ margin: '6px 0 0' }}>
            Built from scratch for this project, with open-source references such as EffectCraft (MIT/Apache-2.0) used
            only to study behaviour. Cadence is not affiliated with Adobe or After Effects.
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-dim)', fontSize: 'var(--text-xs)' }}>
        <Info size={12} />
        Projects use the .cadence.json extension and diff cleanly in version control.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn" onClick={() => useUI.getState().openDialog('shortcuts')}>
          <Keyboard size={12} /> Shortcuts
        </button>
        <button type="button" className="btn" onClick={() => useUI.getState().openDialog('render')}>
          <Clapperboard size={12} /> Render
        </button>
      </div>
    </Modal>
  );
}

export function Dialogs() {
  const dialog = useUI((state) => state.dialog);
  if (!dialog) return null;
  if (dialog === 'newComp') return <NewCompDialog />;
  if (dialog === 'compSettings') return <CompSettingsDialog />;
  if (dialog === 'render') return <RenderDialog />;
  if (dialog === 'shortcuts') return <ShortcutsDialog />;
  return <AboutDialog />;
}
