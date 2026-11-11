import { useEffect, useMemo, useRef, useState } from 'react';
import { FilePlus2, Search, Settings2, Upload } from 'lucide-react';
import { useActiveComp, useEditor } from '../store';
import { useUI } from '../ui';
import { Panel } from './Panel';
import { renderComp } from '../engine/render';
import { pickImages } from '../commands';
import type { Asset, Comp } from '../types';

function CompThumb({ comp }: { comp: Comp }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const assets = useEditor((state) => state.project.assets);
  useEffect(() => {
    if (!canvasRef.current) return;
    const target = canvasRef.current;
    const scale = Math.min(264 / comp.width, 148 / comp.height);
    try {
      renderComp(target, comp, Math.min(comp.duration - 1, 20), { scale, assets });
    } catch {
      // A broken thumbnail should never break the project panel.
    }
  }, [comp, assets]);
  return <canvas ref={canvasRef} width={264} height={148} aria-hidden="true" />;
}

function AssetThumb({ asset }: { asset: Asset }) {
  return <img src={asset.dataUrl} alt="" loading="lazy" />;
}

export function ProjectPanel() {
  const project = useEditor((state) => state.project);
  const activeComp = useActiveComp();
  const setActiveComp = useEditor((state) => state.setActiveComp);
  const addImageLayer = useEditor((state) => state.addImageLayer);
  const search = useUI((state) => state.projectSearch);
  const setSearch = useUI((state) => state.setProjectSearch);
  const openDialog = useUI((state) => state.openDialog);
  const openContextMenu = useUI((state) => state.openContextMenu);
  const [selected, setSelected] = useState<{ kind: 'comp' | 'asset'; id: string } | null>(null);

  const filter = search.trim().toLowerCase();
  const comps = useMemo(
    () => project.comps.filter((comp) => comp.name.toLowerCase().includes(filter)),
    [project.comps, filter],
  );
  const assets = useMemo(
    () => project.assets.filter((asset) => asset.name.toLowerCase().includes(filter)),
    [project.assets, filter],
  );

  return (
    <Panel
      title="Project"
      className="area-project"
      actions={
        <>
          <button
            className="panel-icon"
            type="button"
            title="New composition"
            aria-label="New composition"
            onClick={() => openDialog('newComp')}
          >
            <FilePlus2 size={13} />
          </button>
          <button
            className="panel-icon"
            type="button"
            title="Import footage (Ctrl+I)"
            aria-label="Import footage"
            onClick={pickImages}
          >
            <Upload size={13} />
          </button>
          <button
            className="panel-icon"
            type="button"
            title="Composition settings"
            aria-label="Composition settings"
            onClick={() => {
              if (selected?.kind === 'comp') setActiveComp(selected.id);
              openDialog('compSettings');
            }}
          >
            <Settings2 size={13} />
          </button>
        </>
      }
    >
      <div className="project-toolbar">
        <label className="search-field">
          <Search size={12} />
          <input
            type="search"
            placeholder="Find in project"
            aria-label="Find in project"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      <div className="project-grid">
        {comps.map((comp) => (
          <button
            type="button"
            key={comp.id}
            className={`project-item${selected?.id === comp.id ? ' selected' : ''}${
              activeComp.id === comp.id ? ' active-comp' : ''
            }`}
            onClick={() => setSelected({ kind: 'comp', id: comp.id })}
            onDoubleClick={() => setActiveComp(comp.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              setSelected({ kind: 'comp', id: comp.id });
              openContextMenu({ kind: 'comp', compId: comp.id, x: event.clientX, y: event.clientY });
            }}
            title={`${comp.name} — ${comp.width}×${comp.height}, ${comp.fps} fps, ${comp.duration} frames`}
          >
            <div className="project-thumb">
              <CompThumb comp={comp} />
            </div>
            <div className="project-item-name">
              {comp.name}
              {activeComp.id === comp.id ? <span className="dim"> · open</span> : null}
            </div>
            <div className="project-item-meta">
              <span className="type-dot" />
              <span className="mono">
                {comp.width}×{comp.height}
              </span>
              <span>·</span>
              <span className="mono">{comp.duration}f</span>
            </div>
          </button>
        ))}

        {assets.map((asset) => (
          <button
            type="button"
            key={asset.id}
            className={`project-item${selected?.id === asset.id ? ' selected' : ''}`}
            onClick={() => setSelected({ kind: 'asset', id: asset.id })}
            onDoubleClick={() => addImageLayer(asset.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              setSelected({ kind: 'asset', id: asset.id });
              openContextMenu({ kind: 'asset', assetId: asset.id, x: event.clientX, y: event.clientY });
            }}
            title={`${asset.name} — ${asset.width}×${asset.height}. Double-click to add to the open composition.`}
          >
            <div className="project-thumb">
              <AssetThumb asset={asset} />
            </div>
            <div className="project-item-name">{asset.name}</div>
            <div className="project-item-meta">
              <span className="type-dot" style={{ background: 'var(--teal)' }} />
              <span className="mono">{asset.width}×{asset.height}</span>
            </div>
          </button>
        ))}
      </div>

      {comps.length === 0 && assets.length === 0 ? (
        <div className="panel-empty">
          <strong>{filter ? 'Nothing matches that search.' : 'This project is empty.'}</strong>
          {filter ? 'Try a shorter name.' : 'Create a composition or import an image to begin.'}
        </div>
      ) : null}

      <div className="project-footer">
        <span>
          {project.comps.length} comp{project.comps.length === 1 ? '' : 's'} · {project.assets.length} item
          {project.assets.length === 1 ? '' : 's'}
        </span>
        <span className="dim">Double-click to open</span>
      </div>
    </Panel>
  );
}
