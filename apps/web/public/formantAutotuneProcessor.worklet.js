/* Formant-preserving pitch correction (Rubber Band Library, GPLv2).
 *
 * Streaming design:
 *  - Rubber Band runs in real-time mode, fed one render quantum at a time.
 *  - Its output is bursty and trails the input, so everything it produces goes into
 *    a FIFO that is pre-filled with enough silence that it can never underrun
 *    (an underrun is an audible click). The amount is MEASURED at start-up with a
 *    short calibration run, not guessed.
 *  - The dry signal runs through a delay line with exactly the same latency as the
 *    wet path, so dry/wet mixing is phase-aligned (no comb filtering / echo) and
 *    the latency is a known constant the host can compensate for.
 */

const RB_PROCESS_REALTIME = 0x00000001;
const RB_TRANSIENTS_SMOOTH = 0x00000200;
const RB_WINDOW_SHORT = 0x00100000;
const RB_FORMANT_PRESERVED = 0x01000000;
const RB_PITCH_HIGH_QUALITY = 0x02000000;
const RB_PITCH_HIGH_CONSISTENCY = 0x04000000;
const RB_CHANNELS_TOGETHER = 0x10000000;
const RB_ENGINE_FINER = 0x20000000;

/** Quality profiles. `studio` = best sound (playback); `live` = lower latency (monitoring). */
const PROFILES = {
  studio: {
    options:
      RB_PROCESS_REALTIME |
      RB_ENGINE_FINER |
      RB_FORMANT_PRESERVED |
      RB_PITCH_HIGH_CONSISTENCY |
      RB_CHANNELS_TOGETHER,
  },
  live: {
    options:
      RB_PROCESS_REALTIME |
      RB_FORMANT_PRESERVED |
      RB_PITCH_HIGH_QUALITY |
      RB_WINDOW_SHORT |
      RB_TRANSIENTS_SMOOTH |
      RB_CHANNELS_TOGETHER,
  },
};

const QUANTUM = 128;
const MAX_BLOCK = 512;
const FIFO_SIZE = 1 << 15;
const DELAY_SIZE = 1 << 15;
const PITCH_TAU_SEC = 0.006;
const MIX_TAU_SEC = 0.01;
/** Extra FIFO headroom on top of the measured worst-case deficit (samples). */
const PRIME_MARGIN = 256;
/** Input below this is treated as digital silence (idle detection). */
const SILENCE_LEVEL = 1e-6;
const CALIBRATION_QUANTA_PER_CALL = 8;
const CALIBRATION_SHIFT_SEMITONES = 2.5;

function paramAt(arr, index) {
  return arr.length > 1 ? arr[index] : arr[0];
}

function createWasmImports(heap) {
  const unsupported = () => 52;
  return {
    env: {
      emscripten_notify_memory_growth: () => {
        heap.stale = true;
      },
    },
    wasi_snapshot_preview1: {
      proc_exit: unsupported,
      fd_read: unsupported,
      fd_write: (fd, iov, iovcnt, pnum) => {
        if (fd > 2) return 52;
        refreshHeap(heap);
        let num = 0;
        for (let i = 0; i < iovcnt; i++) {
          num += heap.u32[(iov + 4) >> 2];
          iov += 8;
        }
        heap.u32[pnum >> 2] = num;
        return 0;
      },
      fd_seek: unsupported,
      fd_close: unsupported,
      environ_sizes_get: () => 52,
      environ_get: unsupported,
      clock_time_get: unsupported,
    },
  };
}

/** WASM memory can grow; re-create typed-array views whenever the buffer changed. */
function refreshHeap(heap) {
  const buffer = heap.exports.memory.buffer;
  if (heap.stale || heap.buffer !== buffer) {
    heap.buffer = buffer;
    heap.u8 = new Uint8Array(buffer);
    heap.u32 = new Uint32Array(buffer);
    heap.stale = false;
  }
}

function createApi(exports, heap) {
  const f32view = (ptr, len) => {
    refreshHeap(heap);
    return new Float32Array(heap.buffer, ptr, len);
  };
  return {
    rb_new: (sr, ch, opt, tr, ps) => exports.rb_new(sr, ch, opt, tr, ps),
    rb_delete: (s) => exports.rb_delete(s),
    rb_set_pitch_scale: (s, v) => exports.rb_set_pitch_scale(s, v),
    rb_set_max_process_size: (s, n) => exports.rb_set_max_process_size(s, n),
    rb_process: (s, ch, n, fin) => exports.rb_process(s, ch, n, fin),
    rb_available: (s) => exports.rb_available(s),
    rb_retrieve: (s, ch, n) => exports.rb_retrieve(s, ch, n),
    malloc: (n) => exports.wasm_malloc(n),
    free: (p) => exports.wasm_free(p),
    writePtr: (dest, value) => {
      refreshHeap(heap);
      heap.u32[dest >> 2] = value;
    },
    writeF32: (ptr, data, n) => {
      f32view(ptr, n).set(n === data.length ? data : data.subarray(0, n));
    },
    viewF32: f32view,
  };
}

/** Real-time mono pitch shifter around Rubber Band with an output FIFO. */
class RubberBandStream {
  /** `prime` = silent samples the FIFO starts with (the latency headroom). */
  constructor(api, sampleRate, options, prime) {
    this.api = api;
    this.state = api.rb_new(sampleRate, 1, options, 1, 1);
    api.rb_set_max_process_size(this.state, MAX_BLOCK);
    this.inPtr = api.malloc(MAX_BLOCK * 4);
    this.outPtr = api.malloc(MAX_BLOCK * 4);
    this.inChannels = api.malloc(4);
    this.outChannels = api.malloc(4);
    api.writePtr(this.inChannels, this.inPtr);
    api.writePtr(this.outChannels, this.outPtr);

    this.fifo = new Float32Array(FIFO_SIZE);
    this.fifoRead = 0;
    this.fifoCount = Math.max(0, Math.round(prime));
    this.scale = 1;
    this.produced = 0;
    this.pushed = 0;
    this.underruns = 0;
    this.maxBurst = 0;
    /** Optional raw capture of everything Rubber Band emits (calibration only). */
    this.capture = null;
  }

  setPitchScale(scale) {
    if (Math.abs(scale - this.scale) < 1e-7) return;
    this.scale = scale;
    this.api.rb_set_pitch_scale(this.state, scale);
  }

  /** Push `n` mono samples through the stretcher and queue whatever it produced. */
  push(mono, n) {
    const api = this.api;
    api.writeF32(this.inPtr, mono, n);
    api.rb_process(this.state, this.inChannels, n, 0);
    this.pushed += n;
    for (;;) {
      const available = api.rb_available(this.state);
      if (available < 1) break;
      const take = Math.min(MAX_BLOCK, available);
      const got = api.rb_retrieve(this.state, this.outChannels, take);
      if (got < 1) break;
      if (got > this.maxBurst) this.maxBurst = got;
      const samples = api.viewF32(this.outPtr, got);
      if (this.capture) this.capture.set(samples, this.produced);
      this.produced += got;
      this.enqueue(samples);
    }
  }

  enqueue(samples) {
    const cap = FIFO_SIZE;
    let write = (this.fifoRead + this.fifoCount) % cap;
    for (let i = 0; i < samples.length; i++) {
      if (this.fifoCount >= cap) {
        // Consumer stalled badly: drop oldest rather than overwrite unpredictably.
        this.fifoRead = (this.fifoRead + 1) % cap;
        this.fifoCount--;
      }
      this.fifo[write] = samples[i];
      write = (write + 1) % cap;
      this.fifoCount++;
    }
  }

  /** Pop `n` samples into `dest`; returns false (and zero-fills the gap) on underrun. */
  pop(dest, n) {
    const cap = FIFO_SIZE;
    const have = Math.min(n, this.fifoCount);
    for (let i = 0; i < have; i++) {
      dest[i] = this.fifo[this.fifoRead];
      this.fifoRead = (this.fifoRead + 1) % cap;
    }
    this.fifoCount -= have;
    if (have < n) {
      for (let i = have; i < n; i++) dest[i] = 0;
      this.underruns++;
      return false;
    }
    return true;
  }

  dispose() {
    const api = this.api;
    api.rb_delete(this.state);
    api.free(this.inPtr);
    api.free(this.outPtr);
    api.free(this.inChannels);
    api.free(this.outChannels);
  }
}

/**
 * Measures, for a given Rubber Band configuration:
 *   d    – how many output samples after the input an impulse appears (alignment delay)
 *   dmax – worst-case (pushed - produced) once output has started (FIFO headroom needed)
 * Runs a few quanta per call so it never stalls the audio thread.
 */
class LatencyCalibration {
  constructor(api, sampleRate, options) {
    this.api = api;
    this.sampleRate = sampleRate;
    this.options = options;
    const shift = Math.pow(2, CALIBRATION_SHIFT_SEMITONES / 12);
    this.plan = [
      { scale: 1, total: 12288, impulseAt: 4096 },
      { scale: shift, total: 10240, impulseAt: -1 },
      { scale: 1 / shift, total: 10240, impulseAt: -1 },
    ];
    this.index = 0;
    this.stream = null;
    this.block = new Float32Array(QUANTUM);
    this.d = 0;
    this.dmax = 0;
    this.done = false;
    this.maxBurst = 0;
  }

  step(quanta) {
    for (let q = 0; q < quanta && !this.done; q++) {
      const item = this.plan[this.index];
      if (!this.stream) {
        this.stream = new RubberBandStream(this.api, this.sampleRate, this.options, 0);
        this.stream.capture = new Float32Array(item.total + MAX_BLOCK * 4);
        this.stream.setPitchScale(item.scale);
        this.started = false;
      }
      const stream = this.stream;
      this.block.fill(0);
      const at = item.impulseAt - stream.pushed;
      if (item.impulseAt >= 0 && at >= 0 && at < QUANTUM) this.block[at] = 1;
      stream.push(this.block, QUANTUM);

      if (stream.produced > 0) {
        this.started = true;
        this.dmax = Math.max(this.dmax, stream.pushed - stream.produced);
      }
      if (stream.maxBurst > this.maxBurst) this.maxBurst = stream.maxBurst;

      if (stream.pushed >= item.total) {
        if (item.impulseAt >= 0) this.d = this.measureDelay(stream.capture, stream.produced, item.impulseAt);
        stream.dispose();
        this.stream = null;
        this.index++;
        if (this.index >= this.plan.length) this.done = true;
      }
    }
  }

  /** Energy centroid of the response to the impulse, relative to where it was fed. */
  measureDelay(capture, length, impulseAt) {
    let peak = 0;
    let peakAbs = 0;
    for (let i = 0; i < length; i++) {
      const a = Math.abs(capture[i]);
      if (a > peakAbs) {
        peakAbs = a;
        peak = i;
      }
    }
    const lo = Math.max(0, peak - 512);
    const hi = Math.min(length, peak + 512);
    let num = 0;
    let den = 0;
    for (let i = lo; i < hi; i++) {
      const e = capture[i] * capture[i];
      num += e * i;
      den += e;
    }
    const centroid = den > 0 ? num / den : peak;
    return centroid - impulseAt;
  }

  /** Total input->output latency in samples with a safe, underrun-free FIFO. */
  result() {
    const prime = Math.ceil(this.dmax + PRIME_MARGIN);
    return { prime, latency: Math.max(0, Math.round(this.d + prime)), d: this.d, dmax: this.dmax };
  }
}

/** Calibrations are shared by every processor in this audio context. */
const calibrations = new Map();

class VocalStudioFormantAutotuneProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'mix', defaultValue: 0, minValue: 0, maxValue: 1 },
      { name: 'pitchSemitones', defaultValue: 0, minValue: -24, maxValue: 24 },
    ];
  }

  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.wasmBinary = opts.wasmBinary || null;
    const profile = PROFILES[opts.quality] || PROFILES.studio;
    this.rbOptions = typeof opts.rbOptions === 'number' ? opts.rbOptions : profile.options;
    this.api = null;
    this.calibration = null;
    this.stream = null;
    this.ready = false;
    this.initError = false;

    this.mono = new Float32Array(MAX_BLOCK);
    this.wet = new Float32Array(MAX_BLOCK);
    this.delayLine = new Float32Array(DELAY_SIZE);
    this.delayWrite = 0;
    this.latency = 0;
    this.pitchNow = 0;
    this.mixNow = 0;
    this.pitchInit = false;
    this.mixInit = false;
    this.silentSamples = 0;
    this.idle = false;
    void this.initWasm();
  }

  async initWasm() {
    try {
      if (!this.wasmBinary) {
        throw new Error('FormantAutotune: missing wasmBinary (load on main thread)');
      }
      const heap = { exports: null, buffer: null, u8: null, u32: null, stale: true };
      const wasm = await WebAssembly.instantiate(this.wasmBinary, createWasmImports(heap));
      heap.exports = wasm.instance.exports;
      heap.exports._initialize();
      refreshHeap(heap);
      this.api = createApi(heap.exports, heap);
      const key = `${sampleRate}:${this.rbOptions}`;
      let calibration = calibrations.get(key);
      if (!calibration) {
        calibration = new LatencyCalibration(this.api, sampleRate, this.rbOptions);
        calibrations.set(key, calibration);
      }
      this.calibration = calibration;
    } catch (error) {
      console.error('FormantAutotune: wasm init failed', error);
      this.initError = true;
      this.port.postMessage({ type: 'error', message: String(error && error.message) });
    }
  }

  finishInit() {
    try {
      const result = this.calibration.result();
      this.stream = new RubberBandStream(this.api, sampleRate, this.rbOptions, result.prime);
      this.latency = result.latency;
      this.calibrationResult = result;
      this.delayLine.fill(0);
      this.delayWrite = 0;
      this.ready = true;
      this.port.postMessage({
        type: 'ready',
        latencySamples: this.latency,
        latencySec: this.latency / sampleRate,
      });
    } catch (error) {
      console.error('FormantAutotune: init failed', error);
      this.initError = true;
      this.port.postMessage({ type: 'error', message: String(error && error.message) });
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const input = inputs[0];
    const block = output[0].length;

    const mono = this.mono;
    for (let i = 0; i < block; i++) {
      let sample = 0;
      if (input && input.length > 0) {
        for (let c = 0; c < input.length; c++) {
          const inCh = input[c];
          if (inCh) sample += inCh[i];
        }
        sample /= input.length;
      }
      mono[i] = sample;
    }

    if (this.initError) {
      for (let ch = 0; ch < output.length; ch++) output[ch].set(mono.subarray(0, block));
      return true;
    }

    if (!this.ready) {
      if (this.calibration) {
        if (!this.calibration.done) this.calibration.step(CALIBRATION_QUANTA_PER_CALL);
        if (this.calibration.done) this.finishInit();
      }
      for (let ch = 0; ch < output.length; ch++) output[ch].fill(0);
      return true;
    }
    if (block > MAX_BLOCK) {
      for (let ch = 0; ch < output.length; ch++) output[ch].fill(0);
      return true;
    }

    const stream = this.stream;
    const targetMix = paramAt(parameters.mix, 0);
    const targetPitch = paramAt(parameters.pitchSemitones, 0);

    // Idle: once the whole pipeline (stretcher, FIFO, dry delay) holds only silence,
    // stop processing so unused clips cost no CPU. Nothing is pushed or popped while
    // idle, so the dry/wet alignment is untouched when audio resumes.
    let peak = 0;
    for (let i = 0; i < block; i++) {
      const a = Math.abs(mono[i]);
      if (a > peak) peak = a;
    }
    if (peak < SILENCE_LEVEL) {
      this.silentSamples += block;
    } else {
      this.silentSamples = 0;
    }
    if (this.silentSamples > this.latency * 2 + 8192) {
      this.idle = true;
      for (let ch = 0; ch < output.length; ch++) output[ch].fill(0);
      return true;
    }
    if (this.idle) {
      // Resume without gliding from stale control values.
      this.idle = false;
      this.pitchNow = targetPitch;
      this.mixNow = targetMix;
    }

    if (!this.pitchInit) {
      this.pitchNow = targetPitch;
      this.pitchInit = true;
    }
    if (!this.mixInit) {
      this.mixNow = targetMix;
      this.mixInit = true;
    }

    // One-pole smoothing per quantum removes staircase steps from main-thread updates.
    const dt = block / sampleRate;
    this.pitchNow += (targetPitch - this.pitchNow) * (1 - Math.exp(-dt / PITCH_TAU_SEC));
    stream.setPitchScale(Math.pow(2, this.pitchNow / 12));

    stream.push(mono, block);
    stream.pop(this.wet, block);

    // Dry path: delay line with the same latency as the wet path.
    const dl = this.delayLine;
    const mask = DELAY_SIZE - 1;
    const latency = this.latency;
    const mixCoef = 1 - Math.exp(-1 / (MIX_TAU_SEC * sampleRate));
    const out0 = output[0];
    for (let i = 0; i < block; i++) {
      const w = this.delayWrite;
      dl[w & mask] = mono[i];
      const dry = dl[(w - latency) & mask];
      this.delayWrite = (w + 1) | 0;
      this.mixNow += (paramAt(parameters.mix, i) - this.mixNow) * mixCoef;
      const mix = this.mixNow;
      // Aligned, correlated signals: linear crossfade keeps level constant.
      out0[i] = dry * (1 - mix) + this.wet[i] * mix;
    }
    for (let ch = 1; ch < output.length; ch++) output[ch].set(out0);

    return true;
  }
}

try {
  registerProcessor('vocal-studio-formant-autotune', VocalStudioFormantAutotuneProcessor);
} catch (error) {
  const message = error && error.message ? String(error.message) : '';
  if (!message.includes('already been registered')) {
    throw error;
  }
}
