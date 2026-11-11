import type { Asset } from '../types';

let context: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();

function audioContext(): AudioContext {
  if (!context) {
    const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) throw new Error('This browser has no Web Audio support.');
    context = new Constructor();
  }
  if (context.state === 'suspended') void context.resume();
  return context;
}

/** Fetches and decodes an audio data URL, caching the decoded buffer by asset id. */
export async function loadAudioBuffer(asset: Asset): Promise<AudioBuffer> {
  const cached = buffers.get(asset.id);
  if (cached) return cached;
  const response = await fetch(asset.dataUrl);
  const bytes = await response.arrayBuffer();
  const buffer = await audioContext().decodeAudioData(bytes.slice(0));
  buffers.set(asset.id, buffer);
  return buffer;
}

export function forgetAudioBuffer(assetId: string): void {
  buffers.delete(assetId);
}

/** Max-amplitude envelope used by the timeline. */
export function peaksFromBuffer(buffer: AudioBuffer, count = 480): number[] {
  const channels = Math.max(1, buffer.numberOfChannels);
  const data: Float32Array[] = [];
  for (let channel = 0; channel < channels; channel++) data.push(buffer.getChannelData(channel));
  const length = buffer.length;
  const peaks: number[] = [];
  const bucket = Math.max(1, Math.floor(length / count));
  let max = 0;
  for (let i = 0; i < count; i++) {
    const start = i * bucket;
    const end = Math.min(length, start + bucket);
    let peak = 0;
    for (let sample = start; sample < end; sample += 2) {
      let value = 0;
      for (let channel = 0; channel < channels; channel++) value += Math.abs(data[channel][sample] ?? 0);
      peak = Math.max(peak, value / channels);
    }
    peaks.push(peak);
    max = Math.max(max, peak);
  }
  return max > 0 ? peaks.map((value) => Math.round((value / max) * 1000) / 1000) : peaks;
}

export interface BeatAnalysis {
  frames: number[];
  bpm: number;
  energy: number;
}

/**
 * Energy-onset beat detection. This is deliberately dependency-free: a short-time RMS
 * envelope with an adaptive local threshold, a minimum inter-onset gap, then a median
 * interval folded into a musical tempo range.
 */
export function detectBeatsFromSamples(
  samples: Float32Array,
  sampleRate: number,
  fps: number,
): BeatAnalysis {
  const hop = Math.max(1, Math.round(sampleRate * 0.01));
  const energies: number[] = [];
  for (let start = 0; start < samples.length; start += hop) {
    let sum = 0;
    const end = Math.min(samples.length, start + hop);
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    energies.push(Math.sqrt(sum / Math.max(1, end - start)));
  }
  if (energies.length === 0) return { frames: [], bpm: 0, energy: 0 };

  const window = 9;
  const onsets: number[] = [];
  const minGap = Math.round(0.12 / 0.01);
  const peak = Math.max(...energies);
  let last = -minGap;
  for (let i = 0; i < energies.length; i++) {
    let local = 0;
    let count = 0;
    for (let j = Math.max(0, i - window); j <= Math.min(energies.length - 1, i + window); j++) {
      local += energies[j];
      count += 1;
    }
    const threshold = (local / Math.max(1, count)) * 1.35 + peak * 0.02;
    const previous = energies[i - 1] ?? 0;
    if (energies[i] > threshold && energies[i] > previous * 1.15 && i - last >= minGap) {
      onsets.push(i);
      last = i;
    }
  }

  const frames = [...new Set(onsets.map((index) => Math.round((index * hop * fps) / sampleRate)))].sort(
    (a, b) => a - b,
  );

  let bpm = 0;
  if (onsets.length >= 4) {
    const intervals: number[] = [];
    for (let i = 1; i < onsets.length; i++) intervals.push(((onsets[i] - onsets[i - 1]) * hop) / sampleRate);
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    if (median > 0) {
      bpm = 60 / median;
      while (bpm < 70) bpm *= 2;
      while (bpm > 180) bpm /= 2;
      bpm = Math.round(bpm);
    }
  }
  return { frames, bpm, energy: peak };
}

export interface AudioAnalysis {
  duration: number;
  peaks: number[];
  sampleRate: number;
  beats: number[];
  bpm: number;
}

/** Decodes an audio data URL for import: duration, waveform peaks and an onset pass. */
export async function analyzeAudioData(dataUrl: string, fps: number): Promise<AudioAnalysis> {
  const response = await fetch(dataUrl);
  const bytes = await response.arrayBuffer();
  const buffer = await audioContext().decodeAudioData(bytes.slice(0));
  const peaks = peaksFromBuffer(buffer);
  const mixed = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) mixed[i] += data[i] / buffer.numberOfChannels;
  }
  const beats = detectBeatsFromSamples(mixed, buffer.sampleRate, fps);
  return {
    duration: buffer.duration,
    peaks,
    sampleRate: buffer.sampleRate,
    beats: beats.frames,
    bpm: beats.bpm,
  };
}
