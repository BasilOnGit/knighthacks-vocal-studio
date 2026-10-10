import { z } from 'zod';
import { FIXED_ORDER, MAX_EFFECTS, PARAM_RANGES, fillParams } from './params.ts';
import type { EffectNode, EffectType, Preset } from './types';

const effectTypes = new Set<string>(FIXED_ORDER);

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
  const seen = new Set<EffectType>();
  const kept: Array<z.infer<typeof chainEntrySchema>> = [];

  for (const entry of parsed.chain) {
    if (!isEffectType(entry.type) || seen.has(entry.type)) {
      continue;
    }
    seen.add(entry.type);
    kept.push(entry);
    if (kept.length === MAX_EFFECTS) {
      break;
    }
  }

  const chain: EffectNode[] = kept.map((entry) => {
    const type = entry.type as EffectType;
    const node: EffectNode = {
      id: entry.id ?? `${type}-1`,
      type,
      enabled: entry.enabled ?? true,
      params: clampParams(type, entry.params),
    };
    if (entry.why !== undefined) {
      node.why = entry.why;
    }
    return node;
  });

  chain.sort((a, b) => FIXED_ORDER.indexOf(a.type) - FIXED_ORDER.indexOf(b.type));

  return {
    name: parsed.name,
    explanation: parsed.explanation,
    chain,
  };
}
