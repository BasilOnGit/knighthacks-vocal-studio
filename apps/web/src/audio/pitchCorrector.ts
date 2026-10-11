import { chooseNote, hzToMidi, retuneStep } from './autotuneSnap.ts';

export type CorrectionParams = {
  key: number;
  scaleMajor: number;
  snap: number;
  retuneSpeed: number;
};

export type PitchCorrectorOptions = {
  /** Median filter length (odd) over voiced pitch estimates; 1 disables it. */
  medianSize?: number;
  /** One-pole smoothing (seconds) of the pitch estimate while it stays on one note. */
  pitchSmoothSec?: number;
};

/**
 * When correcting clip playback, the shifter synthesises a bit after audio enters it, so the
 * correction applied now should be the one for audio that entered ~40 ms ago. Measured with
 * the closed-loop test: this cuts the mean tuning error roughly in half (15 -> 7.6 cents) and
 * the worst case from 36 to 12 cents. (Live monitoring gets this for free from the detector's
 * own ~21 ms analysis lag.)
 */
export const PLAYBACK_PITCH_LOOKBACK_SEC = 0.04;

/** After this much unvoiced time the old correction is released toward zero. */
const UNVOICED_HOLD_SEC = 0.04;
const UNVOICED_RELEASE_TAU_SEC = 0.06;
/** A jump larger than this (semitones) is a new note: don't smooth across it. */
const NEW_NOTE_JUMP_SEMITONES = 1;
const MAX_STEP_SEC = 0.1;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

/**
 * Turns a stream of pitch estimates into a smooth correction (in semitones) toward the
 * nearest scale note. Shared by the live monitor and clip playback.
 *
 * Design notes (all about avoiding audible roughness):
 *  - median + light smoothing of the estimate so detector noise doesn't modulate the shifter
 *  - note hysteresis so a note near a scale boundary doesn't flip-flop
 *  - the correction decays to zero over unvoiced stretches instead of being held, so a
 *    stale correction is never applied to the start of the next note
 *  - a single smoothing stage (the retune speed); the shifter adds only de-zippering
 */
export class PitchCorrector {
  private readonly medianSize: number;
  private readonly pitchSmoothSec: number;
  private history: number[] = [];
  private smoothedMidi: number | null = null;
  private note: number | null = null;
  private applied = 0;
  private unvoicedSec = 0;

  constructor(options: PitchCorrectorOptions = {}) {
    const size = Math.max(1, Math.floor(options.medianSize ?? 1));
    this.medianSize = size % 2 === 0 ? size + 1 : size;
    this.pitchSmoothSec = options.pitchSmoothSec ?? 0.012;
  }

  reset(): void {
    this.history = [];
    this.smoothedMidi = null;
    this.note = null;
    this.applied = 0;
    this.unvoicedSec = 0;
  }

  /** Current correction in semitones (without any manual shift). */
  get correction(): number {
    return this.applied;
  }

  /**
   * @param pitchHz detected fundamental, or <= 0 when unvoiced / unreliable
   * @param dtSec time since the previous step
   */
  step(pitchHz: number, dtSec: number, params: CorrectionParams): number {
    const dt = Math.min(MAX_STEP_SEC, Math.max(0, Number.isFinite(dtSec) ? dtSec : 0));
    const voiced = Number.isFinite(pitchHz) && pitchHz > 0;

    if (!voiced) {
      this.unvoicedSec += dt;
      if (this.unvoicedSec > UNVOICED_HOLD_SEC) {
        const alpha = 1 - Math.exp(-dt / UNVOICED_RELEASE_TAU_SEC);
        this.applied += (0 - this.applied) * alpha;
      }
      if (this.unvoicedSec > 0.15) {
        this.history = [];
        this.smoothedMidi = null;
        this.note = null;
      }
      return this.applied;
    }

    this.unvoicedSec = 0;
    this.history.push(hzToMidi(pitchHz));
    if (this.history.length > this.medianSize) {
      this.history.shift();
    }
    const measured = this.history.length > 1 ? median(this.history) : this.history[0];

    if (
      this.smoothedMidi === null ||
      Math.abs(measured - this.smoothedMidi) > NEW_NOTE_JUMP_SEMITONES
    ) {
      this.smoothedMidi = measured;
    } else {
      const alpha = this.pitchSmoothSec > 0 ? 1 - Math.exp(-dt / this.pitchSmoothSec) : 1;
      this.smoothedMidi += (measured - this.smoothedMidi) * alpha;
    }

    this.note = chooseNote(this.smoothedMidi, params.key, params.scaleMajor, this.note);
    const snap = Math.min(1, Math.max(0, params.snap));
    const target = (this.note - this.smoothedMidi) * snap;
    this.applied = retuneStep(this.applied, target, dt, params.retuneSpeed);
    return this.applied;
  }
}
