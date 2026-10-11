import type { Preset, VoiceFeatures } from '../../../../shared/types';

const PREFIX_RE = /^Based on sound input/i;

/** Turn model/seed why text into a measurement-aware line for AI-generated effects only. */
export function formatAiEffectWhy(why: string, features: VoiceFeatures): string {
  const trimmed = why.trim();
  if (!trimmed || PREFIX_RE.test(trimmed)) {
    return trimmed;
  }
  const level = features.loudnessDb.toFixed(1);
  const clause = trimmed.replace(/\.$/, '');
  const lower = clause.charAt(0).toLowerCase() + clause.slice(1);
  return `Based on sound input (avg level: ${level} dB), use to ${lower}.`;
}

export function applyAiEffectWhys(preset: Preset, features: VoiceFeatures): Preset {
  return {
    ...preset,
    chain: preset.chain.map((node) =>
      node.why ? { ...node, why: formatAiEffectWhy(node.why, features) } : node,
    ),
  };
}

export function displayEffectWhy(
  why: string | undefined,
  fromAi: boolean,
  features: VoiceFeatures | null,
): string | undefined {
  if (!why) {
    return undefined;
  }
  if (!fromAi || !features) {
    return why;
  }
  return formatAiEffectWhy(why, features);
}
