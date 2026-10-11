import * as Tone from 'tone';
import { equalPowerMix } from '../audio/autotuneSnap';
import { AutotunePlayback } from '../audio/autotunePlayback';
import { buildPitchTrack } from '../audio/pitchTrack';
import { NoiseGate } from '../audio/noiseGate';
import {
  applyVocalCompressor,
  applyVocalCompressorMix,
  readVocalCompressorSettings,
  vocalReleaseSec,
} from '../audio/vocalCompressor';
import {
  applyDelayMix,
  vocalDelayFeedback,
  VOCAL_DELAY_HPF_HZ,
  VOCAL_DELAY_LPF_HZ,
} from '../audio/vocalDelay';
import {
  applyReverbMix,
  vocalReverbLpfHz,
  VOCAL_REVERB_HPF_HZ,
} from '../audio/vocalReverb';
import {
  applySaturationMix,
  configureVocalShaper,
  saturationTrimDb,
} from '../audio/vocalSaturation';
import {
  applyVocalHighpass,
  applyVocalPeaking,
  applyVocalShelf,
  vocalPeakingQ,
} from '../audio/vocalEq';
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
      if (slot.throughEffect) {
        slot.tail.disconnect();
      }
    }
    if (slot.enabled || slot.keepRouted) {
      slot.connectEffect();
      slot.throughEffect = true;
    } else {
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
        else if (key === 'lowShelfDb') ramp(lowshelf.gain, value);
        else if (key === 'bodyHz') ramp(body.frequency, value);
        else if (key === 'bodyDb') {
          ramp(body.gain, value);
          ramp(body.Q, vocalPeakingQ(value, 'body'));
        } else if (key === 'presenceHz') ramp(presence.frequency, value);
        else if (key === 'presenceDb') {
          ramp(presence.gain, value);
          ramp(presence.Q, vocalPeakingQ(value, 'presence'));
        } else if (key === 'airHz') ramp(air.frequency, value);
        else if (key === 'airDb') ramp(air.gain, value);
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

    const hpf = new Tone.Filter(freq, 'highpass');
    const comp = new Tone.Compressor({
      threshold,
      ratio: 10,
      attack: 0.003,
      release: 0.08,
      knee: 0,
    });
    const subtract = new Tone.Subtract();
    const reduction = new Tone.Gain(-mix);
    const input = new Tone.Gain(1);
    const output = new Tone.Gain(1);

    hpf.connect(subtract);
    hpf.connect(comp);
    comp.connect(subtract.subtrahend);
    subtract.connect(reduction);

    return {
      input,
      output,
      tail: reduction,
      connectEffect: () => {
        input.connect(output);
        input.connect(hpf);
        reduction.connect(output);
      },
      apply: (key, value) => {
        if (key === 'freqHz') ramp(hpf.frequency, value);
        else if (key === 'thresholdDb') ramp(comp.threshold, value);
        else if (key === 'mix') reduction.gain.value = -value;
      },
      dispose: () => {
        hpf.dispose();
        comp.dispose();
        subtract.dispose();
        reduction.dispose();
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
    applyVocalCompressorMix(dry, wet, read('mix'));
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
        if (key === 'thresholdDb') ramp(compressor.threshold, value);
        else if (key === 'ratio') {
          ramp(compressor.ratio, value);
          ramp(
            compressor.release,
            vocalReleaseSec(read('releaseMs'), value),
          );
        } else if (key === 'attackMs') ramp(compressor.attack, value / 1000);
        else if (key === 'releaseMs') {
          ramp(compressor.release, vocalReleaseSec(value, read('ratio')));
        } else if (key === 'kneeDb') ramp(compressor.knee, value);
        else if (key === 'makeupDb') ramp(makeup.gain, value);
        else if (key === 'mix') {
          const { dry: d, wet: w } = equalPowerMix(value);
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
    const drive = read('drive');
    const mix = read('mix');
    const highpass = new Tone.Filter(140, 'highpass');
    highpass.Q.value = 0.707;
    const shaper = new Tone.WaveShaper();
    configureVocalShaper(shaper, drive);
    const trim = new Tone.Gain(saturationTrimDb(drive), 'decibels');
    const air = new Tone.Filter({
      type: 'highshelf',
      frequency: 10_000,
      gain: Math.min(2.5, drive * 4),
    });
    air.Q.value = 0.55;
    const dry = new Tone.Gain(1);
    const wet = new Tone.Gain(1);
    applySaturationMix(dry, wet, mix);
    highpass.connect(shaper);
    shaper.connect(trim);
    trim.connect(air);
    const input = new Tone.Gain(1);
    const output = new Tone.Gain(1);
    return {
      input,
      output,
      tail: air,
      connectEffect: () => {
        input.connect(dry);
        dry.connect(output);
        input.connect(highpass);
        air.connect(wet);
        wet.connect(output);
      },
      apply: (key, value) => {
        if (key === 'drive') {
          configureVocalShaper(shaper, value);
          ramp(trim.gain, saturationTrimDb(value));
          ramp(air.gain, Math.min(2.5, value * 4));
        } else if (key === 'mix') {
          const { dry: d, wet: w } = equalPowerMix(value);
          ramp(dry.gain, d);
          ramp(wet.gain, w);
        }
      },
      dispose: () => {
        highpass.dispose();
        shaper.dispose();
        trim.dispose();
        air.dispose();
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
      depth: readParam('chorus', params, 'depth'),
    }).start();
    chorus.wet.value = readParam('chorus', params, 'mix');
    return this.single(
      chorus,
      (key, value) => {
        if (key === 'rateHz') ramp(chorus.frequency, value);
        else if (key === 'depth') chorus.depth = value;
        else if (key === 'mix') ramp(chorus.wet, value);
      },
      () => {
        chorus.stop();
      },
    );
  }

  private buildDelay(params: Record<string, number>): SlotParts {
    const read = (key: string) => readParam('delay', params, key);
    const timeSec = read('timeMs') / 1000;
    const feedback = vocalDelayFeedback(read('feedback'));
    const mix = read('mix');
    const line = new Tone.Delay({ delayTime: timeSec, maxDelay: 2 });
    const feedbackGain = new Tone.Gain(feedback);
    const highpass = new Tone.Filter(VOCAL_DELAY_HPF_HZ, 'highpass');
    highpass.Q.value = 0.707;
    const lowpass = new Tone.Filter(VOCAL_DELAY_LPF_HZ, 'lowpass');
    lowpass.Q.value = 0.707;
    const dry = new Tone.Gain(1);
    const wet = new Tone.Gain(1);
    applyDelayMix(dry, wet, mix);
    line.connect(lowpass);
    lowpass.connect(highpass);
    highpass.connect(feedbackGain);
    feedbackGain.connect(line);
    const input = new Tone.Gain(1);
    const output = new Tone.Gain(1);
    return {
      input,
      output,
      tail: line,
      connectEffect: () => {
        input.connect(dry);
        dry.connect(output);
        input.connect(line);
        highpass.connect(wet);
        wet.connect(output);
      },
      apply: (key, value) => {
        if (key === 'timeMs') ramp(line.delayTime, value / 1000);
        else if (key === 'feedback') ramp(feedbackGain.gain, vocalDelayFeedback(value));
        else if (key === 'mix') {
          const { dry: d, wet: w } = equalPowerMix(value);
          ramp(dry.gain, d);
          ramp(wet.gain, w);
        }
      },
      dispose: () => {
        line.dispose();
        feedbackGain.dispose();
        highpass.dispose();
        lowpass.dispose();
        dry.dispose();
        wet.dispose();
        input.dispose();
        output.dispose();
      },
    };
  }

  private buildReverb(id: string, params: Record<string, number>): SlotParts {
    const read = (key: string) => readParam('reverb', params, key);
    const decaySec = read('decaySec');
    const reverb = new Tone.Reverb({
      decay: decaySec,
      preDelay: read('preDelayMs') / 1000,
    });
    reverb.wet.value = 1;
    const highpass = new Tone.Filter(VOCAL_REVERB_HPF_HZ, 'highpass');
    highpass.Q.value = 0.707;
    const lowpass = new Tone.Filter(vocalReverbLpfHz(decaySec), 'lowpass');
    lowpass.Q.value = 0.707;
    const dry = new Tone.Gain(1);
    const wet = new Tone.Gain(1);
    applyReverbMix(dry, wet, read('mix'));
    reverb.connect(highpass);
    highpass.connect(lowpass);
    const input = new Tone.Gain(1);
    const output = new Tone.Gain(1);
    return {
      input,
      output,
      tail: reverb,
      connectEffect: () => {
        input.connect(dry);
        dry.connect(output);
        input.connect(reverb);
        lowpass.connect(wet);
        wet.connect(output);
      },
      apply: (key, value) => {
        if (key === 'mix') {
          const { dry: d, wet: w } = equalPowerMix(value);
          ramp(dry.gain, d);
          ramp(wet.gain, w);
          return;
        }
        if (key === 'decaySec') {
          ramp(lowpass.frequency, vocalReverbLpfHz(value));
        }
        if (key !== 'decaySec' && key !== 'preDelayMs') {
          return;
        }
        const pending = this.pendingReverb.get(id) ?? {};
        if (key === 'decaySec') pending.decay = value;
        else pending.preDelay = value / 1000;
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
        highpass.dispose();
        lowpass.dispose();
        dry.dispose();
        wet.dispose();
        input.dispose();
        output.dispose();
      },
    };
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
