import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, Sparkles, X } from 'lucide-react';
import { EFFECT_CATEGORIES, effectsInCategory } from '../engine/effectDefs';
import { useEditor } from '../store';
import { useUI } from '../ui';
import { Panel } from './Panel';

export function EffectsPanel() {
  const search = useUI((state) => state.fxSearch);
  const setSearch = useUI((state) => state.setFxSearch);
  const openContextMenu = useUI((state) => state.openContextMenu);
  const addEffect = useEditor((state) => state.addEffect);
  const selection = useEditor((state) => state.selection);
  const setStatus = useEditor((state) => state.setStatus);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const filter = search.trim().toLowerCase();

  const sections = useMemo(
    () =>
      EFFECT_CATEGORIES.map((category) => ({
        category,
        effects: effectsInCategory(category).filter(
          (effect) =>
            !filter ||
            effect.name.toLowerCase().includes(filter) ||
            effect.hint.toLowerCase().includes(filter),
        ),
      })).filter((section) => section.effects.length > 0),
    [filter],
  );

  const applyEffect = (defId: string, name: string) => {
    if (selection.length === 0) {
      setStatus(`Select a layer, then apply ${name}.`);
      return;
    }
    selection.forEach((layerId) => addEffect(layerId, defId));
  };

  return (
    <Panel
      title="Effects & Presets"
      className="area-effects"
      actions={
        search ? (
          <button className="panel-icon" type="button" onClick={() => setSearch('')} title="Clear search">
            <X size={12} />
          </button>
        ) : (
          <Sparkles size={12} style={{ color: 'var(--text-dim)' }} />
        )
      }
    >
      <div className="fx-search">
        <label className="search-field">
          <Search size={12} />
          <input
            type="search"
            placeholder="Search effects"
            aria-label="Search effects"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <div className="fx-tree">
        {sections.map((section) => {
          const isOpen = !collapsed[section.category];
          return (
            <div className="fx-category" key={section.category}>
              <button
                type="button"
                className="fx-category-head"
                aria-expanded={isOpen}
                onClick={() => setCollapsed((prev) => ({ ...prev, [section.category]: isOpen }))}
              >
                {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <span>{section.category}</span>
                <span className="dim" style={{ marginLeft: 'auto' }}>
                  {section.effects.length}
                </span>
              </button>
              {isOpen
                ? section.effects.map((effect) => (
                    <button
                      key={effect.id}
                      type="button"
                      className="fx-item"
                      title={`${effect.hint}\nDouble-click to apply to the selected layer.`}
                      onDoubleClick={() => applyEffect(effect.id, effect.name)}
                      onClick={() => setStatus(`${effect.name}: double-click to apply.`)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        if (selection.length > 0) {
                          openContextMenu({
                            kind: 'layer',
                            layerId: selection[0],
                            x: event.clientX,
                            y: event.clientY,
                          });
                        }
                      }}
                    >
                      <Sparkles size={11} style={{ color: 'var(--text-dim)' }} />
                      <span>{effect.name}</span>
                      <span className="fx-kind">apply</span>
                    </button>
                  ))
                : null}
            </div>
          );
        })}
        {sections.length === 0 ? (
          <div className="panel-empty">
            <strong>No effects match “{search}”.</strong>
            Try a category name like blur, color, or grain.
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
