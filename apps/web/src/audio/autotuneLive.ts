import { normalizeAutotuneMixParams } from '../../../../shared/effectMixPolicy.ts';
import { defaultParams, fillParams } from '../../../../shared/params';
import { PitchCorrector } from './pitchCorrector';

/** Below this the detector's pitch is too uncertain to correct. */
const MIN_CLARITY = 0.82;

/** Real-time snap + retune smoothing for live monitor (streaming pitch estimates). */
export class AutotuneLiveCorrector {
  private live: Record<string, number>;
  private readonly corrector = new PitchCorrector({ medianSize: 3 });

  constructor(params: Record<string, number> = {}) {
    this.live = normalizeAutotuneMixParams(params);
  }

  setParams(params: Record<string, number>): void {
    this.live = normalizeAutotuneMixParams(params);
  }

  reset(): void {
    this.corrector.reset();
  }

  /** Returns total pitch-shift semitones (correction + manual shift). */
  step(pitchHz: number, clarity: number, dtSec: number): number {
    const voiced = pitchHz > 0 && clarity >= MIN_CLARITY;
    const correction = this.corrector.step(voiced ? pitchHz : 0, dtSec, {
      key: this.live.key,
      scaleMajor: this.live.scaleMajor,
      snap: this.live.snap,
      retuneSpeed: this.live.retuneSpeed,
    });
    return correction + this.live.shiftSemitones;
  }

  mix(): number {
    return this.live.mix;
  }
}

export function defaultAutotuneParams(): Record<string, number> {
  return defaultParams('autotune');
}
