import * as Tone from 'tone';
import { preloadAudioWorkletModule } from './audioWorkletModule';

const PROCESSOR_NAME = 'vocal-studio-denoise';
const WORKLET_URL = '/denoiseProcessor.worklet.js';

let moduleLoad: Promise<void> | null = null;

export function preloadDenoiseWorklet(): Promise<void> {
  if (!moduleLoad) {
    moduleLoad = preloadAudioWorkletModule(WORKLET_URL).catch((error) => {
      moduleLoad = null;
      throw error;
    });
  }
  return moduleLoad;
}

export class VocalDenoise extends Tone.ToneAudioNode {
  readonly name = 'VocalDenoise';
  readonly input = new Tone.Gain(1);
  readonly output = new Tone.Gain(1);
  private worklet: AudioWorkletNode | null = null;

  constructor(amount = 70) {
    super();
    void this.mount(amount);
  }

  setAmount(percent: number, rampSec = 0.05): void {
    this.worklet?.parameters
      .get('amount')
      ?.setTargetAtTime(percent, this.context.currentTime, rampSec);
  }

  private async mount(amount: number): Promise<void> {
    try {
      await Tone.start();
      await preloadDenoiseWorklet();
      const worklet = this.context.createAudioWorkletNode(PROCESSOR_NAME);
      worklet.parameters.get('amount')!.value = amount;
      this.input.connect(worklet);
      worklet.connect(this.output.input);
      this.worklet = worklet;
    } catch (error) {
      console.warn('VocalDenoise: worklet unavailable, bypassing', error);
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
