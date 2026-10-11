import * as Tone from 'tone';
import { preloadAudioWorkletModule } from './audioWorkletModule';

const PROCESSOR_NAME = 'vocal-studio-rider';
const WORKLET_URL = '/riderProcessor.worklet.js';

let moduleLoad: Promise<void> | null = null;

export function preloadRiderWorklet(): Promise<void> {
  if (!moduleLoad) {
    moduleLoad = preloadAudioWorkletModule(WORKLET_URL).catch((error) => {
      moduleLoad = null;
      throw error;
    });
  }
  return moduleLoad;
}

export type RiderParams = {
  targetDb: number;
  speed: number;
  maxGainDb: number;
};

export class VocalRider extends Tone.ToneAudioNode {
  readonly name = 'VocalRider';
  readonly input = new Tone.Gain(1);
  readonly output = new Tone.Gain(1);
  private worklet: AudioWorkletNode | null = null;
  private live: RiderParams;

  constructor(params: RiderParams) {
    super();
    this.live = { ...params };
    void this.mount();
  }

  updateParam(key: string, value: number, rampSec = 0.05): void {
    if (key === 'targetDb') {
      this.live.targetDb = value;
      this.worklet?.parameters
        .get('targetDb')
        ?.setTargetAtTime(value, this.context.currentTime, rampSec);
    } else if (key === 'speed') {
      this.live.speed = value;
      this.worklet?.parameters
        .get('speed')
        ?.setTargetAtTime(value, this.context.currentTime, rampSec);
    } else if (key === 'maxGainDb') {
      this.live.maxGainDb = value;
      this.worklet?.parameters
        .get('maxGainDb')
        ?.setTargetAtTime(value, this.context.currentTime, rampSec);
    }
  }

  private async mount(): Promise<void> {
    try {
      await Tone.start();
      await preloadRiderWorklet();
      const worklet = this.context.createAudioWorkletNode(PROCESSOR_NAME);
      worklet.parameters.get('targetDb')!.value = this.live.targetDb;
      worklet.parameters.get('speed')!.value = this.live.speed;
      worklet.parameters.get('maxGainDb')!.value = this.live.maxGainDb;
      this.input.connect(worklet);
      worklet.connect(this.output.input);
      this.worklet = worklet;
    } catch (error) {
      console.warn('VocalRider: worklet unavailable, bypassing', error);
      this.input.connect(this.output);
    }
  }

  dispose(): this {
    this.worklet?.disconnect();
    this.input.dispose();
    this.output.dispose();
    return super.dispose();
  }
}
