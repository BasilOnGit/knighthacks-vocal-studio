import type { Preset, VoiceFeatures } from './types.ts';

export const KEY_STAMP_MIN_CONFIDENCE = 0.35;

/** Nearest 1/8, dotted 1/8, or 1/4 note at the given BPM. */
export function snapDelayTimeMs(timeMs: number, bpm: number): number {
  if (!(bpm > 0) || !Number.isFinite(timeMs)) {
    return timeMs;
  }
  const quarterMs = 60_000 / bpm;
  const candidates = [quarterMs / 2, (quarterMs * 3) / 4, quarterMs];
  let best = candidates[0];
  let bestDist = Math.abs(timeMs - best);
  for (let i = 1; i < candidates.length; i++) {
    const dist = Math.abs(timeMs - candidates[i]);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidates[i];
    }
  }
  return Math.round(best);
}

export function stampPresetFromFeatures(preset: Preset, features: VoiceFeatures): Preset {
  const stampKey = features.keyConfidence >= KEY_STAMP_MIN_CONFIDENCE;
  const stampDelay = features.bpm > 0;

  if (!stampKey && !stampDelay) {
    return preset;
  }

  const chain = preset.chain.map((node) => {
    if (node.type === 'autotune' && stampKey) {
      return {
        ...node,
        params: {
          ...node.params,
          key: features.key,
          scaleMajor: features.scaleMajor,
        },
      };
    }
    if (node.type === 'delay' && stampDelay) {
      const timeMs = node.params.timeMs ?? 250;
      return {
        ...node,
        params: {
          ...node.params,
          timeMs: snapDelayTimeMs(timeMs, features.bpm),
        },
      };
    }
    return node;
  });

  return { ...preset, chain };
}
