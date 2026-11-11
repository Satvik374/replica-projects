import { useMemo, useRef, useState } from 'react';
import {
  BoxSelect,
  ChevronDown,
  ChevronRight,
  Diamond,
  Eye,
  EyeOff,
  Flag,
  Image as ImageIcon,
  Music,
  Lock,
  LockOpen,
  Search,
  Shapes,
  SlidersHorizontal,
  Square,
  Timer,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useActiveComp, useEditor } from '../store';
import { useUI } from '../ui';
import { getProperty, TRANSFORM_ROWS, type PropertySlot } from '../lib/property';
import { formatNumber } from '../lib/core';
import { sampleProperty } from '../lib/keyframes';
import type { EaseKind, Keyframe, Layer } from '../types';
import { NumberField, TextCommitField } from './fields';

const EASE_LABELS: { ease: EaseKind; label: string }[] = [
  { ease: 'linear', label: 'Linear' },
  { ease: 'ease', label: 'Easy Ease' },
  { ease: 'easeIn', label: 'Ease In' },
  { ease: 'easeOut', label: 'Ease Out' },
  { ease: 'hold', label: 'Hold' },
  { ease: 'bezier', label: 'Bezier' },
];

function typeIcon(layer: Layer) {
  switch (layer.type) {
    case 'text':
      return <Type size={11} />;
    case 'shape':
      return <Shapes size={11} />;
    case 'solid':
      return <Square size={11} />;
    case 'image':
      return <ImageIcon size={11} />;
    case 'adjustment':
      return <SlidersHorizontal size={11} />;
    case 'audio':
      return <Music size={11} />;
    default:
      return <BoxSelect size={11} />;
  }
}

function AudioWave({ assetId }: { assetId: string }) {
  const peaks = useEditor((state) => state.project.assets.find((asset) => asset.id === assetId)?.peaks);
  if (!peaks || peaks.length < 2) return null;
  let top = '';
  let bottom = '';
  const last = peaks.length - 1;
  peaks.forEach((peak, index) => {
    const x = (index / last) * 100;
    top += `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${(50 - peak * 44).toFixed(2)} `;
  });
  for (let index = last; index >= 0; index--) {
    const x = (index / last) * 100;
    bottom += `L${x.toFixed(2)} ${(50 + peaks[index] * 44).toFixed(2)} `;
  }
  return (
    <svg className="audio-wave" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${top}${bottom}Z`} />
    </svg>
  );
}

function allKeyframes(layer: Layer): Keyframe[] {
  const keys: Keyframe[] = [];
  TRANSFORM_ROWS.forEach((row) => {
    getProperty(layer, `transform.${row.key}`)?.keys.forEach((k) => keys.push(k));
  });
  layer.effects.forEach((fx) =>
    Object.values(fx.params).forEach((property) => property.keys.forEach((k) => keys.push(k))),
  );
  return keys;
}

export function Timeline() {
  const comp = useActiveComp();
  const time = useEditor((state) => state.time);
  const selection = useEditor((state) => state.selection);
  const expanded = useEditor((state) => state.expanded);
  const selectedKeys = useEditor((state) => state.selectedKeys);
  const animatedOnly = useEditor((state) => state.animatedOnly);
  const pxPerFrame = useEditor((state) => state.timelineZoom);
  const setTimelineZoom = useEditor((state) => state.setTimelineZoom);
  const setStatus = useEditor((state) => state.setStatus);
  const openContextMenu = useUI((state) => state.openContextMenu);

  const [search, setSearch] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const rulerRef = useRef<HTMLDivElement>(null);

  const trackWidth = Math.max(720, Math.round(comp.duration * pxPerFrame) + 180);
  const visibleLayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return comp.layers;
    return comp.layers.filter((layer) => layer.name.toLowerCase().includes(query));
  }, [comp.layers, search]);

  const secondsPx = comp.fps * pxPerFrame;
  const labelStep = secondsPx < 34 ? 5 : secondsPx < 78 ? 2 : 1;
  const ticks = useMemo(() => {
    const list: { frame: number; major: boolean }[] = [];
    const step = Math.max(1, Math.round(comp.fps / (secondsPx < 24 ? 2 : 4)));
    for (let frame = 0; frame <= comp.duration; frame += step) {
      list.push({ frame, major: frame % (comp.fps * labelStep) === 0 });
    }
    return list;
  }, [comp.duration, comp.fps, secondsPx, labelStep]);

  const scrub = (clientX: number) => {
    const ruler = rulerRef.current;
    if (!ruler) return;
    const rect = ruler.getBoundingClientRect();
    const frame = (clientX - rect.left) / pxPerFrame;
    useEditor.getState().setTime(Math.max(0, Math.min(comp.duration, frame)));
  };

  const beginScrub = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    scrub(event.clientX);
    const onMove = (moveEvent: PointerEvent) => scrub(moveEvent.clientX);
    const onUp = () => window.removeEventListener('pointermove', onMove);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const frameFromClientX = (clientX: number) => {
    const ruler = rulerRef.current;
    if (!ruler) return 0;
    const rect = ruler.getBoundingClientRect();
    return Math.max(0, Math.min(comp.duration, (clientX - rect.left) / pxPerFrame));
  };

  const selectLayerForContext = (layer: Layer) => {
    const state = useEditor.getState();
    if (!state.selection.includes(layer.id)) state.setSelection([layer.id]);
  };

  const startKeyDrag = (event: React.PointerEvent, layer: Layer, path: string, key: Keyframe) => {
    event.stopPropagation();
    const state = useEditor.getState();
    const entry = { layerId: layer.id, path, keyId: key.id };
    const already = state.selectedKeys.some(
      (k) => k.layerId === layer.id && k.path === path && k.keyId === key.id,
    );
    if (!already) {
      state.setSelectedKeys(event.shiftKey ? [...state.selectedKeys, entry] : [entry]);
    }
    state.beginDrag();
    const moving = useEditor.getState().selectedKeys.map((selected) => {
      const selectedLayer = comp.layers.find((l) => l.id === selected.layerId);
      const property = selectedLayer ? getProperty(selectedLayer, selected.path) : null;
      const found = property?.keys.find((k) => k.id === selected.keyId);
      return { ...selected, startT: found?.t ?? 0 };
    });
    const startX = event.clientX;
    const onMove = (moveEvent: PointerEvent) => {
      const zoom = useEditor.getState().timelineZoom;
      const delta = Math.round((moveEvent.clientX - startX) / zoom);
      if (delta === 0) return;
      for (const item of moving) {
        useEditor.getState().moveKeyframe(item.layerId, item.path, item.keyId, item.startT + delta);
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      useEditor.getState().endDrag();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const startBarDrag = (event: React.PointerEvent, layer: Layer, mode: 'move' | 'trim-left' | 'trim-right') => {
    event.stopPropagation();
    if (event.button !== 0) return;
    selectLayerForContext(layer);
    setStatus(`${mode === 'move' ? 'Moving' : 'Trimming'} ${layer.name}.`);
    const state = useEditor.getState();
    state.beginDrag();
    const startX = event.clientX;
    const startIn = layer.inPoint;
    const startOut = layer.outPoint;
    const onMove = (moveEvent: PointerEvent) => {
      const zoom = useEditor.getState().timelineZoom;
      const delta = Math.round((moveEvent.clientX - startX) / zoom);
      let inPoint = startIn;
      let outPoint = startOut;
      if (mode === 'move') {
        const shift = Math.max(-startIn, Math.min(comp.duration - startOut, delta));
        inPoint = startIn + shift;
        outPoint = startOut + shift;
      } else if (mode === 'trim-left') {
        inPoint = Math.max(0, Math.min(startOut - 1, startIn + delta));
      } else {
        outPoint = Math.max(startIn + 1, Math.min(comp.duration, startOut + delta));
      }
      useEditor.getState().updateLayer(layer.id, { inPoint, outPoint });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      useEditor.getState().endDrag();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const addKeyAt = (layerId: string, path: string, frame: number) => {
    const state = useEditor.getState();
    state.setTime(frame);
    state.addKeyframe(layerId, path);
  };

  const renderKeyframes = (layer: Layer, path: string, keys: Keyframe[]) => {
    return keys.map((key) => {
      const selected = selectedKeys.some(
        (k) => k.layerId === layer.id && k.path === path && k.keyId === key.id,
      );
      return (
        <button
          key={key.id}
          type="button"
          className={`keyframe${key.ease !== 'linear' && key.ease !== 'hold' ? ' eased' : ''}${
            key.ease === 'hold' ? ' hold' : ''
          }${selected ? ' selected' : ''}`}
          style={{ left: key.t * pxPerFrame }}
          title={`Frame ${key.t} · ${key.ease}. Drag to move, right-click for interpolation.`}
          aria-label={`Keyframe at frame ${key.t}`}
          onPointerDown={(event) => startKeyDrag(event, layer, path, key)}
          onDoubleClick={(event) => {
            event.stopPropagation();
            useEditor.getState().setTime(key.t);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            useEditor.getState().setSelectedKeys([{ layerId: layer.id, path, keyId: key.id }]);
            openContextMenu({ kind: 'keyframe', x: event.clientX, y: event.clientY, layerId: layer.id, path, keyId: key.id });
          }}
        />
      );
    });
  };

  const renderPropertyRow = (layer: Layer, slot: PropertySlot, path: string) => {
    const property = getProperty(layer, path);
    if (!property) return null;
    const value = sampleProperty(property, useEditor.getState().time);
    const text =
      slot.kind === 'point' && Array.isArray(value)
        ? `${formatNumber(value[0])}, ${formatNumber(value[1])}`
        : typeof value === 'number'
          ? `${formatNumber(value)}${slot.suffix ?? ''}`
          : String(value);
    const animated = property.keys.length > 0;
    return (
      <div className="tl-row tl-prop-row" key={path}>
        <div className="tl-head tl-prop-head">
          <button
            type="button"
            className={`prop-stop${animated ? ' animated' : ''}`}
            title={animated ? 'Turn off animation' : 'Turn on animation (stopwatch)'}
            aria-label={`${slot.label} animation`}
            onClick={() => useEditor.getState().toggleStopwatch(layer.id, path)}
          >
            <Timer size={10} />
          </button>
          <span className="tl-prop-label">{slot.label}</span>
          <span className="tl-prop-value">{text}</span>
        </div>
        <div
          className="tl-track tl-prop-track"
          onDoubleClick={(event) => addKeyAt(layer.id, path, frameFromClientX(event.clientX))}
          onPointerDown={(event) => {
            if (event.button === 0 && !(event.target as HTMLElement).classList.contains('keyframe')) {
              useEditor.getState().setTime(frameFromClientX(event.clientX));
            }
          }}
        >
          {renderKeyframes(layer, path, property.keys)}
        </div>
      </div>
    );
  };

  const selectedKeyCount = selectedKeys.length;
  const selectedKeyInfo = useMemo(() => {
    if (selectedKeys.length !== 1) return null;
    const entry = selectedKeys[0];
    const layer = comp.layers.find((l) => l.id === entry.layerId);
    const property = layer ? getProperty(layer, entry.path) : null;
    const key = property?.keys.find((k) => k.id === entry.keyId);
    return key ? { entry, key } : null;
  }, [selectedKeys, comp]);

  return (
    <section className="panel timeline area-timeline" aria-label="Timeline">
      <div className="tl-topbar">
        <span className="panel-title">Timeline</span>
        <span className="dim" style={{ fontSize: 'var(--text-2xs)' }}>
          {comp.name}
        </span>
        <button
          type="button"
          className="ease-btn"
          style={{ marginLeft: 8 }}
          title="Expand every layer"
          onClick={() => {
            const state = useEditor.getState();
            comp.layers.forEach((layer) => state.setExpanded(layer.id, true));
          }}
        >
          Expand all
        </button>
        <button
          type="button"
          className="ease-btn"
          title="Collapse every layer"
          onClick={() => {
            const state = useEditor.getState();
            comp.layers.forEach((layer) => state.setExpanded(layer.id, false));
          }}
        >
          Collapse
        </button>
        <button
          type="button"
          className="ease-btn"
          title="Add a composition marker at the playhead (M)"
          onClick={() => useEditor.getState().addMarker()}
        >
          <Flag size={10} style={{ verticalAlign: '-1px' }} /> Marker
        </button>
        <label className="tl-search">
          <Search size={11} />
          <input
            type="search"
            placeholder="Filter layers"
            aria-label="Filter layers"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      <div className="tl-scroll">
        <div
          className="tl-content"
          style={{ ['--track-w' as string]: `${trackWidth}px` } as React.CSSProperties}
        >
          <div className="tl-row tl-ruler-row">
            <div className="tl-head">
              <span>Layer / property</span>
              <span style={{ marginLeft: 'auto' }} className="mono">
                {Math.round(useEditor.getState().time)}f
              </span>
            </div>
            <div className="tl-ruler" ref={rulerRef} onPointerDown={beginScrub}>
              {ticks.map((tick) => (
                <div
                  key={tick.frame}
                  className="tl-tick"
                  style={{ left: tick.frame * pxPerFrame, height: tick.major ? 8 : 4 }}
                />
              ))}
              {ticks
                .filter((tick) => tick.major)
                .map((tick) => (
                  <span
                    key={`label-${tick.frame}`}
                    className="tl-tick-label"
                    style={{ left: tick.frame * pxPerFrame }}
                  >
                    {formatNumber(tick.frame / comp.fps, 0)}s
                  </span>
                ))}
              {(comp.markers ?? []).map((marker) => (
                <button
                  key={marker.id}
                  type="button"
                  className="tl-marker"
                  style={{ left: marker.t * pxPerFrame, background: marker.color ?? 'var(--accent)' }}
                  title={`${marker.label} · frame ${marker.t}. Double-click to remove.`}
                  aria-label={`Marker ${marker.label} at frame ${marker.t}`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    useEditor.getState().setTime(marker.t);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    useEditor.getState().removeMarker(marker.id);
                  }}
                />
              ))}
            </div>
          </div>

          {visibleLayers.map((layer) => {
            const isSelected = selection.includes(layer.id);
            const isOpen = !!expanded[layer.id];
            const barWidth = Math.max(2, (layer.outPoint - layer.inPoint) * pxPerFrame);
            const barKeys = allKeyframes(layer);
            return (
              <div key={layer.id}>
                <div
                  className={`tl-row tl-bar-layer${isSelected ? ' selected' : ''}`}
                  onPointerDown={() => {
                    if (!isSelected) useEditor.getState().setSelection([layer.id]);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    selectLayerForContext(layer);
                    openContextMenu({ kind: 'layer', x: event.clientX, y: event.clientY, layerId: layer.id });
                  }}
                >
                  <div className="tl-head">
                    <button
                      type="button"
                      className="layer-expander"
                      aria-label={isOpen ? 'Collapse layer properties' : 'Expand layer properties'}
                      aria-expanded={isOpen}
                      onClick={() => useEditor.getState().toggleExpanded(layer.id)}
                    >
                      {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </button>
                    <span className="layer-chip" style={{ background: `var(--label-${layer.label}, #8b8b95)` }} />
                    <span className="layer-type-icon">{typeIcon(layer)}</span>
                    {renaming === layer.id ? (
                      <TextCommitField
                        value={layer.name}
                        className="tl-name-input"
                        ariaLabel="Layer name"
                        onCommit={(name) => {
                          useEditor.getState().renameLayer(layer.id, name);
                          setRenaming(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="tl-layer-name"
                        title="Double-click to rename"
                        onDoubleClick={() => setRenaming(layer.id)}
                        onClick={(event) =>
                          useEditor.getState().setSelection(event.shiftKey ? [...selection, layer.id] : [layer.id])
                        }
                      >
                        {layer.name}
                      </button>
                    )}
                    <span className="tl-switches">
                      <button
                        type="button"
                        className={`switch${layer.enabled ? ' on' : ''}`}
                        title={layer.enabled ? 'Hide layer' : 'Show layer'}
                        aria-label={layer.enabled ? 'Hide layer' : 'Show layer'}
                        aria-pressed={layer.enabled}
                        onClick={(event) => {
                          event.stopPropagation();
                          useEditor.getState().setLayerFlag(layer.id, 'enabled', !layer.enabled);
                        }}
                      >
                        {layer.enabled ? <Eye size={11} /> : <EyeOff size={11} />}
                      </button>
                      <button
                        type="button"
                        className={`switch solo${layer.solo ? ' on' : ''}`}
                        title="Solo"
                        aria-label="Solo layer"
                        aria-pressed={layer.solo}
                        onClick={(event) => {
                          event.stopPropagation();
                          useEditor.getState().setLayerFlag(layer.id, 'solo', !layer.solo);
                        }}
                      >
                        <span style={{ fontSize: 9, fontWeight: 700 }}>S</span>
                      </button>
                      <button
                        type="button"
                        className={`switch lock${layer.locked ? ' on' : ''}`}
                        title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                        aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'}
                        aria-pressed={layer.locked}
                        onClick={(event) => {
                          event.stopPropagation();
                          useEditor.getState().setLayerFlag(layer.id, 'locked', !layer.locked);
                        }}
                      >
                        {layer.locked ? <Lock size={10} /> : <LockOpen size={10} />}
                      </button>
                    </span>
                  </div>
                  <div
                    className="tl-track"
                    onPointerDown={(event) => {
                      if (event.button === 0 && event.target === event.currentTarget) {
                        useEditor.getState().setTime(frameFromClientX(event.clientX));
                      }
                    }}
                  >
                    <div
                      className={`tl-bar${isSelected ? ' selected' : ''}${layer.type === 'audio' ? ' audio' : ''}`}
                      style={{
                        left: layer.inPoint * pxPerFrame,
                        width: barWidth,
                        background: `color-mix(in srgb, var(--label-${layer.label}, #8b8b95) 22%, #2b3242)`,
                        borderColor: isSelected
                          ? 'var(--accent)'
                          : `color-mix(in srgb, var(--label-${layer.label}, #8b8b95) 45%, transparent)`,
                      }}
                      title={`${layer.name} · in ${layer.inPoint}, out ${layer.outPoint}. Drag to slide, edges to trim.`}
                      onPointerDown={(event) => startBarDrag(event, layer, 'move')}
                    >
                      {layer.type === 'audio' && layer.audio ? <AudioWave assetId={layer.audio.assetId} /> : null}
                      <span className="bar-label">{layer.name}</span>
                      {layer.trackMatte && layer.trackMatte !== 'none' ? (
                        <span className="matte-badge" title="This layer is cut by the layer above it">
                          M
                        </span>
                      ) : null}
                      <span
                        className="trim-handle left"
                        onPointerDown={(event) => startBarDrag(event, layer, 'trim-left')}
                      />
                      <span
                        className="trim-handle right"
                        onPointerDown={(event) => startBarDrag(event, layer, 'trim-right')}
                      />
                      {barKeys
                        .filter((key) => key.t >= layer.inPoint && key.t <= layer.outPoint)
                        .map((key) => (
                          <span
                            key={key.id}
                            className="bar-key"
                            style={{ left: (key.t - layer.inPoint) * pxPerFrame }}
                          />
                        ))}
                    </div>
                  </div>
                </div>

                {isOpen ? (
                  <>
                    {TRANSFORM_ROWS.filter(
                      (row) =>
                        !animatedOnly ||
                        (getProperty(layer, `transform.${row.key}`)?.keys.length ?? 0) > 0,
                    ).map((row) =>
                      renderPropertyRow(
                        layer,
                        { property: layer.transform[row.key], label: row.label, kind: row.kind, suffix: row.suffix },
                        `transform.${row.key}`,
                      ),
                    )}
                    {layer.effects.map((fx) => {
                      const fxKeys = Object.values(fx.params).flatMap((property) => property.keys);
                      if (animatedOnly && fxKeys.length === 0) return null;
                      return (
                        <div key={fx.id}>
                          <div className="tl-row tl-fx-row">
                            <div className="tl-head tl-fx-head">
                              <button
                                type="button"
                                className={`prop-stop${fx.enabled ? ' animated' : ''}`}
                                title={fx.enabled ? 'Disable effect' : 'Enable effect'}
                                onClick={() => useEditor.getState().toggleEffect(layer.id, fx.id, !fx.enabled)}
                              >
                                <SlidersHorizontal size={10} />
                              </button>
                              <span className="fx-name">{fx.name}</span>
                            </div>
                            <div className="tl-track">
                              {fxKeys.map((key) => (
                                <span key={key.id} className="bar-key" style={{ left: key.t * pxPerFrame }} />
                              ))}
                            </div>
                          </div>
                          {Object.entries(fx.params)
                            .filter(([, property]) => !animatedOnly || property.keys.length > 0)
                            .map(([paramKey, property]) => (
                            <div className="tl-row tl-fx-param" key={paramKey}>
                              <div className="tl-head tl-prop-head tl-fx-head" style={{ paddingLeft: 46 }}>
                                <button
                                  type="button"
                                  className={`prop-stop${property.keys.length ? ' animated' : ''}`}
                                  title="Toggle animation"
                                  onClick={() =>
                                    useEditor.getState().toggleStopwatch(layer.id, `effects/${fx.id}/${paramKey}`)
                                  }
                                >
                                  <Timer size={10} />
                                </button>
                                <span className="tl-prop-label">{paramKey}</span>
                              </div>
                              <div className="tl-track tl-prop-track">
                                {renderKeyframes(layer, `effects/${fx.id}/${paramKey}`, property.keys)}
                              </div>
                            </div>
                            ))}
                        </div>
                      );
                    })}
                    {layer.masks.length > 0 ? (
                      <div className="tl-row">
                        <div className="tl-head tl-mask-note">
                          {layer.masks.length} mask{layer.masks.length === 1 ? '' : 's'} · edit in the inspector
                        </div>
                        <div className="tl-track" />
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          })}

          {visibleLayers.length === 0 ? (
            <div className="tl-empty">
              {comp.layers.length === 0
                ? 'No layers yet. Add a solid, text or shape from the toolbar or Layer menu.'
                : 'No layers match that filter.'}
            </div>
          ) : null}

          <div className="playhead" style={{ left: `calc(258px + ${time * pxPerFrame}px)` }} />
        </div>
      </div>

      <div className="timeline-footer">
        {EASE_LABELS.map((entry) => (
          <button
            key={entry.ease}
            type="button"
            className="ease-btn"
            disabled={selectedKeyCount === 0}
            onClick={() => useEditor.getState().setSelectedKeysEase(entry.ease)}
            title={`${entry.label} (applies to selected keyframes)`}
          >
            {entry.label}
          </button>
        ))}
        <button
          type="button"
          className="ease-btn"
          disabled={selectedKeyCount === 0}
          onClick={() => useEditor.getState().deleteSelectedKeys()}
          title="Delete selected keyframes"
        >
          <Trash2 size={10} style={{ verticalAlign: '-1px' }} /> Key
        </button>
        {selectedKeyInfo ? (
          <span className="key-influence">
            <span className="dim">In</span>
            <NumberField
              value={Math.round((selectedKeyInfo.key.inInfluence ?? 1 / 3) * 100)}
              onChange={(value) =>
                useEditor
                  .getState()
                  .setKeyframeInfluence(
                    selectedKeyInfo.entry.layerId,
                    selectedKeyInfo.entry.path,
                    selectedKeyInfo.entry.keyId,
                    'in',
                    value / 100,
                  )
              }
              min={0}
              max={100}
              precision={0}
              unit="%"
              label="Influence arriving at this keyframe"
            />
            <span className="dim">Out</span>
            <NumberField
              value={Math.round((selectedKeyInfo.key.outInfluence ?? 1 / 3) * 100)}
              onChange={(value) =>
                useEditor
                  .getState()
                  .setKeyframeInfluence(
                    selectedKeyInfo.entry.layerId,
                    selectedKeyInfo.entry.path,
                    selectedKeyInfo.entry.keyId,
                    'out',
                    value / 100,
                  )
              }
              min={0}
              max={100}
              precision={0}
              unit="%"
              label="Influence leaving this keyframe"
            />
          </span>
        ) : null}
        <span className="dim">
          {selectedKeyCount ? `${selectedKeyCount} key${selectedKeyCount === 1 ? '' : 's'}` : 'No keys selected'}
        </span>
        <div className="zoom-group">
          <span className="dim mono">{round(pxPerFrame)} px/f</span>
          <button
            type="button"
            className="ease-btn"
            aria-label="Zoom out timeline"
            onClick={() => setTimelineZoom(pxPerFrame / 1.4)}
          >
            <ZoomOut size={10} />
          </button>
          <input
            className="zoom-slider"
            type="range"
            min={1}
            max={32}
            step={0.5}
            value={pxPerFrame}
            aria-label="Timeline zoom"
            onChange={(event) => setTimelineZoom(Number(event.target.value))}
          />
          <button
            type="button"
            className="ease-btn"
            aria-label="Zoom in timeline"
            onClick={() => setTimelineZoom(pxPerFrame * 1.4)}
          >
            <ZoomIn size={10} />
          </button>
          <button
            type="button"
            className="ease-btn"
            title="Fit the whole composition in the timeline"
            onClick={() => {
              const available = 700;
              setTimelineZoom(Math.min(32, Math.max(1, available / comp.duration)));
            }}
          >
            Fit
          </button>
          <span className="dim" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Diamond size={9} /> {allKeyframesCount(comp.layers)}
          </span>
        </div>
      </div>
    </section>
  );
}

function allKeyframesCount(layers: Layer[]): number {
  return layers.reduce((total, layer) => total + allKeyframes(layer).length, 0);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
