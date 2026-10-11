/* Streaming pitch detector for live autotune monitoring.
 *
 * McLeod-style normalised square difference function (NSDF) on a ~12 kHz decimated copy
 * of the input, with parabolic peak interpolation (sub-cent accuracy on clean voice).
 * Passes audio through unchanged; posts { pitchHz, clarity, time } every analysis hop.
 */

const TARGET_ANALYSIS_RATE = 12000;
const DECIMATION = Math.max(1, Math.round(sampleRate / TARGET_ANALYSIS_RATE));
const ANALYSIS_RATE = sampleRate / DECIMATION;
/** Analysis window (decimated samples): ~43 ms, enough for two periods down to ~70 Hz. */
const FRAME = 512;
/** Hop between estimates, in decimated samples (~10 ms). */
const HOP = 128;
const MIN_HZ = 70;
const MAX_HZ = 700;
const MIN_LAG = Math.max(2, Math.floor(ANALYSIS_RATE / MAX_HZ));
const MAX_LAG = Math.min(FRAME - 8, Math.ceil(ANALYSIS_RATE / MIN_HZ));
/** First NSDF peak within this fraction of the best peak wins (avoids sub-octave picks). */
const PEAK_PICK_THRESHOLD = 0.9;
const MIN_RMS = 0.002;
/** Don't report faster than this (seconds). */
const MIN_POST_INTERVAL = 0.008;

class VocalStudioAutotuneMonitorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(FRAME);
    this.ringPos = 0;
    this.decimAcc = 0;
    this.decimCount = 0;
    this.samplesSinceHop = 0;
    this.lastPost = -1;
    this.frame = new Float32Array(FRAME);
    this.nsdf = new Float32Array(MAX_LAG + 2);
    this.prefix = new Float64Array(FRAME + 1);
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    const block = output[0].length;
    for (let i = 0; i < block; i++) {
      let sample = 0;
      if (input && input.length > 0) {
        for (let ch = 0; ch < input.length; ch++) {
          const channel = input[ch];
          if (channel) sample += channel[i];
        }
        sample /= input.length;
      }

      for (let ch = 0; ch < output.length; ch++) {
        const outCh = output[ch];
        if (outCh) outCh[i] = sample;
      }

      this.decimAcc += sample;
      this.decimCount += 1;
      if (this.decimCount >= DECIMATION) {
        this.ring[this.ringPos] = this.decimAcc / DECIMATION;
        this.ringPos = (this.ringPos + 1) % FRAME;
        this.decimAcc = 0;
        this.decimCount = 0;
        this.samplesSinceHop += 1;

        if (this.samplesSinceHop >= HOP) {
          this.samplesSinceHop = 0;
          const now = currentTime + i / sampleRate;
          if (now - this.lastPost >= MIN_POST_INTERVAL) {
            this.lastPost = now;
            const { pitchHz, clarity } = this.estimate();
            this.port.postMessage({ pitchHz, clarity, time: now });
          }
        }
      }
    }
    return true;
  }

  estimate() {
    const frame = this.frame;
    let read = this.ringPos;
    for (let i = 0; i < FRAME; i++) {
      frame[i] = this.ring[read];
      read = (read + 1) % FRAME;
    }

    const prefix = this.prefix;
    prefix[0] = 0;
    for (let i = 0; i < FRAME; i++) {
      prefix[i + 1] = prefix[i] + frame[i] * frame[i];
    }
    if (Math.sqrt(prefix[FRAME] / FRAME) < MIN_RMS) {
      return { pitchHz: 0, clarity: 0 };
    }

    const nsdf = this.nsdf;
    const maxLag = MAX_LAG + 1;
    for (let tau = 0; tau <= maxLag; tau++) {
      let acf = 0;
      const n = FRAME - tau;
      for (let j = 0; j < n; j++) {
        acf += frame[j] * frame[j + tau];
      }
      const m = prefix[n] + (prefix[FRAME] - prefix[tau]);
      nsdf[tau] = m > 1e-12 ? (2 * acf) / m : 0;
    }

    // Collect the highest point of each positive lobe after the initial lag-0 lobe.
    let tau = 1;
    while (tau < MAX_LAG && nsdf[tau] > 0) tau++;
    let bestVal = 0;
    const peaks = [];
    while (tau < MAX_LAG) {
      while (tau < MAX_LAG && nsdf[tau] <= 0) tau++;
      let peak = -1;
      let peakVal = 0;
      while (tau < MAX_LAG && nsdf[tau] > 0) {
        if (nsdf[tau] > peakVal) {
          peakVal = nsdf[tau];
          peak = tau;
        }
        tau++;
      }
      if (peak >= MIN_LAG && peak < MAX_LAG) {
        peaks.push(peak);
        if (peakVal > bestVal) bestVal = peakVal;
      }
    }
    if (peaks.length === 0) {
      return { pitchHz: 0, clarity: 0 };
    }

    let chosen = peaks[0];
    for (let p = 0; p < peaks.length; p++) {
      if (nsdf[peaks[p]] >= PEAK_PICK_THRESHOLD * bestVal) {
        chosen = peaks[p];
        break;
      }
    }

    // Parabolic interpolation around the chosen peak.
    const a = nsdf[chosen - 1];
    const b = nsdf[chosen];
    const c = nsdf[chosen + 1];
    const denom = a - 2 * b + c;
    let lag = chosen;
    let clarity = b;
    if (denom < 0) {
      const shift = (0.5 * (a - c)) / denom;
      if (Math.abs(shift) <= 1) {
        lag = chosen + shift;
        clarity = b - 0.25 * (a - c) * shift;
      }
    }
    clarity = Math.max(0, Math.min(1, clarity));
    return { pitchHz: ANALYSIS_RATE / lag, clarity };
  }
}

registerProcessor('vocal-studio-autotune-monitor', VocalStudioAutotuneMonitorProcessor);
