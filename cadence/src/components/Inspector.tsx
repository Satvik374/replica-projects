import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Circle,
  Diamond,
  Layers,
  Plus,
  SlidersHorizontal,
  Square,
  Timer,
  Trash2,
  Type,
} from 'lucide-react';
import { useActiveComp, useEditor } from '../store';
import { EFFECT_CATEGORIES, effectsInCategory, EFFECTS_BY_ID } from '../engine/effectDefs';
import { kindForEffectParam, getProperty, TRANSFORM_ROWS, type PropertySlot } from '../lib/property';
import { num, vec, formatNumber } from '../lib/core';
import { sampleColor, sampleNumber, sampleProperty, sampleVec } from '../lib/keyframes';
import type { Layer, Mask, PropValue } from '../types';
import { BLEND_MODES } from '../types';
import { Panel } from './Panel';
import { ColorField, NumberField, PointField, SelectField, TextCommitField } from './fields';

function layerTypeIcon(layer: Layer) {
  if (layer.type === 'text') return <Type size={13} />;
  if (layer.type === 'shape') return <Circle size={13} />;
  if (layer.type === 'solid') return <Square size={13} />;
  if (layer.type === 'adjustment') return <SlidersHorizontal size={13} />;
  return <Layers size={13} />;
}

function PropertyRow({
  layer,
  path,
  label,
  kind,
  step = 1,
}: {
  layer: Layer;
  path: string;
  label: string;
  kind: PropertySlot['kind'];
  step?: number;
}) {
  const time = useEditor((state) => state.time);
  const property = getProperty(layer, path);
  if (!property) return null;
  const animated = property.keys.length > 0;
  const frame = Math.round(time);
  const keyHere = animated && property.keys.some((key) => Math.abs(key.t - frame) < 0.01);
  const value = sampleProperty(property, time);
  const setValue = (next: PropValue) => useEditor.getState().setPropertyValue(layer.id, path, next);

  return (
    <div className="prop-row">
      <button
        type="button"
        className={`stopwatch-btn${animated ? ' animated' : ''}`}
        title={animated ? 'Turn off animation' : 'Turn on animation'}
        aria-label={`${label} animation`}
        onClick={() => useEditor.getState().toggleStopwatch(layer.id, path)}
      >
        <Timer size={11} />
      </button>
      <span className="prop-name" title={label}>
        {label}
      </span>
      <div className="prop-fields">
        {kind === 'point' ? (
          <PointField
            value={vec(value)}
            onChange={setValue}
            step={step}
            precision={1}
          />
        ) : kind === 'color' ? (
          <ColorField value={typeof value === 'string' ? value : '#000000'} onChange={setValue} label={label} />
        ) : (
          <NumberField
            value={num(value)}
            onChange={setValue}
            step={step}
            precision={1}
            min={kind === 'percent' ? 0 : -100000}
            max={kind === 'percent' ? 100 : 100000}
            unit={kind === 'percent' ? '%' : kind === 'angle' ? '°' : undefined}
            label={label}
          />
        )}
      </div>
      <button
        type="button"
        className={`prop-footer-btn${keyHere ? ' keyed' : ''}`}
        title={keyHere ? 'Keyframe at this frame' : 'Add keyframe at this frame'}
        aria-label={`Add ${label} keyframe`}
        onClick={() => useEditor.getState().addKeyframe(layer.id, path)}
      >
        <Diamond size={9} />
      </button>
    </div>
  );
}

function EffectCard({ layer, effectId }: { layer: Layer; effectId: string }) {
  const effect = layer.effects.find((fx) => fx.id === effectId);
  if (!effect) return null;
  const def = EFFECTS_BY_ID[effect.defId];
  const time = useEditor((state) => state.time);

  return (
    <div className={`effect-card${effect.enabled ? '' : ' disabled'}`}>
      <div className="effect-head">
        <input
          type="checkbox"
          checked={effect.enabled}
          aria-label={`Enable ${effect.name}`}
          onChange={(event) => useEditor.getState().toggleEffect(layer.id, effect.id, event.target.checked)}
        />
        <span className="effect-name" title={def?.hint}>
          {effect.name}
        </span>
        <div className="effect-actions">
          <button
            type="button"
            className="panel-icon"
            title="Move effect up"
            aria-label="Move effect up"
            onClick={() => useEditor.getState().moveEffect(layer.id, effect.id, -1)}
          >
            <ChevronUp size={11} />
          </button>
          <button
            type="button"
            className="panel-icon"
            title="Move effect down"
            aria-label="Move effect down"
            onClick={() => useEditor.getState().moveEffect(layer.id, effect.id, 1)}
          >
            <ChevronDown size={11} />
          </button>
          <button
            type="button"
            className="panel-icon"
            title="Remove effect"
            aria-label="Remove effect"
            onClick={() => useEditor.getState().removeEffect(layer.id, effect.id)}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
      {(def?.params ?? []).map((param) => {
        const property = effect.params[param.key];
        if (!property) return null;
        const path = `effects/${effect.id}/${param.key}`;
        const kind = kindForEffectParam(param.kind);
        const animated = property.keys.length > 0;
        const keyHere =
          animated && property.keys.some((key) => Math.abs(key.t - Math.round(time)) < 0.01);
        const precision = (param.step ?? 1) < 1 ? 2 : 1;
        return (
          <div className="effect-param" key={param.key}>
            <button
              type="button"
              className="stopwatch-btn"
              title={animated ? 'Turn off animation' : 'Animate this parameter'}
              aria-label={`${param.label} animation`}
              onClick={() => useEditor.getState().toggleStopwatch(layer.id, path)}
              style={animated ? { color: 'var(--accent)' } : undefined}
            >
              <Timer size={10} />
            </button>
            <span className="effect-param-label" title={param.label}>
              {param.label}
            </span>
            <div className="effect-param-fields">
              {kind === 'color' ? (
                <ColorField
                  value={sampleColor(property, time, '#000000')}
                  onChange={(value) => useEditor.getState().setPropertyValue(layer.id, path, value)}
                  label={param.label}
                />
              ) : kind === 'point' ? (
                <PointField
                  value={sampleVec(property, time)}
                  onChange={(value) => useEditor.getState().setPropertyValue(layer.id, path, value)}
                  precision={1}
                />
              ) : (
                <NumberField
                  value={sampleNumber(property, time)}
                  onChange={(value) => useEditor.getState().setPropertyValue(layer.id, path, value)}
                  min={param.min}
                  max={param.max}
                  step={param.step ?? 1}
                  precision={precision}
                  unit={param.kind === 'angle' ? '°' : param.kind === 'percent' ? '%' : undefined}
                  label={param.label}
                />
              )}
            </div>
            <button
              type="button"
              className={`prop-footer-btn${keyHere ? ' keyed' : ''}`}
              title="Add keyframe at this frame"
              aria-label={`Add ${param.label} keyframe`}
              onClick={() => useEditor.getState().addKeyframe(layer.id, path)}
            >
              <Diamond size={9} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function MaskEditor({ layer, mask }: { layer: Layer; mask: Mask }) {
  const update = (patch: Partial<Mask>) => useEditor.getState().updateMask(layer.id, mask.id, patch);
  return (
    <div className="mask-row">
      <div className="mask-head">
        <input
          type="checkbox"
          checked={mask.enabled}
          aria-label={`Enable ${mask.name}`}
          onChange={(event) => useEditor.getState().toggleMask(layer.id, mask.id, event.target.checked)}
        />
        <span className="mask-name">{mask.name}</span>
        <select
          className="select"
          aria-label="Mask mode"
          value={mask.mode}
          onChange={(event) => update({ mode: event.target.value as Mask['mode'] })}
        >
          <option value="add">Add</option>
          <option value="subtract">Subtract</option>
        </select>
        <button
          type="button"
          className="panel-icon"
          title="Remove mask"
          aria-label="Remove mask"
          onClick={() => useEditor.getState().removeMask(layer.id, mask.id)}
        >
          <Trash2 size={11} />
        </button>
      </div>
      <div className="prop-row">
        <span className="prop-name">Center</span>
        <div className="prop-fields">
          <PointField value={mask.position} onChange={(position) => update({ position })} />
        </div>
      </div>
      <div className="prop-row">
        <span className="prop-name">Size</span>
        <div className="prop-fields">
          <PointField value={mask.size} onChange={(size) => update({ size })} min={1} />
        </div>
      </div>
      <div className="prop-row">
        <span className="prop-name">Rotation</span>
        <div className="prop-fields">
          <NumberField value={mask.rotation} onChange={(rotation) => update({ rotation })} unit="°" label="Mask rotation" />
        </div>
      </div>
      <div className="prop-row">
        <span className="prop-name">Feather</span>
        <div className="prop-fields">
          <NumberField
            value={mask.feather}
            onChange={(feather) => update({ feather })}
            min={0}
            max={400}
            unit="px"
            label="Mask feather"
          />
        </div>
      </div>
      <div className="prop-row">
        <span className="prop-name">Opacity</span>
        <div className="prop-fields">
          <NumberField
            value={mask.opacity}
            onChange={(opacity) => update({ opacity })}
            min={0}
            max={100}
            unit="%"
            label="Mask opacity"
          />
        </div>
      </div>
    </div>
  );
}

export function Inspector() {
  const comp = useActiveComp();
  const selection = useEditor((state) => state.selection);
  const layers = comp.layers.filter((layer) => selection.includes(layer.id));
  const layer = layers[0];
  const assets = useEditor((state) => state.project.assets);
  const addSolidLayer = useEditor((state) => state.addSolidLayer);
  const addTextLayer = useEditor((state) => state.addTextLayer);
  const [addEffectId, setAddEffectId] = useState('');

  return (
    <Panel
      title="Effect Controls"
      className="inspector-main"
      actions={
        layer ? (
          <span className="dim" style={{ fontSize: 'var(--text-2xs)' }}>
            {layers.length > 1 ? `${layers.length} layers` : '1 layer'}
          </span>
        ) : (
          <SlidersHorizontal size={12} style={{ color: 'var(--text-dim)' }} />
        )
      }
    >
      <div className="inspector-body">
        {!layer ? (
          <div className="panel-empty">
            <strong>Nothing selected.</strong>
            Pick a layer in the timeline or click one in the composition. New here? Add a layer:
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 10 }}>
              <button type="button" className="btn" onClick={addTextLayer}>
                <Type size={12} /> Text
              </button>
              <button type="button" className="btn" onClick={addSolidLayer}>
                <Square size={12} /> Solid
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="layer-summary">
              <span className="layer-summary-icon">{layerTypeIcon(layer)}</span>
              <TextCommitField
                value={layer.name}
                className="layer-summary-name"
                ariaLabel="Layer name"
                onCommit={(name) => useEditor.getState().renameLayer(layer.id, name)}
              />
              <span className="layer-summary-type">{layer.type}</span>
            </div>

            <div className="section">
              <div className="section-head">
                <span className="section-title">Layer</span>
                <span className="section-spacer" />
                <span className="dim" style={{ fontSize: 'var(--text-2xs)' }}>
                  {layer.inPoint} – {layer.outPoint}f
                </span>
              </div>
              <div className="prop-row">
                <span className="prop-name">Blend mode</span>
                <div className="prop-fields">
                  <SelectField
                    value={layer.blend}
                    onChange={(value) =>
                      useEditor.getState().setLayerBlend(layer.id, value as Layer['blend'])
                    }
                    options={BLEND_MODES.map((mode) => ({ value: mode.id, label: mode.label }))}
                    label="Blend mode"
                  />
                </div>
              </div>
              <div className="prop-row">
                <span className="prop-name">Parent</span>
                <div className="prop-fields">
                  <SelectField
                    value={layer.parentId ?? ''}
                    onChange={(value) => useEditor.getState().setLayerParent(layer.id, value || null)}
                    options={[
                      { value: '', label: 'None' },
                      ...comp.layers
                        .filter((other) => other.id !== layer.id)
                        .map((other) => ({ value: other.id, label: other.name })),
                    ]}
                    label="Parent layer"
                  />
                </div>
              </div>
              <div className="prop-row">
                <span className="prop-name">Label</span>
                <div className="prop-fields" style={{ gap: 4 }}>
                  {(['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'pink', 'grey'] as const).map(
                    (label) => (
                      <button
                        key={label}
                        type="button"
                        aria-label={`Label ${label}`}
                        title={label}
                        onClick={() => useEditor.getState().updateLayer(layer.id, { label })}
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 2,
                          background: `var(--label-${label})`,
                          outline: layer.label === label ? '1px solid var(--text)' : 'none',
                          outlineOffset: 1,
                        }}
                      />
                    ),
                  )}
                </div>
              </div>
              {layer.type === 'image' && layer.image ? (
                <div className="prop-row">
                  <span className="prop-name">Footage</span>
                  <div className="prop-fields">
                    <span className="dim mono" style={{ fontSize: 'var(--text-2xs)' }}>
                      {assets.find((asset) => asset.id === layer.image?.assetId)?.name ?? 'Media offline'}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="section">
              <div className="section-head">
                <span className="section-title">Transform</span>
                <span className="section-spacer" />
                <span className="dim" style={{ fontSize: 'var(--text-2xs)' }}>
                  {formatNumber(useEditor.getState().time)}f
                </span>
              </div>
              {TRANSFORM_ROWS.map((row) => (
                <PropertyRow
                  key={row.key}
                  layer={layer}
                  path={`transform.${row.key}`}
                  label={row.label}
                  kind={row.kind}
                  step={1}
                />
              ))}
            </div>

            <div className="section">
              <div className="section-head">
                <span className="section-title">Effects</span>
                <span className="section-spacer" />
                <span className="dim" style={{ fontSize: 'var(--text-2xs)' }}>
                  {layer.effects.length}
                </span>
              </div>
              {layer.effects.map((effect) => (
                <EffectCard key={effect.id} layer={layer} effectId={effect.id} />
              ))}
              <select
                className="select wide"
                aria-label="Add effect"
                value={addEffectId}
                onChange={(event) => {
                  const defId = event.target.value;
                  setAddEffectId('');
                  if (defId) useEditor.getState().addEffect(layer.id, defId);
                }}
              >
                <option value="">Add effect…</option>
                {EFFECT_CATEGORIES.map((category) => (
                  <optgroup key={category} label={category}>
                    {effectsInCategory(category).map((effect) => (
                      <option key={effect.id} value={effect.id}>
                        {effect.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="section">
              <div className="section-head">
                <span className="section-title">Masks</span>
                <span className="section-spacer" />
                <button
                  type="button"
                  className="section-action"
                  onClick={() => useEditor.getState().addMask(layer.id, 'rect')}
                  title="Add a rectangle mask"
                >
                  <Plus size={10} /> Rect
                </button>
                <button
                  type="button"
                  className="section-action"
                  onClick={() => useEditor.getState().addMask(layer.id, 'ellipse')}
                  title="Add an ellipse mask"
                >
                  <Plus size={10} /> Ellipse
                </button>
              </div>
              {layer.masks.length === 0 ? (
                <p className="dim" style={{ fontSize: 'var(--text-2xs)', margin: '2px 0 0' }}>
                  No masks. Masks clip the layer before its transform.
                </p>
              ) : (
                layer.masks.map((mask) => <MaskEditor key={mask.id} layer={layer} mask={mask} />)
              )}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
