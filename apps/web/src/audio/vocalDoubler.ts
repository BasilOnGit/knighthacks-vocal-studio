import * as Tone from 'tone';
import { percentToUnit } from '../../../../shared/bandlabScale.ts';
import { vocalSendMix } from './autotuneSnap.ts';

export type DoublerParams = {
  mix: number;
  delayMs: number;
  width: number;
};

/** Haas doubler: dry + short delayed, panned copy mixed back to mono bus. */
export class VocalDoubler extends Tone.ToneAudioNode {
  readonly name = 'VocalDoubler';
  readonly input = new Tone.Gain(1);
  readonly output = new Tone.Gain(1);
  private readonly dry = new Tone.Gain(1);
  private readonly wet = new Tone.Gain(1);
  private readonly delay = new Tone.Delay(0.02, 0.05);
  private readonly pan = new Tone.Panner(0);
  private readonly sum = new Tone.Gain(1);

  constructor(params: DoublerParams) {
    super();
    this.applyParams(params);
    this.input.connect(this.dry);
    this.input.connect(this.delay);
    this.dry.connect(this.sum);
    this.delay.connect(this.pan);
    this.pan.connect(this.wet);
    this.wet.connect(this.sum);
    this.sum.connect(this.output);
  }

  updateParam(key: string, value: number, rampSec = 0.05): void {
    const now = this.context.currentTime;
    if (key === 'mix') {
      const { dry, wet } = vocalSendMix(percentToUnit(value));
      this.dry.gain.setTargetAtTime(dry, now, rampSec);
      this.wet.gain.setTargetAtTime(wet, now, rampSec);
    } else if (key === 'delayMs') {
      this.delay.delayTime.setTargetAtTime(value / 1000, now, rampSec);
    } else if (key === 'width') {
      const pan = (percentToUnit(value) - 0.5) * 2;
      this.pan.pan.setTargetAtTime(pan, now, rampSec);
    }
  }

  private applyParams(params: DoublerParams): void {
    const { dry, wet } = vocalSendMix(percentToUnit(params.mix));
    this.dry.gain.value = dry;
    this.wet.gain.value = wet;
    this.delay.delayTime.value = params.delayMs / 1000;
    this.pan.pan.value = (percentToUnit(params.width) - 0.5) * 2;
  }

  dispose(): this {
    this.dry.dispose();
    this.wet.dispose();
    this.delay.dispose();
    this.pan.dispose();
    this.sum.dispose();
    this.input.dispose();
    this.output.dispose();
    return super.dispose();
  }
}
