import * as Tone from 'tone';
import { snapSemitones, speedToWindowSize } from '../audio/autotuneSnap';
import { defaultParams } from '../../../../shared/params';
import type {
  EffectNode,
  EffectType,
  Preset,
  VocalChain as VocalChainContract,
  VocalChainOptions,
} from '../../../../shared/types';

const RAMP_SEC = 0.05;
const REVERB_DEBOUNCE_MS = 300;
const LOW_SHELF_HZ = 200;

type RampParam = {
  rampTo(value: number, rampTime: number): unknown;
};

type SlotParts = {
  input: Tone.Gain;
  output: Tone.Gain;
  tail: Tone.ToneAudioNode;
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
  private vocalPitchHz = 0;
  private readonly reverbTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingReverb = new Map<string, ReverbPending>();

  constructor() {
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.input.connect(this.output);
  }

  setChain(preset: Preset, options?: VocalChainOptions): void {
    this.vocalPitchHz = options?.pitchHz ?? 0;
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

  updateParam(id: string, key: string, value: number): void {
    this.slots.find((slot) => slot.id === id)?.apply(key, value);
  }

  setEnabled(id: string, on: boolean): void {
    const slot = this.slots.find((entry) => entry.id === id);
    if (!slot || slot.enabled === on) {
      return;
    }
    slot.enabled = on;
    this.wire(slot);
  }

  private teardown() {
    this.input.disconnect();
    for (const slot of this.slots) {
      slot.dispose();
    }
    this.slots = [];
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
    if (slot.enabled) {
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
    const parts = this.partsFor(effect.id, effect.type, params);
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

  private partsFor(id: string, type: EffectType, params: Record<string, number>): SlotParts {
    switch (type) {
      case 'gate':
        return this.buildGate(params);
      case 'autotune':
        return this.buildAutotune(params);
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

  private buildAutotune(params: Record<string, number>): SlotParts {
    const live = { ...params };
    const pitchShift = new Tone.PitchShift({
      pitch: 0,
      windowSize: speedToWindowSize(readParam('autotune', live, 'speed')),
    });
    pitchShift.wet.value = readParam('autotune', live, 'mix');
    const applyPitch = () => {
      const snapAmount = snapSemitones(
        this.vocalPitchHz,
        readParam('autotune', live, 'key'),
        readParam('autotune', live, 'scaleMajor'),
        readParam('autotune', live, 'snap'),
      );
      pitchShift.pitch =
        snapAmount + readParam('autotune', live, 'shiftSemitones');
    };
    applyPitch();
    return this.single(pitchShift, (key, value) => {
      live[key] = value;
      if (key === 'mix') ramp(pitchShift.wet, value);
      else if (key === 'speed') pitchShift.windowSize = speedToWindowSize(value);
      else if (
        key === 'key' ||
        key === 'snap' ||
        key === 'scaleMajor' ||
        key === 'shiftSemitones'
      ) {
        applyPitch();
      }
    });
  }

  private buildGate(params: Record<string, number>): SlotParts {
    const hpf = new Tone.Filter(60, 'highpass');
    const gate = new Tone.Compressor({
      threshold: readParam('gate', params, 'thresholdDb'),
      ratio: 20,
      attack: readParam('gate', params, 'attackMs') / 1000,
      release: readParam('gate', params, 'releaseMs') / 1000,
      knee: 0,
    });
    hpf.connect(gate);
    const input = new Tone.Gain(1);
    const output = new Tone.Gain(1);
    return {
      input,
      output,
      tail: gate,
      connectEffect: () => {
        input.connect(hpf);
        gate.connect(output);
      },
      apply: (key, value) => {
        if (key === 'thresholdDb') ramp(gate.threshold, value);
        else if (key === 'attackMs') ramp(gate.attack, value / 1000);
        else if (key === 'releaseMs') ramp(gate.release, value / 1000);
      },
      dispose: () => {
        hpf.dispose();
        gate.dispose();
        input.dispose();
        output.dispose();
      },
    };
  }

  private buildEq(params: Record<string, number>): SlotParts {
    const highpass = new Tone.Filter(readParam('eq', params, 'lowCutHz'), 'highpass');
    const lowshelf = new Tone.Filter({
      frequency: LOW_SHELF_HZ,
      type: 'lowshelf',
      gain: readParam('eq', params, 'lowShelfDb'),
    });
    const body = new Tone.Filter({
      frequency: readParam('eq', params, 'bodyHz'),
      type: 'peaking',
      Q: 1,
      gain: readParam('eq', params, 'bodyDb'),
    });
    const presence = new Tone.Filter({
      frequency: readParam('eq', params, 'presenceHz'),
      type: 'peaking',
      Q: 1,
      gain: readParam('eq', params, 'presenceDb'),
    });
    const air = new Tone.Filter({
      frequency: readParam('eq', params, 'airHz'),
      type: 'highshelf',
      gain: readParam('eq', params, 'airDb'),
    });
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
        else if (key === 'lowShelfDb') ramp(lowshelf.gain, value);
        else if (key === 'bodyHz') ramp(body.frequency, value);
        else if (key === 'bodyDb') ramp(body.gain, value);
        else if (key === 'presenceHz') ramp(presence.frequency, value);
        else if (key === 'presenceDb') ramp(presence.gain, value);
        else if (key === 'airHz') ramp(air.frequency, value);
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
    const compressor = new Tone.Compressor({
      threshold: readParam('compressor', params, 'thresholdDb'),
      ratio: readParam('compressor', params, 'ratio'),
      attack: readParam('compressor', params, 'attackMs') / 1000,
      release: readParam('compressor', params, 'releaseMs') / 1000,
    });
    const makeup = new Tone.Gain(readParam('compressor', params, 'makeupDb'), 'decibels');
    compressor.connect(makeup);
    const input = new Tone.Gain(1);
    const output = new Tone.Gain(1);
    return {
      input,
      output,
      tail: makeup,
      connectEffect: () => {
        input.connect(compressor);
        makeup.connect(output);
      },
      apply: (key, value) => {
        if (key === 'thresholdDb') ramp(compressor.threshold, value);
        else if (key === 'ratio') ramp(compressor.ratio, value);
        else if (key === 'attackMs') ramp(compressor.attack, value / 1000);
        else if (key === 'releaseMs') ramp(compressor.release, value / 1000);
        else if (key === 'makeupDb') ramp(makeup.gain, value);
      },
      dispose: () => {
        compressor.dispose();
        makeup.dispose();
        input.dispose();
        output.dispose();
      },
    };
  }

  private buildSaturation(params: Record<string, number>): SlotParts {
    const distortion = new Tone.Distortion(readParam('saturation', params, 'drive'));
    distortion.wet.value = readParam('saturation', params, 'mix');
    return this.single(distortion, (key, value) => {
      if (key === 'drive') distortion.distortion = value;
      else if (key === 'mix') ramp(distortion.wet, value);
    });
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
    const delay = new Tone.FeedbackDelay({
      delayTime: readParam('delay', params, 'timeMs') / 1000,
      feedback: readParam('delay', params, 'feedback'),
    });
    delay.wet.value = readParam('delay', params, 'mix');
    return this.single(delay, (key, value) => {
      if (key === 'timeMs') ramp(delay.delayTime, value / 1000);
      else if (key === 'feedback') ramp(delay.feedback, value);
      else if (key === 'mix') ramp(delay.wet, value);
    });
  }

  private buildReverb(id: string, params: Record<string, number>): SlotParts {
    const reverb = new Tone.Reverb({
      decay: readParam('reverb', params, 'decaySec'),
      preDelay: readParam('reverb', params, 'preDelayMs') / 1000,
    });
    reverb.wet.value = readParam('reverb', params, 'mix');
    return this.single(
      reverb,
      (key, value) => {
        if (key === 'mix') {
          ramp(reverb.wet, value);
          return;
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
      () => {
        const timer = this.reverbTimers.get(id);
        if (timer != null) clearTimeout(timer);
        this.reverbTimers.delete(id);
        this.pendingReverb.delete(id);
      },
    );
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
