import type { Preset } from '../../../../shared/types';

export function summarizePresetChanges(
  before: Preset,
  after: Preset,
  opts?: { beforeTrackVolumeDb?: number; afterTrackVolumeDb?: number },
): string[] {
  const lines: string[] = [];
  const beforeTypes = before.chain.map((n) => n.type);
  const afterTypes = after.chain.map((n) => n.type);

  for (const type of afterTypes) {
    if (!beforeTypes.includes(type)) {
      lines.push(`Added ${type}`);
    }
  }
  for (const type of beforeTypes) {
    if (!afterTypes.includes(type)) {
      lines.push(`Removed ${type}`);
    }
  }

  if (before.name !== after.name && after.name) {
    lines.push(`Preset name: ${after.name}`);
  }

  const beforeVol = opts?.beforeTrackVolumeDb;
  const afterVol = opts?.afterTrackVolumeDb;
  if (
    beforeVol !== undefined &&
    afterVol !== undefined &&
    Math.abs(beforeVol - afterVol) >= 1
  ) {
    lines.push(`Track fader: ${beforeVol} dB → ${afterVol} dB`);
  }

  const shared = after.chain.filter((node) =>
    before.chain.some((b) => b.type === node.type),
  );
  for (const node of shared) {
    const prev = before.chain.find((b) => b.type === node.type);
    if (!prev) continue;
    if (prev.enabled !== node.enabled) {
      lines.push(`${node.type} ${node.enabled ? 'enabled' : 'disabled'}`);
    }
    if (
      node.params.mix !== undefined &&
      prev.params.mix !== undefined &&
      Math.abs(node.params.mix - prev.params.mix) > 2
    ) {
      lines.push(`${node.type} mix adjusted`);
    }
  }

  if (lines.length === 0 && after.explanation) {
    lines.push(after.explanation);
  }
  return lines.slice(0, 8);
}
