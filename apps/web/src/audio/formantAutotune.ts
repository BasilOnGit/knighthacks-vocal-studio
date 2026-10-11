import * as Tone from 'tone';
import { preloadAudioWorkletModule } from './audioWorkletModule';
import { loadRubberbandWasmBytes } from './rubberbandWasm';

const PROCESSOR_NAME = 'vocal-studio-formant-autotune';
const WORKLET_MODULE_URL = '/formantAutotuneProcessor.worklet.js';
const MOUNT_RETRIES = 12;
/** Worklet already smooths pitch/mix per render quantum; this only avoids zipper steps. */
const PITCH_PARAM_RAMP_SEC = 0.004;

/**
 * studio: best sound, ~90 ms latency (playback — the engine compensates for it).
 * live:   lower latency, ~45 ms (mic monitoring).
 */
export type AutotuneQuality = 'studio' | 'live';

export type FormantAutotuneOptions = {
  quality?: AutotuneQuality;
};

let moduleLoad: Promise<void> | null = null;
const pendingMounts = new Set<FormantAutotune>();

function workletAlreadyRegistered(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('already been registered');
}

export function preloadFormantAutotuneWorklet(): Promise<void> {
  if (moduleLoad) {
    return moduleLoad;
  }

  moduleLoad = Promise.all([
    preloadAudioWorkletModule(WORKLET_MODULE_URL),
    loadRubberbandWasmBytes(),
  ])
    .then(() => {
      for (const node of pendingMounts) {
        node.remount();
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

type WorkletMessage =
  | { type: 'ready'; latencySamples: number; latencySec: number }
  | { type: 'error'; message: string };

/** Formant-preserving pitch correction (Rubber Band in an AudioWorklet). */
export class FormantAutotune extends Tone.ToneAudioNode {
  readonly name = 'FormantAutotune';
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;
  private worklet: AudioWorkletNode | null = null;
  private mounting = false;
  private bypassed = false;
  private liveMix = 0;
  private livePitch = 0;
  private readonly quality: AutotuneQuality;
  private latency = 0;
  private readonly latencyListeners = new Set<(sec: number) => void>();

  constructor(options: FormantAutotuneOptions = {}) {
    super();
    this.quality = options.quality ?? 'studio';
    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    pendingMounts.add(this);
    void this.mountWorklet();
  }

  /**
   * Delay (seconds) this node adds between its input and output. Zero until the
   * worklet has measured itself, and zero when it fell back to a plain bypass.
   */
  get latencySec(): number {
    return this.latency;
  }

  /** Called whenever the measured latency changes. Returns an unsubscribe function. */
  onLatencyChange(listener: (sec: number) => void): () => void {
    this.latencyListeners.add(listener);
    return () => this.latencyListeners.delete(listener);
  }

  private setLatency(sec: number): void {
    if (sec === this.latency) {
      return;
    }
    this.latency = sec;
    for (const listener of this.latencyListeners) {
      listener(sec);
    }
  }

  remount(): void {
    if (!this.worklet && !this.mounting) {
      void this.mountWorklet();
    }
  }

  setMix(mix: number, rampSec = 0.05): void {
    this.liveMix = mix;
    this.worklet?.parameters
      .get('mix')
      ?.setTargetAtTime(mix, this.context.currentTime, rampSec);
  }

  setPitchSemitones(semitones: number, rampSec = PITCH_PARAM_RAMP_SEC): void {
    this.livePitch = semitones;
    this.worklet?.parameters
      .get('pitchSemitones')
      ?.setTargetAtTime(semitones, this.context.currentTime, rampSec);
  }

  private connectBypass(): void {
    if (this.bypassed || this.disposed) {
      return;
    }
    this.input.connect(this.output);
    this.bypassed = true;
    this.setLatency(0);
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
          await preloadFormantAutotuneWorklet();
          if (this.disposed) {
            return;
          }

          const wasmBinary = await loadRubberbandWasmBytes();
          const worklet = this.context.createAudioWorkletNode(PROCESSOR_NAME, {
            processorOptions: { wasmBinary, quality: this.quality },
          });
          worklet.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
            const message = event.data;
            if (message.type === 'ready') {
              this.setLatency(message.latencySec);
            } else if (message.type === 'error') {
              console.error('FormantAutotune:', message.message);
              // Worklet passes the dry signal through (undelayed) after an init error.
              this.setLatency(0);
            }
          };
          worklet.parameters.get('mix')!.value = this.liveMix;
          worklet.parameters.get('pitchSemitones')!.value = this.livePitch;

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
            console.error('FormantAutotune: worklet mount failed', error);
          }
          await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
        }
      }

      console.warn('FormantAutotune: falling back to bypass');
      this.connectBypass();
      pendingMounts.delete(this);
    } finally {
      this.mounting = false;
    }
  }

  dispose(): this {
    pendingMounts.delete(this);
    this.latencyListeners.clear();
    this.input.disconnect();
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.disconnect();
    }
    this.worklet = null;
    this.input.dispose();
    this.output.dispose();
    return super.dispose();
  }
}
