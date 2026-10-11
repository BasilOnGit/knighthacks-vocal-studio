import React from 'react';
import type { VoiceFeatures } from '../../../../shared/types';
import { buildVoiceFeatures } from '../analysis/buildFeatures';
import { clipAnalysisKey } from '../session/clipAnalysis';
import type { Snippet } from '../session/snippets';

export function useVoiceFeatures(
  vocalClip: Snippet | null,
  beatClip: Snippet | undefined,
): VoiceFeatures | null {
  const vocalKey = vocalClip ? clipAnalysisKey(vocalClip) : '';
  const beatKey = beatClip ? clipAnalysisKey(beatClip) : '';
  const analysisKey = vocalKey ? `${vocalKey}|${beatKey}` : '';

  const vocalRef = React.useRef(vocalClip);
  const beatRef = React.useRef(beatClip);
  vocalRef.current = vocalClip;
  beatRef.current = beatClip;

  const [features, setFeatures] = React.useState<VoiceFeatures | null>(null);
  const cacheRef = React.useRef<{ key: string; features: VoiceFeatures } | null>(null);

  React.useEffect(() => {
    if (!analysisKey) {
      setFeatures(null);
      cacheRef.current = null;
      return;
    }
    if (cacheRef.current?.key === analysisKey) {
      setFeatures(cacheRef.current.features);
      return;
    }

    let cancelled = false;
    const run = () => {
      const vocal = vocalRef.current;
      if (cancelled || !vocal) {
        return;
      }
      const next = buildVoiceFeatures(vocal, beatRef.current ?? null);
      cacheRef.current = { key: analysisKey, features: next };
      setFeatures(next);
    };

    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(run, { timeout: 120 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const timer = window.setTimeout(run, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [analysisKey]);

  return features;
}
