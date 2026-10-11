import * as Tone from 'tone';
import { preloadAudioWorkletModule } from './audioWorkletModule';

const PROCESSOR_NAME = 'vocal-studio-noise-gate';
const FLOOR_DB = -80;
const MOUNT_RETRIES = 12;

const WORKLET_MODULE_URL = '/noiseGateProcessor.worklet.js';

let moduleLoad: Promise<void> | null = null;
const pendingMounts = new Set<NoiseGate>();

function workletAlreadyRegistered(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('already been registered');
}

/** Register the gate processor on Tone's audio context (safe to call multiple times). */
export function preloadNoiseGateWorklet(): Promise<void> {
  if (moduleLoad) {
    return moduleLoad;
  }

  moduleLoad = preloadAudioWorkletModule(WORKLET_MODULE_URL)
    .then(() => {
      for (const gate of pendingMounts) {
        gate.remount();
      }
    })
    .catch((error: unknown) => {
      moduleLoad = null;
      if (workletAlreadyRegistered(error)) {
        moduleLoad = Promise.resolve();
        return;
      }
      throw error;
    });

  return moduleLoad;
}

export type NoiseGateParams = {
  thresholdDb: number;
  attackMs: number;
  releaseMs: number;
};

function floorLinear(): number {
  return Math.pow(10, FLOOR_DB / 20);
}

/** Downward noise gate: attenuates when level is below threshold. */
export class NoiseGate extends Tone.ToneAudioNode {
  readonly name = 'NoiseGate';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;
  private worklet: AudioWorkletNode | null = null;
  private live: NoiseGateParams;
  private bypassed = false;
  private mounting = false;

  constructor(params: NoiseGateParams) {
    super();
    this.live = { ...params };
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    pendingMounts.add(this);
    void this.mountWorklet();
  }

  /** Retry worklet mount after audio context / module is ready. */
  remount(): void {
    if (!this.worklet && !this.mounting) {
      void this.mountWorklet();
    }
  }

  setThresholdDb(db: number, rampSec = 0.05): void {
    this.live.thresholdDb = db;
    this.worklet?.parameters
      .get('threshold')
      ?.setTargetAtTime(db, this.context.currentTime, rampSec);
  }

  setAttackMs(ms: number, rampSec = 0.05): void {
    this.live.attackMs = ms;
    this.worklet?.parameters
      .get('attack')
      ?.setTargetAtTime(ms / 1000, this.context.currentTime, rampSec);
  }

  setReleaseMs(ms: number, rampSec = 0.05): void {
    this.live.releaseMs = ms;
    this.worklet?.parameters
      .get('release')
      ?.setTargetAtTime(ms / 1000, this.context.currentTime, rampSec);
  }

  private connectBypass(): void {
    if (this.bypassed || this.disposed) {
      return;
    }
    this.input.connect(this.output);
    this.bypassed = true;
  }

  private async mountWorklet(): Promise<void> {
    if (this.mounting || this.worklet || this.disposed) {
      return;
    }
    this.mounting = true;

    try {
      for (let attempt = 0; attempt < MOUNT_RETRIES; attempt++) {
        if (this.disposed) {
          return;
        }
        try {
          await Tone.start();
          await this.context.resume();
          await preloadNoiseGateWorklet();
          if (this.disposed) {
            return;
          }

          const worklet = this.context.createAudioWorkletNode(PROCESSOR_NAME);
          this.applyLiveParamsTo(worklet);

          this.input.disconnect();
          this.worklet?.disconnect();
          this.input.connect(worklet);
          worklet.connect(this.output.input);

          this.worklet = worklet;
          this.bypassed = false;
          pendingMounts.delete(this);
          return;
        } catch (error) {
          if (attempt === MOUNT_RETRIES - 1) {
            console.error('NoiseGate: worklet mount failed', error);
          }
          await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        }
      }

      console.warn('NoiseGate: worklet failed to load; passing audio unprocessed');
      this.connectBypass();
      pendingMounts.delete(this);
    } finally {
      this.mounting = false;
    }
  }

  private applyLiveParamsTo(worklet: AudioWorkletNode): void {
    worklet.parameters.get('threshold')!.value = this.live.thresholdDb;
    worklet.parameters.get('attack')!.value = this.live.attackMs / 1000;
    worklet.parameters.get('release')!.value = this.live.releaseMs / 1000;
    worklet.parameters.get('floor')!.value = floorLinear();
  }

  dispose(): this {
    pendingMounts.delete(this);
    this.input.disconnect();
    this.worklet?.disconnect();
    this.worklet = null;
    this.input.dispose();
    this.output.dispose();
    return super.dispose();
  }
}
