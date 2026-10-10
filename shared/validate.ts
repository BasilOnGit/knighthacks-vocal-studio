import { z } from 'zod';
import { MAX_EFFECTS, PARAM_RANGES, fillParams } from './params.ts';
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
});

function isEffectType(type: string): type is EffectType {
  return effectTypes.has(type);
}

function clampParams(type: EffectType, params: Record<string, number>): Record<string, number> {
  const filled = fillParams(type, params);
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

  return {
    name: parsed.name,
    explanation: parsed.explanation,
    chain,
  };
}
