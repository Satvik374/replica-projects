import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  Pause,
  Play,
  Repeat,
  Settings2,
  SkipBack,
  SkipForward,
  SquareDashed,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useActiveComp, useEditor } from '../store';
import { useUI } from '../ui';
import { renderComp } from '../engine/render';
import { layerGeometry, hitTestLayers, type LayerGeometry } from '../engine/hitTest';
import { applyMatrix, invertMatrix, worldMatrix } from '../lib/matrix';
import { clamp, formatSeconds, formatTimecode, round } from '../lib/core';
import { sampleNumber, sampleVec } from '../lib/keyframes';
import type { Comp, Layer, Matrix, Vec2 } from '../types';
import { runCommand } from '../commands';

function pointInClient(clientX: number, clientY: number, element: HTMLElement | null, comp: Comp): Vec2 {
  if (!element) return [0, 0];
  const rect = element.getBoundingClientRect();
  return [((clientX - rect.left) / rect.width) * comp.width, ((clientY - rect.top) / rect.height) * comp.height];
}

function matrixToSvg(m: Matrix): string {
  return `matrix(${m.a},${m.b},${m.c},${m.d},${m.e},${m.f})`;
}

function deltaInParentSpace(layer: Layer, delta: Vec2, layersById: Map<string, Layer>, time: number): Vec2 {
  if (!layer.parentId) return delta;
  const parent = layersById.get(layer.parentId);
  if (!parent) return delta;
  const inverse = invertMatrix(worldMatrix(parent, layersById, time));
  const [dx, dy] = applyMatrix(inverse, delta);
  const [ox, oy] = applyMatrix(inverse, [0, 0]);
  return [dx - ox, dy - oy];
}

type DragMode =
  | { mode: 'move'; start: Vec2; startTime: number; originals: { layerId: string; position: Vec2 }[] }
  | { mode: 'scale'; layerId: string; center: Vec2; startDistance: number; startScale: Vec2 }
  | { mode: 'rotate'; layerId: string; center: Vec2; startAngle: number; startRotation: number }
  | { mode: 'pan'; startClient: Vec2; startPan: { x: number; y: number } };

export function Viewer() {
  const comp = useActiveComp();
  const assets = useEditor((state) => state.project.assets);
  const time = useEditor((state) => state.time);
  const playing = useEditor((state) => state.playing);
  const loop = useEditor((state) => state.loop);
  const selection = useEditor((state) => state.selection);
  const previewResolution = useEditor((state) => state.previewResolution);
  const viewFlags = useEditor((state) => state.viewFlags);
  const viewerZoom = useEditor((state) => state.viewerZoom);
  const viewerPan = useEditor((state) => state.viewerPan);
  const renderVersion = useEditor((state) => state.renderVersion);
  const tool = useUI((state) => state.tool);
  const setTool = useUI((state) => state.setTool);
  const setCursor = useUI((state) => state.setCursor);

  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragMode | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setViewport({ w: element.clientWidth, h: element.clientHeight });
    });
    observer.observe(element);
    setViewport({ w: element.clientWidth, h: element.clientHeight });
    return () => observer.disconnect();
  }, []);

  const fitScale = Math.max(
    0.02,
    Math.min((viewport.w - 56) / comp.width, (viewport.h - 56) / comp.height),
  );
  const fitRef = useRef(fitScale);
  fitRef.current = fitScale;
  const zoom = viewerZoom === 'fit' ? fitScale : viewerZoom;
  const displayWidth = Math.max(1, comp.width * zoom);
  const displayHeight = Math.max(1, comp.height * zoom);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const renderScale = clamp(Math.min(zoom * dpr, 1.75) * previewResolution, 0.05, 2);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || displayWidth < 2) return;
    renderComp(canvas, comp, time, {
      scale: renderScale,
      assets,
      transparent: viewFlags.transparency,
    });
  }, [comp, time, assets, renderScale, viewFlags.transparency, renderVersion, displayWidth]);

  // Playback clock: reads the store directly so it never re-subscribes per frame.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.12, (now - last) / 1000);
      last = now;
      const state = useEditor.getState();
      if (state.playing) {
        const active = state.project.comps.find((c) => c.id === state.project.activeCompId) ?? state.project.comps[0];
        let next = state.time + dt * active.fps;
        if (next >= active.duration) {
          if (state.loop) next = 0;
          else {
            next = active.duration;
            state.setPlaying(false);
          }
        }
        state.setTime(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Wheel zoom, non-passive so the page does not scroll.
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const state = useEditor.getState();
      if (event.shiftKey) {
        state.setViewerPan({ x: state.viewerPan.x - event.deltaY, y: state.viewerPan.y });
        return;
      }
      const current = state.viewerZoom === 'fit' ? fitRef.current : state.viewerZoom;
      const factor = Math.exp(-event.deltaY * 0.0018);
      state.setViewerZoom(round(clamp(current * factor, 0.05, 8), 3));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  const layersById = useMemo(() => new Map(comp.layers.map((layer) => [layer.id, layer])), [comp.layers]);
  const selectedLayers = useMemo(
    () => comp.layers.filter((layer) => selection.includes(layer.id)),
    [comp.layers, selection],
  );
  const geometries = useMemo(
    () => selectedLayers.map((layer) => layerGeometry(layer, comp, time, assets, layersById)),
    [selectedLayers, comp, time, assets, layersById],
  );
  const primary = geometries.find((geometry) => geometry.layer.id === selection[0]) ?? geometries[0];

  const finishDrag = () => {
    if (dragRef.current) useEditor.getState().endDrag();
    dragRef.current = null;
  };

  const beginPan = (event: React.PointerEvent) => {
    const state = useEditor.getState();
    dragRef.current = { mode: 'pan', startClient: [event.clientX, event.clientY], startPan: state.viewerPan };
    const onMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.mode !== 'pan') return;
      useEditor.getState().setViewerPan({
        x: drag.startPan.x + (moveEvent.clientX - drag.startClient[0]),
        y: drag.startPan.y + (moveEvent.clientY - drag.startClient[1]),
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      finishDrag();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const beginMove = (event: React.PointerEvent, hit: Layer | null) => {
    const state = useEditor.getState();
    if (!hit) {
      if (!event.shiftKey) state.clearSelection();
      return;
    }
    if (event.shiftKey) state.toggleSelection(hit.id);
    else if (!state.selection.includes(hit.id)) state.setSelection([hit.id]);

    const start = pointInClient(event.clientX, event.clientY, stageRef.current, comp);
    const ids = useEditor.getState().selection;
    const originals = comp.layers
      .filter((layer) => ids.includes(layer.id))
      .map((layer) => ({
        layerId: layer.id,
        position: sampleVec(layer.transform.position, useEditor.getState().time),
      }));
    if (originals.length === 0) return;
    state.beginDrag();
    dragRef.current = { mode: 'move', start, startTime: state.time, originals };

    const snapshot = comp;
    const onMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.mode !== 'move') return;
      const point = pointInClient(moveEvent.clientX, moveEvent.clientY, stageRef.current, snapshot);
      let delta: Vec2 = [point[0] - drag.start[0], point[1] - drag.start[1]];
      if (moveEvent.shiftKey) {
        if (Math.abs(delta[0]) > Math.abs(delta[1])) delta = [delta[0], 0];
        else delta = [0, delta[1]];
      }
      for (const original of drag.originals) {
        const layer = snapshot.layers.find((l) => l.id === original.layerId);
        if (!layer) continue;
        const local = deltaInParentSpace(layer, delta, layersById, drag.startTime);
        useEditor.getState().setPropertyValue(original.layerId, 'transform.position', [
          original.position[0] + local[0],
          original.position[1] + local[1],
        ]);
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      finishDrag();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const beginScale = (event: React.PointerEvent, geometry: LayerGeometry) => {
    const point = pointInClient(event.clientX, event.clientY, stageRef.current, comp);
    const center = geometry.center;
    const startDistance = Math.hypot(point[0] - center[0], point[1] - center[1]) || 1;
    const state = useEditor.getState();
    state.beginDrag();
    dragRef.current = {
      mode: 'scale',
      layerId: geometry.layer.id,
      center,
      startDistance,
      startScale: sampleVec(geometry.layer.transform.scale, state.time, [100, 100]),
    };
    const onMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.mode !== 'scale') return;
      const now = pointInClient(moveEvent.clientX, moveEvent.clientY, stageRef.current, comp);
      const distance = Math.hypot(now[0] - drag.center[0], now[1] - drag.center[1]);
      const factor = clamp(distance / drag.startDistance, 0.02, 50);
      useEditor.getState().setPropertyValue(drag.layerId, 'transform.scale', [
        round(drag.startScale[0] * factor, 1),
        round(drag.startScale[1] * factor, 1),
      ]);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      finishDrag();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const beginRotate = (event: React.PointerEvent, geometry: LayerGeometry) => {
    const point = pointInClient(event.clientX, event.clientY, stageRef.current, comp);
    const center = geometry.center;
    const startAngle = Math.atan2(point[1] - center[1], point[0] - center[0]);
    const state = useEditor.getState();
    state.beginDrag();
    dragRef.current = {
      mode: 'rotate',
      layerId: geometry.layer.id,
      center,
      startAngle,
      startRotation: sampleNumber(geometry.layer.transform.rotation, state.time, 0),
    };
    const onMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.mode !== 'rotate') return;
      const now = pointInClient(moveEvent.clientX, moveEvent.clientY, stageRef.current, comp);
      const angle = Math.atan2(now[1] - drag.center[1], now[0] - drag.center[0]);
      const degrees = ((angle - drag.startAngle) * 180) / Math.PI;
      useEditor.getState().setPropertyValue(drag.layerId, 'transform.rotation', round(drag.startRotation + degrees, 1));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      finishDrag();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const createLayerAt = (point: Vec2) => {
    const state = useEditor.getState();
    if (tool === 'text') state.addTextLayer();
    else if (tool === 'rect' || tool === 'ellipse' || tool === 'star') state.addShapeLayer(tool);
    else return;
    const newId = useEditor.getState().selection[0];
    if (newId) useEditor.getState().setPropertyValue(newId, 'transform.position', [round(point[0]), round(point[1])]);
    setTool('select');
  };

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button === 1) {
      event.preventDefault();
      beginPan(event);
      return;
    }
    if (event.button !== 0) return;
    const handle = (event.target as HTMLElement).dataset.handle;
    const point = pointInClient(event.clientX, event.clientY, stageRef.current, comp);
    if (handle) {
      event.preventDefault();
      if (!primary) return;
      if (handle === 'rotate') beginRotate(event, primary);
      else beginScale(event, primary);
      return;
    }
    const panning = tool === 'hand';
    if (panning) {
      beginPan(event);
      return;
    }
    if (tool === 'zoom') {
      const current = viewerZoom === 'fit' ? fitScale : viewerZoom;
      const factor = event.altKey ? 1 / 1.3 : 1.3;
      useEditor.getState().setViewerZoom(round(clamp(current * factor, 0.05, 8), 3));
      return;
    }
    if (tool === 'text' || tool === 'rect' || tool === 'ellipse' || tool === 'star') {
      createLayerAt(point);
      return;
    }
    const hit = hitTestLayers(comp, point, time, assets);
    beginMove(event, hit);
  };

  const transportButton = (label: string, icon: React.ReactNode, onClick: () => void, extra = '') => (
    <button type="button" className={`transport-btn ${extra}`} title={label} aria-label={label} onClick={onClick}>
      {icon}
    </button>
  );

  return (
    <section className="panel viewer area-viewer" aria-label="Composition viewer">
      <div className="viewer-topbar">
        <button type="button" className="viewer-name" onClick={() => runCommand('file.compSettings')} title="Composition settings">
          {comp.name}
          <span className="badge">
            {comp.width}×{comp.height} · {formatSeconds(comp.duration, comp.fps)}
          </span>
        </button>
        <div className="viewer-tools">
          <button
            type="button"
            className={`panel-icon${viewFlags.grid ? ' active' : ''}`}
            title="Grid"
            aria-pressed={viewFlags.grid}
            onClick={() => useEditor.getState().setViewFlag('grid')}
          >
            <Grid3x3 size={12} />
          </button>
          <button
            type="button"
            className={`panel-icon${viewFlags.safe ? ' active' : ''}`}
            title="Safe frames"
            aria-pressed={viewFlags.safe}
            onClick={() => useEditor.getState().setViewFlag('safe')}
          >
            <SquareDashed size={12} />
          </button>
          <button
            type="button"
            className={`panel-icon${viewFlags.transparency ? ' active' : ''}`}
            title="Transparency grid"
            aria-pressed={viewFlags.transparency}
            onClick={() => useEditor.getState().setViewFlag('transparency')}
          >
            <span
              style={{
                width: 11,
                height: 11,
                display: 'inline-block',
                background:
                  'repeating-conic-gradient(#8a8a96 0% 25%, #2b2b34 0% 50%) 50% / 6px 6px',
                borderRadius: 2,
              }}
            />
          </button>
          <button type="button" className="panel-icon" title="Composition settings" onClick={() => runCommand('file.compSettings')}>
            <Settings2 size={12} />
          </button>
          <span className="dim mono">{Math.round(previewResolution * 100)}% res</span>
        </div>
      </div>

      <div className="viewer-stage-wrap" ref={wrapRef}>
        <div
          className={`viewer-stage${viewFlags.transparency ? ' checker' : ''}`}
          ref={stageRef}
          style={{
            width: displayWidth,
            height: displayHeight,
            transform: `translate(${viewerPan.x}px, ${viewerPan.y}px)`,
          }}
        >
          <canvas ref={canvasRef} className="viewer-canvas" aria-label={`${comp.name} at frame ${Math.round(time)}`} />
          <svg
            className={`viewer-overlay ${
              tool === 'hand' ? 'hand' : tool === 'zoom' ? 'zoom' : tool === 'select' ? '' : 'crosshair'
            }`}
            viewBox={`0 0 ${comp.width} ${comp.height}`}
            preserveAspectRatio="none"
            onPointerDown={onPointerDown}
            onPointerMove={(event) => {
              const point = pointInClient(event.clientX, event.clientY, stageRef.current, comp);
              setCursor([round(point[0]), round(point[1])]);
            }}
            onPointerLeave={() => setCursor(null)}
            onContextMenu={(event) => event.preventDefault()}
          >
            {viewFlags.grid ? (
              <g>
                {[1, 2].map((i) => (
                  <line
                    key={`v${i}`}
                    className="grid-line"
                    x1={(comp.width * i) / 3}
                    y1={0}
                    x2={(comp.width * i) / 3}
                    y2={comp.height}
                  />
                ))}
                {[1, 2].map((i) => (
                  <line
                    key={`h${i}`}
                    className="grid-line"
                    x1={0}
                    y1={(comp.height * i) / 3}
                    x2={comp.width}
                    y2={(comp.height * i) / 3}
                  />
                ))}
              </g>
            ) : null}

            {viewFlags.safe ? (
              <g>
                <rect
                  className="safe-area"
                  x={comp.width * 0.05}
                  y={comp.height * 0.05}
                  width={comp.width * 0.9}
                  height={comp.height * 0.9}
                />
                <rect
                  className="safe-area"
                  x={comp.width * 0.1}
                  y={comp.height * 0.1}
                  width={comp.width * 0.8}
                  height={comp.height * 0.8}
                />
              </g>
            ) : null}

            {viewFlags.masks && primary && primary.layer.masks.length > 0 ? (
              <g transform={matrixToSvg(primary.matrix)}>
                {primary.layer.masks.map((mask) => (
                  <g key={mask.id} transform={`translate(${mask.position[0]},${mask.position[1]}) rotate(${mask.rotation})`}>
                    {mask.shape === 'ellipse' ? (
                      <ellipse
                        className="mask-outline"
                        cx={0}
                        cy={0}
                        rx={Math.max(1, mask.size[0] / 2)}
                        ry={Math.max(1, mask.size[1] / 2)}
                      />
                    ) : (
                      <rect
                        className="mask-outline"
                        x={-mask.size[0] / 2}
                        y={-mask.size[1] / 2}
                        width={mask.size[0]}
                        height={mask.size[1]}
                      />
                    )}
                  </g>
                ))}
              </g>
            ) : null}

            {selectedLayers.length > 1
              ? geometries.map((geometry) => (
                  <polygon
                    key={geometry.layer.id}
                    className="overlay-line"
                    points={geometry.corners.map((point) => point.join(',')).join(' ')}
                  />
                ))
              : null}

            {primary ? <SelectionHandles geometry={primary} zoom={zoom} /> : null}
          </svg>
        </div>

        {selectedLayers.length === 0 ? (
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              left: 12,
              color: 'var(--text-dim)',
              fontSize: 'var(--text-2xs)',
              pointerEvents: 'none',
            }}
          >
            {comp.layers.length === 0 ? 'Drop an image or add a layer to begin.' : `${comp.name} · ${comp.layers.length} layers`}
          </div>
        ) : null}
      </div>

      <div className="viewer-footer">
        <div className="transport">
          {transportButton('Go to start', <SkipBack size={13} />, () => useEditor.getState().setTime(0))}
          {transportButton('Previous frame', <ChevronLeft size={13} />, () => useEditor.getState().stepTime(-1))}
          {transportButton(
            playing ? 'Pause' : 'Play',
            playing ? <Pause size={13} /> : <Play size={13} />,
            () => useEditor.getState().togglePlay(),
            playing ? 'playing' : '',
          )}
          {transportButton('Next frame', <ChevronRight size={13} />, () => useEditor.getState().stepTime(1))}
          {transportButton('Go to end', <SkipForward size={13} />, () => useEditor.getState().setTime(comp.duration))}
          {transportButton(
            'Loop playback',
            <Repeat size={12} />,
            () => useEditor.getState().setLoop(!loop),
            loop ? 'toggled' : '',
          )}
        </div>
        <span className="timecode">
          {formatTimecode(time, comp.fps)} <span className="total">/ {formatTimecode(comp.duration, comp.fps)}</span>
        </span>
        <div className="viewer-meta">
          <select
            className="chip-select"
            aria-label="Preview resolution"
            value={previewResolution}
            onChange={(event) => useEditor.getState().setPreviewResolution(Number(event.target.value) as 1 | 0.5 | 0.25)}
          >
            <option value={1}>Full</option>
            <option value={0.5}>Half</option>
            <option value={0.25}>Quarter</option>
          </select>
          <button
            type="button"
            className="zoom-btn"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => {
              const current = viewerZoom === 'fit' ? fitScale : viewerZoom;
              useEditor.getState().setViewerZoom(round(clamp(current / 1.25, 0.05, 8), 3));
            }}
          >
            <ZoomOut size={11} />
          </button>
          <button type="button" className="zoom-btn" title="Fit in viewer (0)" onClick={() => useEditor.getState().setViewerZoom('fit')}>
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            className="zoom-btn"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => {
              const current = viewerZoom === 'fit' ? fitScale : viewerZoom;
              useEditor.getState().setViewerZoom(round(clamp(current * 1.25, 0.05, 8), 3));
            }}
          >
            <ZoomIn size={11} />
          </button>
        </div>
      </div>
    </section>
  );
}

function SelectionHandles({ geometry, zoom }: { geometry: LayerGeometry; zoom: number }) {
  const size = 8 / zoom;
  const handlePoints = geometry.corners.map((point, index) => ({
    point,
    id: ['nw', 'ne', 'se', 'sw'][index],
  }));
  const topCenter = applyMatrix(geometry.matrix, [0, -geometry.height / 2]);
  const rotatePoint = applyMatrix(geometry.matrix, [0, -geometry.height / 2 - 34 / zoom]);
  return (
    <g>
      <polygon className="overlay-line" points={geometry.corners.map((point) => point.join(',')).join(' ')} />
      <line
        className="overlay-line"
        x1={topCenter[0]}
        y1={topCenter[1]}
        x2={rotatePoint[0]}
        y2={rotatePoint[1]}
      />
      <circle
        className="overlay-rotate"
        data-handle="rotate"
        cx={rotatePoint[0]}
        cy={rotatePoint[1]}
        r={size * 0.6}
      />
      {handlePoints.map(({ point, id }) => (
        <rect
          key={id}
          className={`overlay-handle${id === 'ne' || id === 'sw' ? ' ne-sw' : ''}`}
          data-handle={id}
          x={point[0] - size / 2}
          y={point[1] - size / 2}
          width={size}
          height={size}
        />
      ))}
    </g>
  );
}
