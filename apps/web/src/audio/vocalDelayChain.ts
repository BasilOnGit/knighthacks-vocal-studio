import * as Tone from 'tone';
import {
  applyDelayMix,
  vocalDelayFeedback,
  VOCAL_DELAY_HPF_HZ,
  VOCAL_DELAY_LPF_HZ,
} from './vocalDelay.ts';
import { percentToUnit } from '../../../../shared/bandlabScale.ts';
import { defaultParams } from '../../../../shared/params.ts';
import { vocalSendMix } from './autotuneSnap.ts';

const MAX_DELAY_SEC = 2;

function readDelayParam(params: Record<string, number>, key: string): number {
  const value = params[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return defaultParams('delay')[key] ?? 0;
}

export type VocalDelaySlot = {
  input: Tone.Gain;
  output: Tone.Gain;
  tail: Tone.Delay;
  connectEffect: () => void;
  disconnectOutputTaps: () => void;
  clearTail: () => void;
  apply: (key: string, value: number) => void;
  dispose: () => void;
};

function snapGain(gain: Tone.Gain, value: number): void {
  const now = Tone.now();
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(value, now);
}

type RampToParam = { rampTo(value: number, rampTime: number): unknown };

/**
 * BandLab-style delay: parallel dry + wet, feedback loop filtered (HPF/LPF in loop only).
 * Internal loop is wired once; bypass only disconnects the input (same as compressor slot).
 */
export function buildVocalDelaySlot(
  params: Record<string, number>,
  rampDelayTime: (param: RampToParam, seconds: number) => void,
  rampMixGain: (gain: Tone.Gain, value: number) => void,
): VocalDelaySlot {
  const read = (key: string) => readDelayParam(params, key);
  if (read('pingPong') >= 0.5) {
    return buildVocalPingPongDelaySlot(params, rampDelayTime, rampMixGain);
  }
  const timeSec = read('timeMs') / 1000;
  const feedback = vocalDelayFeedback(percentToUnit(read('feedback')));
  const mix = percentToUnit(read('mix'));

  const sum = new Tone.Gain(1);
  let line = new Tone.Delay({ delayTime: timeSec, maxDelay: MAX_DELAY_SEC });
  const feedbackGain = new Tone.Gain(feedback);
  const feedbackHighpass = new Tone.Filter(VOCAL_DELAY_HPF_HZ, 'highpass');
  feedbackHighpass.Q.value = 0.707;
  const feedbackLowpass = new Tone.Filter(VOCAL_DELAY_LPF_HZ, 'lowpass');
  feedbackLowpass.Q.value = 0.707;
  const wetLowpass = new Tone.Filter(VOCAL_DELAY_LPF_HZ, 'lowpass');
  wetLowpass.Q.value = 0.707;
  const dry = new Tone.Gain(1);
  const wet = new Tone.Gain(1);
  applyDelayMix(dry, wet, mix);

  feedbackLowpass.connect(feedbackHighpass);
  feedbackHighpass.connect(feedbackGain);
  feedbackGain.connect(sum);
  wetLowpass.connect(wet);

  const attachDelayLine = (delayLine: Tone.Delay) => {
    sum.connect(delayLine);
    delayLine.connect(wetLowpass);
    delayLine.connect(feedbackLowpass);
  };

  attachDelayLine(line);

  const input = new Tone.Gain(1);
  const output = new Tone.Gain(1);

  const clearTail = () => {
    const delayTime = Number(line.delayTime.value);
    line.disconnect();
    line.dispose();
    line = new Tone.Delay({ delayTime, maxDelay: MAX_DELAY_SEC });
    attachDelayLine(line);
  };

  return {
    input,
    output,
    tail: line,
    clearTail,
    disconnectOutputTaps: () => {
      dry.disconnect();
      wet.disconnect();
    },
    connectEffect: () => {
      dry.disconnect();
      wet.disconnect();
      input.connect(dry);
      dry.connect(output);
      input.connect(sum);
      wet.connect(output);
    },
    apply: (key, value) => {
      if (key === 'timeMs') {
        rampDelayTime(line.delayTime as RampToParam, value / 1000);
      } else if (key === 'feedback') {
        snapGain(feedbackGain, vocalDelayFeedback(percentToUnit(value)));
      } else if (key === 'mix') {
        const { dry: d, wet: w } = vocalSendMix(percentToUnit(value));
        rampMixGain(dry, d);
        rampMixGain(wet, w);
      }
    },
    dispose: () => {
      line.dispose();
      sum.dispose();
      feedbackGain.dispose();
      feedbackHighpass.dispose();
      feedbackLowpass.dispose();
      wetLowpass.dispose();
      dry.dispose();
      wet.dispose();
      input.dispose();
      output.dispose();
    },
  };
}

function buildVocalPingPongDelaySlot(
  params: Record<string, number>,
  rampDelayTime: (param: RampToParam, seconds: number) => void,
  rampMixGain: (gain: Tone.Gain, value: number) => void,
): VocalDelaySlot {
  const read = (key: string) => readDelayParam(params, key);
  const timeSec = read('timeMs') / 1000;
  const feedback = vocalDelayFeedback(percentToUnit(read('feedback')));
  const mix = percentToUnit(read('mix'));

  let delayL = new Tone.Delay({ delayTime: timeSec, maxDelay: MAX_DELAY_SEC });
  let delayR = new Tone.Delay({ delayTime: timeSec, maxDelay: MAX_DELAY_SEC });
  const feedbackL = new Tone.Gain(feedback);
  const feedbackR = new Tone.Gain(feedback);
  const wetLpfL = new Tone.Filter(VOCAL_DELAY_LPF_HZ, 'lowpass');
  const wetLpfR = new Tone.Filter(VOCAL_DELAY_LPF_HZ, 'lowpass');
  wetLpfL.Q.value = 0.707;
  wetLpfR.Q.value = 0.707;
  const dry = new Tone.Gain(1);
  const wet = new Tone.Gain(1);
  applyDelayMix(dry, wet, mix);

  const input = new Tone.Gain(1);
  const output = new Tone.Gain(1);

  /** Cross-fed L/R lines; wet taps sum into mono `wet` (vocal bus is mono). */
  const wireDelayLines = (left: Tone.Delay, right: Tone.Delay) => {
    left.connect(wetLpfL);
    right.connect(wetLpfR);
    wetLpfL.connect(feedbackR);
    wetLpfR.connect(feedbackL);
    feedbackL.connect(left);
    feedbackR.connect(right);
    wetLpfL.connect(wet);
    wetLpfR.connect(wet);
  };

  wireDelayLines(delayL, delayR);

  const connectParallelPaths = () => {
    dry.disconnect();
    wet.disconnect();
    input.disconnect();
    input.connect(dry);
    dry.connect(output);
    input.connect(delayL);
    wet.connect(output);
  };

  const clearTail = () => {
    const tL = Number(delayL.delayTime.value);
    const tR = Number(delayR.delayTime.value);
    delayL.disconnect();
    delayR.disconnect();
    delayL.dispose();
    delayR.dispose();
    delayL = new Tone.Delay({ delayTime: tL, maxDelay: MAX_DELAY_SEC });
    delayR = new Tone.Delay({ delayTime: tR, maxDelay: MAX_DELAY_SEC });
    wireDelayLines(delayL, delayR);
    connectParallelPaths();
  };

  return {
    input,
    output,
    tail: delayL,
    clearTail,
    disconnectOutputTaps: () => {
      dry.disconnect();
      wet.disconnect();
    },
    connectEffect: connectParallelPaths,
    apply: (key, value) => {
      if (key === 'timeMs') {
        const sec = value / 1000;
        rampDelayTime(delayL.delayTime as RampToParam, sec);
        rampDelayTime(delayR.delayTime as RampToParam, sec);
      } else if (key === 'feedback') {
        const fb = vocalDelayFeedback(percentToUnit(value));
        snapGain(feedbackL, fb);
        snapGain(feedbackR, fb);
      } else if (key === 'mix') {
        const { dry: d, wet: w } = vocalSendMix(percentToUnit(value));
        rampMixGain(dry, d);
        rampMixGain(wet, w);
      }
    },
    dispose: () => {
      delayL.dispose();
      delayR.dispose();
      feedbackL.dispose();
      feedbackR.dispose();
      wetLpfL.dispose();
      wetLpfR.dispose();
      dry.dispose();
      wet.dispose();
      input.dispose();
      output.dispose();
    },
  };
}
