import { z } from 'zod';
import { decaySecToSizePct } from './bandlabScale.ts';
import { MAX_EFFECTS, PARAM_RANGES, fillParams } from './params.ts';
import { clampTrackVolumeDb } from './trackVolume.ts';
import type { EffectNode, EffectType, Preset } from './types';

const effectTypes = new Set<string>(Object.keys(PARAM_RANGES));

const chainEntrySchema = z.object({
  type: z.string(),
  params: z.record(z.string(), z.number()),
  why: z.string().optional(),
  id: z.string().optional(),
  enabled: z.boolean().optional(),
});

const presetSchema = z.object({
  name: z.string(),
  explanation: z.string(),
  chain: z.array(chainEntrySchema),
  trackVolumeDb: z.number().optional(),
});

const PERCENT_MIX_TYPES = new Set<EffectType>([
  'delay',
  'reverb',
  'deesser',
  'chorus',
  'saturation',
  'compressor',
  'autotune',
  'doubler',
]);

function isEffectType(type: string): type is EffectType {
  return effectTypes.has(type);
}

/** Old presets used 0–1 mixes and reverb decaySec / preDelayMs — convert to BandLab-style numbers. */
function migrateLegacyParams(type: EffectType, params: Record<string, number>): Record<string, number> {
  const next = { ...params };

  if (PERCENT_MIX_TYPES.has(type) && typeof next.mix === 'number' && next.mix >= 0 && next.mix <= 1) {
    next.mix = next.mix * 100;
  }

  if (type === 'delay' && typeof next.feedback === 'number' && next.feedback >= 0 && next.feedback <= 1) {
    next.feedback = next.feedback * 100;
  }

  if (type === 'saturation') {
    if (typeof next.drive === 'number' && next.drive >= 0 && next.drive <= 1) {
      next.drive = next.drive * 100;
    }
  }

  if (type === 'chorus' && typeof next.depth === 'number' && next.depth >= 0 && next.depth <= 1) {
    next.depth = next.depth * 100;
  }

  if (type === 'reverb') {
    if (typeof next.decaySec === 'number' && next.sizePct === undefined) {
      next.sizePct = decaySecToSizePct(next.decaySec);
    }
    if (typeof next.preDelayMs === 'number' && next.tonePct === undefined) {
      next.tonePct = 50;
    }
  }

  return next;
}

function clampParams(type: EffectType, params: Record<string, number>): Record<string, number> {
  const migrated = migrateLegacyParams(type, params);
  const filled = fillParams(type, migrated);
  const spec = PARAM_RANGES[type];
  const clamped: Record<string, number> = {};
  for (const [key, range] of Object.entries(spec)) {
    const value = filled[key];
    clamped[key] = Number.isFinite(value)
      ? Math.min(range.max, Math.max(range.min, value))
      : range.default;
  }
  return clamped;
}

export function validatePreset(input: unknown): Preset {
  const parsed = presetSchema.parse(input);
  const typeCounts = new Map<EffectType, number>();
  const kept: Array<z.infer<typeof chainEntrySchema>> = [];

  for (const entry of parsed.chain) {
    if (!isEffectType(entry.type)) {
      continue;
    }
    kept.push(entry);
    if (kept.length === MAX_EFFECTS) {
      break;
    }
  }

  const chain: EffectNode[] = kept.map((entry) => {
    const type = entry.type as EffectType;
    const index = (typeCounts.get(type) ?? 0) + 1;
    typeCounts.set(type, index);
    const node: EffectNode = {
      id: entry.id ?? `${type}-${index}`,
      type,
      enabled: entry.enabled ?? true,
      params: clampParams(type, entry.params),
    };
    if (entry.why !== undefined) {
      node.why = entry.why;
    }
    return node;
  });

  const preset: Preset = {
    name: parsed.name,
    explanation: parsed.explanation,
    chain,
  };
  if (parsed.trackVolumeDb !== undefined) {
    preset.trackVolumeDb = clampTrackVolumeDb(parsed.trackVolumeDb);
  }
  return preset;
}
