const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
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
  const root = ((Math.round(key) % 12) + 12) % 12;
  const scale = scaleMajor >= 0.5 ? MAJOR_SCALE : MINOR_SCALE;
  const midi = hzToMidi(pitchHz);
  let bestTarget = midi;
  let bestDist = Infinity;
  for (let candidate = Math.floor(midi) - 8; candidate <= Math.ceil(midi) + 8; candidate += 1) {
    const rel = ((candidate - root) % 12 + 12) % 12;
    if (!scale.includes(rel)) {
      continue;
    }
    const dist = Math.abs(candidate - midi);
    if (dist < bestDist) {
      bestDist = dist;
      bestTarget = candidate;
    }
  }
  return (bestTarget - midi) * snap;
}

export function speedToWindowSize(speed: number): number {
  const clamped = Math.min(1, Math.max(0, speed));
  return 0.03 + (1 - clamped) * 0.07;
}
