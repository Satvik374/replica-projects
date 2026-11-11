import { useEffect } from 'react';
import { useEditor } from '../store';

/**
 * Headless transport for audio layers. One HTMLAudioElement per layer, kept in sync with the
 * composition playhead. Playback starts during the click/keypress that flips `playing`, so the
 * browser's autoplay policy is satisfied for a normal Play action.
 */
export function AudioPlayback() {
  useEffect(() => {
    const players = new Map<string, HTMLAudioElement>();

    const setCurrentTime = (element: HTMLAudioElement, value: number) => {
      try {
        element.currentTime = Math.max(0, Math.min(value, Number.isFinite(element.duration) ? element.duration : value));
      } catch {
        // Metadata may not be ready yet; the next sync pass will align it.
      }
    };

    const sync = () => {
      const state = useEditor.getState();
      const comp = state.project.comps.find((item) => item.id === state.project.activeCompId) ?? state.project.comps[0];
      if (!comp) return;
      const assets = new Map(state.project.assets.map((asset) => [asset.id, asset]));
      const soloActive = comp.layers.some((layer) => layer.solo && layer.enabled);
      const used = new Set<string>();

      for (const layer of comp.layers) {
        if (layer.type !== 'audio' || !layer.audio || !layer.enabled) continue;
        if (soloActive && !layer.solo) continue;
        const asset = assets.get(layer.audio.assetId);
        if (!asset?.dataUrl) continue;
        used.add(layer.id);

        let element = players.get(layer.id);
        if (!element) {
          element = new Audio(asset.dataUrl);
          element.preload = 'auto';
          players.set(layer.id, element);
        }
        if (element.dataset.assetId !== asset.id) {
          element.dataset.assetId = asset.id;
          element.src = asset.dataUrl;
        }
        element.volume = Math.max(0, Math.min(1, (layer.audio.volume ?? 100) / 100));

        const target = Math.max(0, (state.time - layer.inPoint) / comp.fps);
        const duration = asset.duration ?? Number.POSITIVE_INFINITY;
        const inside = state.time >= layer.inPoint && state.time < layer.outPoint && target < duration;

        if (!inside) {
          if (!element.paused) element.pause();
          continue;
        }

        if (state.playing) {
          if (Math.abs(element.currentTime - target) > 0.25) setCurrentTime(element, target);
          if (element.paused) void element.play().catch(() => undefined);
        } else {
          if (!element.paused) element.pause();
          if (Math.abs(element.currentTime - target) > 0.03) setCurrentTime(element, target);
        }
      }

      for (const [id, element] of players) {
        if (!used.has(id) && !element.paused) element.pause();
      }
    };

    const unsubscribe = useEditor.subscribe(sync);
    sync();
    return () => {
      unsubscribe();
      for (const element of players.values()) {
        element.pause();
        element.removeAttribute('src');
        element.load();
      }
      players.clear();
    };
  }, []);

  return null;
}
