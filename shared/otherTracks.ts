import type { Preset } from './types.ts';

export const MAX_OTHER_TRACKS_FOR_MODEL = 6;

export type OtherTrackSnapshot = {
  name: string;
  role: 'beat' | 'vocal';
  clipCount: number;
  trackVolumeDb: number;
  presetSource?: string;
  presetName: string;
  explanation: string;
  chain: Array<{ type: string; params: Record<string, number>; why?: string }>;
  lastPrompt?: string;
};

export function compactChainForModel(preset: Preset): OtherTrackSnapshot['chain'] {
  return preset.chain.map((node) => ({
    type: node.type,
    params: { ...node.params },
    ...(node.why ? { why: node.why } : {}),
  }));
}

export function buildOtherTracksForModel(input: {
  tracks: Array<{ id: string; name: string; preset: Preset }>;
  targetTrackId: string;
  mixes: Record<string, { db?: number } | undefined>;
  clipCountByTrackId: Record<string, number>;
  trackSources?: Record<string, string>;
  lastPromptByTrackId?: Record<string, string>;
}): OtherTrackSnapshot[] {
  const out: OtherTrackSnapshot[] = [];

  for (const track of input.tracks) {
    if (track.id === input.targetTrackId) {
      continue;
    }
    const clipCount = input.clipCountByTrackId[track.id] ?? 0;
    const hasChain = track.preset.chain.length > 0;
    if (clipCount === 0 && !hasChain) {
      continue;
    }

    const lastPrompt = input.lastPromptByTrackId?.[track.id]?.trim();
    const snapshot: OtherTrackSnapshot = {
      name: track.name,
      role: track.id === 'beat' ? 'beat' : 'vocal',
      clipCount,
      trackVolumeDb: input.mixes[track.id]?.db ?? 0,
      presetName: track.preset.name,
      explanation: track.preset.explanation,
      chain: hasChain ? compactChainForModel(track.preset) : [],
    };
    const source = input.trackSources?.[track.id];
    if (source) {
      snapshot.presetSource = source;
    }
    if (lastPrompt) {
      snapshot.lastPrompt = lastPrompt.slice(0, 500);
    }
    out.push(snapshot);
  }

  return out.slice(0, MAX_OTHER_TRACKS_FOR_MODEL);
}
