import * as Tone from 'tone';
import { equalPowerMix, vocalSendMix } from '../audio/autotuneSnap';
import { AutotunePlayback } from '../audio/autotunePlayback';
import { buildPitchTrack } from '../audio/pitchTrack';
import { NoiseGate } from '../audio/noiseGate';
import {
  applyVocalCompressor,
  applyVocalCompressorMix,
  readVocalCompressorSettings,
  vocalReleaseSec,
} from '../audio/vocalCompressor';
import { buildVocalDelaySlot } from '../audio/vocalDelayChain';
import { VocalDenoise } from '../audio/vocalDenoise';
import { VocalDoubler } from '../audio/vocalDoubler';
import { VocalRider } from '../audio/vocalRider';
import {
  applyReverbMix,
  vocalReverbLpfHz,
  vocalReverbSendLpfHz,
  vocalReverbWetTrimGain,
  VOCAL_REVERB_HPF_HZ,
} from '../audio/vocalReverb';
import {
  applySaturationMix,
  configureVocalShaper,
  saturationTrimDb,
  VOCAL_SATURATION_POST_LPF_HZ,
} from '../audio/vocalSaturation';
import {
  applyVocalHighpass,
  applyVocalPeaking,
  applyVocalShelf,
  vocalPeakingQ,
} from '../audio/vocalEq';
import {
  applyDeesserCompressor,
  applyDeesserCrossover,
  deesserRatio,
} from '../audio/vocalDeesser';
import {
  percentToUnit,
  reverbSizeToDecaySec,
  reverbSizeToPreDelayMs,
} from '../../../../shared/bandlabScale.ts';
import { defaultParams } from '../../../../shared/params';
import type {
  EffectNode,
  EffectType,
  Preset,
  TrimRange,
  VocalChain as VocalChainContract,
  VocalChainOptions,
} from '../../../../shared/types';

const RAMP_SEC = 0.05;
const REVERB_DEBOUNCE_MS = 300;
type RampParam = {
  rampTo(value: number, rampTime: number): unknown;
  linearRampTo(value: number, rampTime: number): unknown;
};

type SlotParts = {
  input: Tone.Gain;
  output: Tone.Gain;
  tail: Tone.ToneAudioNode;
  /**
   * Keep the effect in the signal path even when disabled (the effect itself goes
   * transparent). Needed for effects with latency: removing them from the path would
   * shift the timing of the whole vocal.
   */
  keepRouted?: boolean;
  /** Seconds of delay this effect adds while in the path. */
  latencySec?: () => number;
  connectEffect: () => void;
  apply: (key: string, value: number) => void;
  /** Clear time-based effect memory (delay lines, etc.) for deterministic playback. */
  clearTail?: () => void;
  /** Tear down parallel dry/wet taps when bypassing (insert effects only). */
  disconnectOutputTaps?: () => void;
  dispose: () => void;
};

type BuiltSlot = SlotParts & {
  id: string;
  enabled: boolean;
  wired: boolean;
  throughEffect: boolean;
};

type ReverbPending = {
  decay?: number;
  preDelay?: number;
};

function readParam(type: EffectType, params: Record<string, number>, key: string): number {
  const value = params[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return defaultParams(type)[key] ?? 0;
}

function ramp(param: RampParam, value: number) {
  param.rampTo(value, RAMP_SEC);
}

function rampLinearGain(gain: Tone.Gain, value: number) {
  const now = Tone.now();
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampTo(value, RAMP_SEC);
}

/** dB gains are often ≤ 0; Tone's rampTo uses exponential ramps and can throw in the browser. */
function rampDb(param: RampParam, value: number) {
  param.linearRampTo(value, RAMP_SEC);
}

export class VocalChain implements VocalChainContract {
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;
  private slots: BuiltSlot[] = [];
  private readonly autotuneById = new Map<string, AutotunePlayback>();
  private latencyListener: (() => void) | null = null;
  private readonly reverbTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingReverb = new Map<string, ReverbPending>();

  constructor() {
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.input.connect(this.output);
  }

  setChain(preset: Preset, _options?: VocalChainOptions): void {
    this.teardown();
    if (preset.chain.length === 0) {
      this.input.connect(this.output);
      return;
    }
    let previous: Tone.ToneAudioNode = this.input;
    for (const effect of preset.chain) {
      const slot = this.build(effect);
      this.slots.push(slot);
      previous.connect(slot.input);
      previous = slot.output;
    }
    previous.connect(this.output);
    // Parallel dry/wet effects wire their taps in build(); re-seat after the serial chain is linked.
    for (const slot of this.slots) {
      if ((slot.enabled || slot.keepRouted) && slot.disconnectOutputTaps) {
        slot.connectEffect();
      }
    }
  }

  dispose(): void {
    this.teardown();
    this.input.dispose();
    this.output.dispose();
  }

  updateParam(id: string, key: string, value: number): void {
    this.slots.find((slot) => slot.id === id)?.apply(key, value);
  }

  setEnabled(id: string, on: boolean): void {
    const slot = this.slots.find((entry) => entry.id === id);
    if (!slot || slot.enabled === on) {
      return;
    }
    slot.enabled = on;
    this.autotuneById.get(id)?.setEffectEnabled(on);
    if (!slot.keepRouted) {
      this.wire(slot);
    }
  }

  /** Total delay (seconds) this chain adds to the signal passing through it. */
  get latencySec(): number {
    let total = 0;
    for (const slot of this.slots) {
      total += slot.latencySec?.() ?? 0;
    }
    return total;
  }

  /** Notified when `latencySec` changes (e.g. once an autotune worklet has measured itself). */
  onLatencyChange(listener: (() => void) | null): void {
    this.latencyListener = listener;
  }

  setAutotuneSource(buffer: AudioBuffer, trim: TrimRange): void {
    if (this.autotuneById.size === 0) {
      return;
    }
    const frames = buildPitchTrack(buffer, trim);
    for (const playback of this.autotuneById.values()) {
      playback.setFrames(frames);
    }
  }

  tickAutotune(sourceTimeSec: number): void {
    for (const playback of this.autotuneById.values()) {
      playback.tick(sourceTimeSec);
    }
  }

  resetAutotuneSmoothing(): void {
    for (const playback of this.autotuneById.values()) {
      playback.resetSmoothing();
    }
  }

  /** Flush delay/reverb state so each transport start matches the current slider values. */
  resetEffectTails(): void {
    for (const slot of this.slots) {
      slot.clearTail?.();
    }
  }

  private teardown() {
    this.input.disconnect();
    for (const slot of this.slots) {
      slot.dispose();
    }
    this.slots = [];
    this.autotuneById.clear();
    for (const timer of this.reverbTimers.values()) {
      clearTimeout(timer);
    }
    this.reverbTimers.clear();
    this.pendingReverb.clear();
  }

  private wire(slot: BuiltSlot) {
    if (slot.wired) {
      slot.input.disconnect();
    }
    if (slot.enabled || slot.keepRouted) {
      slot.connectEffect();
      slot.throughEffect = true;
    } else {
      slot.disconnectOutputTaps?.();
      slot.input.connect(slot.output);
      slot.throughEffect = false;
    }
    slot.wired = true;
  }

  private build(effect: EffectNode): BuiltSlot {
    const params = effect.params;
    const parts = this.partsFor(effect.id, effect.type, params, effect.enabled);
    const slot: BuiltSlot = {
      ...parts,
      id: effect.id,
      enabled: effect.enabled,
      wired: false,
      throughEffect: false,
    };
    this.wire(slot);
    return slot;
  }

  private partsFor(
    id: string,
    type: EffectType,
    params: Record<string, number>,
    enabled: boolean,
  ): SlotParts {
    switch (type) {
      case 'gate':
        return this.buildGate(params);
      case 'denoise':
        return this.buildDenoise(params);
      case 'rider':
        return this.buildRider(params);
      case 'doubler':
        return this.buildDoubler(params);
      case 'autotune':
        return this.buildAutotune(id, params, enabled);
      case 'eq':
        return this.buildEq(params);
      case 'compressor':
        return this.buildCompressor(params);
      case 'deesser':
        return this.buildDeesser(params);
      case 'saturation':
        return this.buildSaturation(params);
      case 'chorus':
        return this.buildChorus(params);
      case 'delay':
        return this.buildDelay(params);
      case 'reverb':
        return this.buildReverb(id, params);
      default: {
        const unreachable: never = type;
        return unreachable;
      }
    }
  }

  private buildAutotune(
    id: string,
    params: Record<string, number>,
    enabled: boolean,
  ): SlotParts {
    const playback = new AutotunePlayback(params);
    playback.setEffectEnabled(enabled);
    this.autotuneById.set(id, playback);
    const input = new Tone.Gain(1);
    const output = new Tone.Gain(1);
    playback.shifter.onLatencyChange(() => this.latencyListener?.());
    return {
      input,
      output,
      tail: playback.shifter,
      keepRouted: true,
      latencySec: () => playback.shifter.latencySec,
      connectEffect: () => {
        input.connect(playback.shifter.input);
        playback.shifter.output.connect(output);
      },
      apply: (key, value) => playback.updateParam(key, value),
      dispose: () => {
        this.autotuneById.delete(id);
        playback.dispose();
        input.dispose();
        output.dispose();
      },
    };
  }

  private buildGate(params: Record<string, number>): SlotParts {
    const gate = new NoiseGate({
      thresholdDb: readParam('gate', params, 'thresholdDb'),
      attackMs: readParam('gate', params, 'attackMs'),
      releaseMs: readParam('gate', params, 'releaseMs'),
    });
    return this.single(gate, (key, value) => {
      if (key === 'thresholdDb') gate.setThresholdDb(value, RAMP_SEC);
      else if (key === 'attackMs') gate.setAttackMs(value, RAMP_SEC);
      else if (key === 'releaseMs') gate.setReleaseMs(value, RAMP_SEC);
    });
  }

  private buildEq(params: Record<string, number>): SlotParts {
    const highpass = new Tone.Filter();
    const lowshelf = new Tone.Filter();
    const body = new Tone.Filter();
    const presence = new Tone.Filter();
    const air = new Tone.Filter();
    applyVocalHighpass(highpass, readParam('eq', params, 'lowCutHz'));
    applyVocalShelf(
      lowshelf,
      readParam('eq', params, 'lowShelfHz'),
      readParam('eq', params, 'lowShelfDb'),
      'low',
    );
    applyVocalPeaking(
      body,
      readParam('eq', params, 'bodyHz'),
      readParam('eq', params, 'bodyDb'),
      'body',
    );
    applyVocalPeaking(
      presence,
      readParam('eq', params, 'presenceHz'),
      readParam('eq', params, 'presenceDb'),
      'presence',
    );
    applyVocalShelf(air, readParam('eq', params, 'airHz'), readParam('eq', params, 'airDb'), 'high');
    highpass.connect(lowshelf);
    lowshelf.connect(body);
    body.connect(presence);
    presence.connect(air);
    const input = new Tone.Gain(1);
    const output = new Tone.Gain(1);
    return {
      input,
      output,
      tail: air,
      connectEffect: () => {
        input.connect(highpass);
        air.connect(output);
      },
      apply: (key, value) => {
        if (key === 'lowCutHz') ramp(highpass.frequency, value);
        else if (key === 'lowShelfHz') ramp(lowshelf.frequency, value);
        else if (key === 'lowShelfDb') rampDb(lowshelf.gain, value);
        else if (key === 'bodyHz') ramp(body.frequency, value);
        else if (key === 'bodyDb') {
          rampDb(body.gain, value);
          ramp(body.Q, vocalPeakingQ(value, 'body'));
        } else if (key === 'presenceHz') ramp(presence.frequency, value);
        else if (key === 'presenceDb') {
          rampDb(presence.gain, value);
          ramp(presence.Q, vocalPeakingQ(value, 'presence'));
        } else if (key === 'airHz') ramp(air.frequency, value);
        else if (key === 'airDb') rampDb(air.gain, value);
      },
      dispose: () => {
        highpass.dispose();
        lowshelf.dispose();
        body.dispose();
        presence.dispose();
        air.dispose();
        input.dispose();
        output.dispose();
      },
    };
  }

  private buildDeesser(params: Record<string, number>): SlotParts {
    const freq = readParam('deesser', params, 'freqHz');
    const threshold = readParam('deesser', params, 'thresholdDb');
    const mix = readParam('deesser', params, 'mix');

    const low = new Tone.Filter();
    const high = new Tone.Filter();
    applyDeesserCrossover(low, high, freq);
    const compressor = new Tone.Compressor();
    applyDeesserCompressor(compressor, threshold, percentToUnit(mix));
    const input = new Tone.Gain(1);
    const output = new Tone.Gain(1);
    high.connect(compressor);

    return {
      input,
      output,
      tail: compressor,
      connectEffect: () => {
        input.connect(low);
        low.connect(output);
        input.connect(high);
        compressor.connect(output);
      },
      apply: (key, value) => {
        if (key === 'freqHz') {
          ramp(low.frequency, value);
          ramp(high.frequency, value);
        } else if (key === 'thresholdDb') rampDb(compressor.threshold, value);
        else if (key === 'mix') ramp(compressor.ratio, deesserRatio(percentToUnit(value)));
      },
      dispose: () => {
        low.dispose();
        high.dispose();
        compressor.dispose();
        input.dispose();
        output.dispose();
      },
    };
  }

  private buildCompressor(params: Record<string, number>): SlotParts {
    const read = (key: string) => readParam('compressor', params, key);
    const compressor = new Tone.Compressor();
    applyVocalCompressor(compressor, readVocalCompressorSettings(read));
    const makeup = new Tone.Gain(read('makeupDb'), 'decibels');
    const dry = new Tone.Gain(1);
    const wet = new Tone.Gain(1);
    applyVocalCompressorMix(dry, wet, percentToUnit(read('mix')));
    compressor.connect(makeup);
    const input = new Tone.Gain(1);
    const output = new Tone.Gain(1);
    return {
      input,
      output,
      tail: makeup,
      connectEffect: () => {
        input.connect(dry);
        dry.connect(output);
        input.connect(compressor);
        makeup.connect(wet);
        wet.connect(output);
      },
      apply: (key, value) => {
        if (key === 'thresholdDb') rampDb(compressor.threshold, value);
        else if (key === 'ratio') {
          ramp(compressor.ratio, value);
          ramp(
            compressor.release,
            vocalReleaseSec(read('releaseMs'), value),
          );
        } else if (key === 'attackMs') ramp(compressor.attack, value / 1000);
        else if (key === 'releaseMs') {
          ramp(compressor.release, vocalReleaseSec(value, read('ratio')));
        } else if (key === 'kneeDb') rampDb(compressor.knee, value);
        else if (key === 'makeupDb') rampDb(makeup.gain, value);
        else if (key === 'mix') {
          const { dry: d, wet: w } = equalPowerMix(percentToUnit(value));
          ramp(dry.gain, d);
          ramp(wet.gain, w);
        }
      },
      dispose: () => {
        compressor.dispose();
        makeup.dispose();
        dry.dispose();
        wet.dispose();
        input.dispose();
        output.dispose();
      },
    };
  }

  private buildSaturation(params: Record<string, number>): SlotParts {
    const read = (key: string) => readParam('saturation', params, key);
    const drive = percentToUnit(read('drive'));
    const mix = percentToUnit(read('mix'));
    const highpass = new Tone.Filter(180, 'highpass');
    highpass.Q.value = 0.707;
    const shaper = new Tone.WaveShaper();
    configureVocalShaper(shaper, drive);
    const trim = new Tone.Gain(saturationTrimDb(drive), 'decibels');
    const smooth = new Tone.Filter(VOCAL_SATURATION_POST_LPF_HZ, 'lowpass');
    smooth.Q.value = 0.5;
    const dry = new Tone.Gain(1);
    const wet = new Tone.Gain(1);
    applySaturationMix(dry, wet, mix);
    highpass.connect(shaper);
    shaper.connect(trim);
    trim.connect(smooth);
    const input = new Tone.Gain(1);
    const output = new Tone.Gain(1);
    return {
      input,
      output,
      tail: smooth,
      connectEffect: () => {
        input.connect(dry);
        dry.connect(output);
        input.connect(highpass);
        smooth.connect(wet);
        wet.connect(output);
      },
      apply: (key, value) => {
        if (key === 'drive') {
          const drive01 = percentToUnit(value);
          configureVocalShaper(shaper, drive01);
          rampDb(trim.gain, saturationTrimDb(drive01));
        } else if (key === 'mix') {
          const { dry: d, wet: w } = equalPowerMix(percentToUnit(value));
          ramp(dry.gain, d);
          ramp(wet.gain, w);
        }
      },
      dispose: () => {
        highpass.dispose();
        shaper.dispose();
        trim.dispose();
        smooth.dispose();
        dry.dispose();
        wet.dispose();
        input.dispose();
        output.dispose();
      },
    };
  }

  private buildChorus(params: Record<string, number>): SlotParts {
    const chorus = new Tone.Chorus({
      frequency: readParam('chorus', params, 'rateHz'),
      depth: percentToUnit(readParam('chorus', params, 'depth')),
    }).start();
    chorus.wet.value = percentToUnit(readParam('chorus', params, 'mix'));
    return this.single(
      chorus,
      (key, value) => {
        if (key === 'rateHz') ramp(chorus.frequency, value);
        else if (key === 'depth') chorus.depth = percentToUnit(value);
        else if (key === 'mix') ramp(chorus.wet, percentToUnit(value));
      },
      () => {
        chorus.stop();
      },
    );
  }

  private buildDelay(params: Record<string, number>): SlotParts {
    return buildVocalDelaySlot(params, (param, seconds) => ramp(param as RampParam, seconds), rampLinearGain);
  }

  private buildReverb(id: string, params: Record<string, number>): SlotParts {
    const read = (key: string) => readParam('reverb', params, key);
    const sizePct = read('sizePct');
    const tonePct = read('tonePct');
    const decaySec = reverbSizeToDecaySec(sizePct);
    const reverb = new Tone.Reverb({
      decay: decaySec,
      preDelay: reverbSizeToPreDelayMs(sizePct) / 1000,
    });
    reverb.wet.value = 1;
    const sendHpf = new Tone.Filter(VOCAL_REVERB_HPF_HZ, 'highpass');
    sendHpf.Q.value = 0.5;
    const sendLpf = new Tone.Filter(vocalReverbSendLpfHz(decaySec, tonePct), 'lowpass');
    sendLpf.Q.value = 0.5;
    const tailLpf = new Tone.Filter(vocalReverbLpfHz(decaySec, tonePct), 'lowpass');
    tailLpf.Q.value = 0.5;
    tailLpf.rolloff = -24;
    const wetTrim = new Tone.Gain(vocalReverbWetTrimGain());
    const dry = new Tone.Gain(1);
    const wet = new Tone.Gain(1);
    applyReverbMix(dry, wet, percentToUnit(read('mix')));
    sendHpf.connect(sendLpf);
    sendLpf.connect(reverb);
    reverb.connect(tailLpf);
    tailLpf.connect(wetTrim);
    const input = new Tone.Gain(1);
    const output = new Tone.Gain(1);
    let liveSizePct = sizePct;
    let liveTonePct = tonePct;
    return {
      input,
      output,
      tail: reverb,
      connectEffect: () => {
        input.connect(dry);
        dry.connect(output);
        input.connect(sendHpf);
        wetTrim.connect(wet);
        wet.connect(output);
      },
      apply: (key, value) => {
        if (key === 'mix') {
          const { dry: d, wet: w } = vocalSendMix(percentToUnit(value));
          ramp(dry.gain, d);
          ramp(wet.gain, w);
          return;
        }
        if (key === 'sizePct') liveSizePct = value;
        if (key === 'tonePct') liveTonePct = value;
        if (key === 'sizePct' || key === 'tonePct') {
          const decay = reverbSizeToDecaySec(liveSizePct);
          ramp(sendLpf.frequency, vocalReverbSendLpfHz(decay, liveTonePct));
          ramp(tailLpf.frequency, vocalReverbLpfHz(decay, liveTonePct));
        }
        if (key !== 'sizePct') {
          return;
        }
        const pending = this.pendingReverb.get(id) ?? {};
        pending.decay = reverbSizeToDecaySec(value);
        pending.preDelay = reverbSizeToPreDelayMs(value) / 1000;
        this.pendingReverb.set(id, pending);
        const existing = this.reverbTimers.get(id);
        if (existing != null) clearTimeout(existing);
        this.reverbTimers.set(
          id,
          setTimeout(() => {
            this.reverbTimers.delete(id);
            const next = this.pendingReverb.get(id);
            this.pendingReverb.delete(id);
            if (!next) return;
            if (next.decay != null) reverb.decay = next.decay;
            if (next.preDelay != null) reverb.preDelay = next.preDelay;
          }, REVERB_DEBOUNCE_MS),
        );
      },
      dispose: () => {
        const timer = this.reverbTimers.get(id);
        if (timer != null) clearTimeout(timer);
        this.reverbTimers.delete(id);
        this.pendingReverb.delete(id);
        reverb.dispose();
        sendHpf.dispose();
        sendLpf.dispose();
        tailLpf.dispose();
        wetTrim.dispose();
        dry.dispose();
        wet.dispose();
        input.dispose();
        output.dispose();
      },
    };
  }

  private buildDenoise(params: Record<string, number>): SlotParts {
    const denoise = new VocalDenoise(readParam('denoise', params, 'amount'));
    return this.single(denoise, (key, value) => {
      if (key === 'amount') denoise.setAmount(value, RAMP_SEC);
    });
  }

  private buildRider(params: Record<string, number>): SlotParts {
    const rider = new VocalRider({
      targetDb: readParam('rider', params, 'targetDb'),
      speed: readParam('rider', params, 'speed'),
      maxGainDb: readParam('rider', params, 'maxGainDb'),
    });
    return this.single(rider, (key, value) => rider.updateParam(key, value, RAMP_SEC));
  }

  private buildDoubler(params: Record<string, number>): SlotParts {
    const doubler = new VocalDoubler({
      mix: readParam('doubler', params, 'mix'),
      delayMs: readParam('doubler', params, 'delayMs'),
      width: readParam('doubler', params, 'width'),
    });
    return this.single(doubler, (key, value) => doubler.updateParam(key, value, RAMP_SEC));
  }

  private single(
    effect: Tone.ToneAudioNode,
    apply: (key: string, value: number) => void,
    beforeDispose?: () => void,
  ): SlotParts {
    const input = new Tone.Gain(1);
    const output = new Tone.Gain(1);
    return {
      input,
      output,
      tail: effect,
      connectEffect: () => {
        input.connect(effect);
        effect.connect(output);
      },
      apply,
      dispose: () => {
        beforeDispose?.();
        effect.dispose();
        input.dispose();
        output.dispose();
      },
    };
  }
}
