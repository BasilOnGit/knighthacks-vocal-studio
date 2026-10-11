import {
  KEY_STAMP_MIN_CONFIDENCE,
  snapDelayTimeMs,
  stampPresetFromFeatures,
} from '../../../../shared/stampPreset.ts';
import type { VoiceFeatures } from '../../../../shared/types';

export { KEY_STAMP_MIN_CONFIDENCE, snapDelayTimeMs, stampPresetFromFeatures };

export function autotuneParamsFromFeatures(
  features: VoiceFeatures,
  base: Record<string, number>,
): Record<string, number> {
  if (features.keyConfidence < KEY_STAMP_MIN_CONFIDENCE) {
    return base;
  }
  return {
    ...base,
    key: features.key,
    scaleMajor: features.scaleMajor,
  };
}
