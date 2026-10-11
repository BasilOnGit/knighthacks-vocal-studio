import { percentToUnit } from '../../../../shared/bandlabScale.ts';
import { defaultParams } from '../../../../shared/params';
import { FormantAutotune } from './formantAutotune';
import { PitchCorrector, PLAYBACK_PITCH_LOOKBACK_SEC } from './pitchCorrector';
import { pitchHzAtTime, type PitchFrame } from './pitchTrack';

/** A source-time jump bigger than this is a seek, not playback progress. */
const SEEK_THRESHOLD_SEC = 0.25;
const NOMINAL_TICK_SEC = 0.02;

function readAutotuneParam(
  live: Record<string, number>,
  key: string,
): number {
  const value = live[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return defaultParams('autotune')[key] ?? 0;
}

function autotuneMix01(live: Record<string, number>): number {
  return percentToUnit(readAutotuneParam(live, 'mix'));
}

export class AutotunePlayback {
  readonly shifter: FormantAutotune;
  private live: Record<string, number>;
  private frames: PitchFrame[] = [];
  /** Offline pitch track is already cleaned up, so no extra median is needed here. */
  private readonly corrector = new PitchCorrector({ medianSize: 1 });
  private lastSourceTime: number | null = null;
  private effectEnabled = true;

  constructor(params: Record<string, number>) {
    this.live = { ...params };
    this.shifter = new FormantAutotune({ quality: 'studio' });
    this.shifter.setMix(autotuneMix01(this.live));
    this.shifter.setPitchSemitones(readAutotuneParam(this.live, 'shiftSemitones'), 0);
  }

  setEffectEnabled(on: boolean): void {
    this.effectEnabled = on;
    if (!on) {
      this.resetSmoothing();
      this.shifter.setPitchSemitones(0, 0);
      this.shifter.setMix(0, 0);
    } else {
      this.shifter.setMix(autotuneMix01(this.live), 0);
      this.shifter.setPitchSemitones(readAutotuneParam(this.live, 'shiftSemitones'), 0);
    }
  }

  setFrames(frames: PitchFrame[]): void {
    this.frames = frames;
    this.resetSmoothing();
  }

  resetSmoothing(): void {
    this.corrector.reset();
    this.lastSourceTime = null;
    this.shifter.setPitchSemitones(
      this.effectEnabled ? readAutotuneParam(this.live, 'shiftSemitones') : 0,
      0,
    );
  }

  tick(sourceTimeSec: number): void {
    if (!this.effectEnabled) {
      return;
    }

    let dt = NOMINAL_TICK_SEC;
    if (this.lastSourceTime !== null) {
      const delta = sourceTimeSec - this.lastSourceTime;
      if (delta < 0 || delta > SEEK_THRESHOLD_SEC) {
        this.corrector.reset();
      } else {
        dt = delta;
      }
    }
    this.lastSourceTime = sourceTimeSec;

    const f0 = pitchHzAtTime(this.frames, Math.max(0, sourceTimeSec - PLAYBACK_PITCH_LOOKBACK_SEC));
    const correction = this.corrector.step(f0, dt, {
      key: readAutotuneParam(this.live, 'key'),
      scaleMajor: readAutotuneParam(this.live, 'scaleMajor'),
      snap: readAutotuneParam(this.live, 'snap'),
      retuneSpeed: readAutotuneParam(this.live, 'retuneSpeed'),
    });
    this.shifter.setPitchSemitones(correction + readAutotuneParam(this.live, 'shiftSemitones'));
  }

  updateParam(key: string, value: number): void {
    this.live[key] = value;
    if (key === 'mix') {
      if (this.effectEnabled) {
        this.shifter.setMix(percentToUnit(value));
      }
    } else if (key === 'shiftSemitones' && this.effectEnabled) {
      this.shifter.setPitchSemitones(this.corrector.correction + value);
    }
  }

  dispose(): void {
    this.shifter.dispose();
  }
}
