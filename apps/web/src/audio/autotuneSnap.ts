const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

function scaleFor(scaleMajor: number): readonly number[] {
  return scaleMajor >= 0.5 ? MAJOR_SCALE : MINOR_SCALE;
}

export function isScaleNote(midiNote: number, key: number, scaleMajor: number): boolean {
  const root = ((Math.round(key) % 12) + 12) % 12;
  const rel = (((Math.round(midiNote) - root) % 12) + 12) % 12;
  return Math.round(midiNote) === midiNote && scaleFor(scaleMajor).includes(rel);
}

/** Closest in-scale MIDI note to a (fractional) MIDI pitch. */
export function nearestScaleNote(midi: number, key: number, scaleMajor: number): number {
  const root = ((Math.round(key) % 12) + 12) % 12;
  const scale = scaleFor(scaleMajor);
  let bestTarget = Math.round(midi);
  let bestDist = Infinity;
  for (let candidate = Math.floor(midi) - 8; candidate <= Math.ceil(midi) + 8; candidate += 1) {
    const rel = (((candidate - root) % 12) + 12) % 12;
    if (!scale.includes(rel)) {
      continue;
    }
    const dist = Math.abs(candidate - midi);
    if (dist < bestDist) {
      bestDist = dist;
      bestTarget = candidate;
    }
  }
  return bestTarget;
}

/** How much closer (semitones) the pitch must be to a new note before we leave the current one. */
export const NOTE_HYSTERESIS_SEMITONES = 0.3;

/**
 * Target note with hysteresis: stay on `current` until the pitch is clearly nearer another
 * scale note. Without this, a note sung near the midpoint between two scale notes makes the
 * target flip back and forth, which is heard as warble.
 */
export function chooseNote(
  midi: number,
  key: number,
  scaleMajor: number,
  current: number | null,
  hysteresis = NOTE_HYSTERESIS_SEMITONES,
): number {
  const nearest = nearestScaleNote(midi, key, scaleMajor);
  if (current === null || !isScaleNote(current, key, scaleMajor) || nearest === current) {
    return nearest;
  }
  const advantage = Math.abs(midi - current) - Math.abs(midi - nearest);
  return advantage > hysteresis ? nearest : current;
}

/** Semitones to shift toward the nearest scale degree in the given key. */
export function snapSemitones(
  pitchHz: number,
  key: number,
  scaleMajor: number,
  snap: number,
): number {
  if (pitchHz <= 0 || snap <= 0) {
    return 0;
  }
  const midi = hzToMidi(pitchHz);
  return (nearestScaleNote(midi, key, scaleMajor) - midi) * snap;
}

/** PitchShift analysis window (seconds). Larger = smoother, less “metallic”. */
export function speedToWindowSize(speed: number): number {
  const clamped = Math.min(1, Math.max(0, speed));
  return 0.1 + (1 - clamped) * 0.12;
}

export function equalPowerMix(mix01: number): { dry: number; wet: number } {
  const mix = Math.min(1, Math.max(0, mix01));
  return { dry: Math.sqrt(1 - mix), wet: Math.sqrt(mix) };
}

/**
 * BandLab-style send: dry stays up, wet is the mix percentage.
 * Equal-power ducks the vocal and makes 40% mix sound like a bright wash.
 */
export function vocalSendMix(mix01: number): { dry: number; wet: number } {
  const mix = Math.min(1, Math.max(0, mix01));
  return { dry: 1 - mix * 0.1, wet: mix };
}

/** Time constant (seconds) of the correction smoothing; retune01=1 is fastest. */
export function retuneTimeConstant(retune01: number): number {
  const clamped = Math.min(1, Math.max(0, retune01));
  return 0.15 * (1 - clamped) + 0.008;
}

/** Move applied correction toward target; retune01=1 is fastest. */
export function retuneStep(
  applied: number,
  target: number,
  dtSec: number,
  retune01: number,
): number {
  const dt = Math.min(0.12, Math.max(0, dtSec));
  const alpha = 1 - Math.exp(-dt / retuneTimeConstant(retune01));
  return applied + (target - applied) * alpha;
}
