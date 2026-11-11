import type { Asset, Comp } from '../types';
import { renderComp } from './render';

export async function exportStill(comp: Comp, frame: number, assets: Asset[], scale: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  renderComp(canvas, comp, frame, { scale, assets });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not encode the frame.');
  return blob;
}

export interface VideoExportOptions {
  scale: number;
  onProgress: (value: number) => void;
}

/**
 * Records the composition into a WebM file. Frames are rendered in real time
 * because MediaRecorder timestamps captured frames by wall clock.
 */
export async function exportVideo(comp: Comp, assets: Asset[], options: VideoExportOptions): Promise<Blob> {
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('This build has no MediaRecorder support, so video export is unavailable.');
  }
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
  if (!mimeType) throw new Error('No WebM encoder is available in this browser.');

  const canvas = document.createElement('canvas');
  renderComp(canvas, comp, 0, { scale: options.scale, assets });
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: Math.round(10_000_000 * options.scale * options.scale),
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
  });

  recorder.start();
  let rendered = 0;
  const frameMs = 1000 / comp.fps;
  const started = performance.now();

  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = performance.now() - started;
      const target = Math.min(comp.duration, Math.floor(elapsed / frameMs) + 1);
      while (rendered < target) {
        renderComp(canvas, comp, rendered, { scale: options.scale, assets });
        track.requestFrame?.();
        rendered++;
      }
      options.onProgress(Math.min(1, rendered / comp.duration));
      if (elapsed >= comp.duration * frameMs || rendered >= comp.duration) {
        // Let the encoder swallow the final frame before stopping.
        setTimeout(resolve, Math.max(30, frameMs));
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  recorder.stop();
  options.onProgress(1);
  return finished;
}
