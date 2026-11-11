import { useEffect, useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { clamp, formatNumber, round } from '../lib/core';
import { useEditor } from '../store';

interface NumberFieldProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  unit?: string;
  disabled?: boolean;
  label?: string;
}

export function NumberField({
  value,
  onChange,
  min = -100000,
  max = 100000,
  step = 1,
  precision = 1,
  unit,
  disabled,
  label,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const scrubRef = useRef<{ startX: number; startValue: number; moved: boolean } | null>(null);

  const display = focused && draft !== null ? draft : formatNumber(value, precision);

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw.replace(/[^0-9.+-]/g, ''));
    if (Number.isFinite(parsed)) onChange(round(clamp(parsed, min, max), precision));
    setDraft(null);
  };

  const beginScrub = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (disabled) return;
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    scrubRef.current = { startX: event.clientX, startValue: value, moved: false };
    useEditor.getState().beginDrag();
  };

  const moveScrub = (event: React.PointerEvent<HTMLSpanElement>) => {
    const scrub = scrubRef.current;
    if (!scrub) return;
    const delta = (event.clientX - scrub.startX) * (event.shiftKey ? 10 : 1) * step;
    if (Math.abs(delta) < 0.001) return;
    scrub.moved = true;
    onChange(round(clamp(scrub.startValue + delta, min, max), precision));
  };

  const endScrub = () => {
    if (!scrubRef.current) return;
    scrubRef.current = null;
    useEditor.getState().endDrag();
  };

  return (
    <div className={`num-field${focused ? ' focused' : ''}`}>
      <input
        value={display}
        aria-label={label}
        disabled={disabled}
        inputMode="decimal"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => {
          setFocused(true);
          setDraft(formatNumber(value, precision));
          event.currentTarget.select();
        }}
        onBlur={(event) => {
          setFocused(false);
          commit(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit(event.currentTarget.value);
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraft(null);
            event.currentTarget.blur();
          }
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const direction = event.key === 'ArrowUp' ? 1 : -1;
            const next = clamp(value + direction * step * (event.shiftKey ? 10 : 1), min, max);
            onChange(round(next, precision));
            setDraft(formatNumber(next, precision));
          }
        }}
      />
      {unit ? <span className="unit">{unit}</span> : null}
      <span
        className="scrub"
        role="slider"
        aria-label={`${label ?? 'Value'} scrubber`}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={-1}
        onPointerDown={beginScrub}
        onPointerMove={moveScrub}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
      >
        <GripVertical size={9} />
      </span>
    </div>
  );
}

export function PointField({
  value,
  onChange,
  step = 1,
  precision = 1,
  min,
  max,
  unit,
}: {
  value: [number, number];
  onChange: (value: [number, number]) => void;
  step?: number;
  precision?: number;
  min?: number;
  max?: number;
  unit?: string;
}) {
  return (
    <div className="point-field">
      <span className="field-label">X</span>
      <NumberField
        value={value[0]}
        onChange={(x) => onChange([x, value[1]])}
        step={step}
        precision={precision}
        min={min}
        max={max}
        unit={unit}
        label="X value"
      />
      <span className="field-label">Y</span>
      <NumberField
        value={value[1]}
        onChange={(y) => onChange([value[0], y])}
        step={step}
        precision={precision}
        min={min}
        max={max}
        unit={unit}
        label="Y value"
      />
    </div>
  );
}

export function ColorField({ value, onChange, label }: { value: string; onChange: (value: string) => void; label?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const safe = /^#([0-9a-f]{6})$/i.test(value) ? value : '#000000';
  return (
    <div className="color-field">
      <span className="color-swatch" style={{ background: safe }}>
        <input type="color" value={safe} aria-label={label ?? 'Color'} onChange={(event) => onChange(event.target.value)} />
      </span>
      <input
        className="color-hex"
        value={draft ?? safe.toUpperCase()}
        aria-label={`${label ?? 'Color'} hex value`}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft) {
            const normalized = draft.startsWith('#') ? draft : `#${draft}`;
            if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) onChange(normalized.toLowerCase());
          }
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
    </div>
  );
}

export function SelectField({
  value,
  onChange,
  options,
  label,
  wide = true,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  label?: string;
  wide?: boolean;
}) {
  return (
    <select
      className={`select${wide ? ' wide' : ''}`}
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Text input that only records history when it loses focus. */
export function TextCommitField({
  value,
  onCommit,
  placeholder,
  className,
  ariaLabel,
  multiline = false,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  const commit = () => {
    if (draft !== value) onCommit(draft);
    setFocused(false);
  };

  if (multiline) {
    return (
      <textarea
        className={className ?? 'char-textarea'}
        value={draft}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={commit}
      />
    );
  }
  return (
    <input
      className={className}
      value={draft}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => {
        setFocused(true);
        event.currentTarget.select();
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(value);
          setFocused(false);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
