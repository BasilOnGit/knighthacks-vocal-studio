export type EffectType =
  | 'gate'
  | 'autotune'
  | 'eq'
  | 'compressor'
  | 'deesser'
  | 'saturation'
  | 'chorus'
  | 'delay'
  | 'reverb';

export type TrackId = 'beat' | 'vocal';

export interface TrimRange {
  start: number;
  end: number;
}

export interface EffectNode {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number>;
  why?: string;
}

export interface Preset {
  name: string;
  explanation: string;
  chain: EffectNode[];
}

export interface VoiceFeatures {
  loudnessDb: number;
  peakDb: number;
  centroidHz: number;
  pitchHz: number;
  noiseFloorDb: number;
  voicedSeconds: number;
}

/** Placeholder until Tone.js is added. Engine.getVocalInput() returns Tone.ToneAudioNode. */
export type VocalInputNode = unknown;

export interface Engine {
  loadBeat(file: File): Promise<void>;
  setVocal(buffer: AudioBuffer, trim: TrimRange, startSec?: number): void;
  play(fromTimelineSec?: number): void;
  stop(): void;
  seek(sec: number): void;
  setBypass(dry: boolean): void;
  setTrackGain(track: TrackId, db: number): void;
  setMute(track: TrackId, muted: boolean): void;
  setVocalOffsetMs(ms: number): void;
  getVocalInput(): VocalInputNode;
}

export interface VocalChainOptions {
  pitchHz?: number;
}

export interface VocalChain {
  setChain(preset: Preset, options?: VocalChainOptions): void;
  updateParam(id: string, key: string, value: number): void;
  setEnabled(id: string, on: boolean): void;
}

export type AnalyzeFn = (
  buffer: AudioBuffer,
  start: number,
  end: number,
) => VoiceFeatures;

export type GeneratePresetFn = (
  prompt: string,
  features: VoiceFeatures,
  current?: Preset,
) => Promise<Preset>;
