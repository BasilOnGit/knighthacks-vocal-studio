import * as Tone from 'tone';
import {
  AutotuneLiveCorrector,
  defaultAutotuneParams,
} from '../audio/autotuneLive';
import { FormantAutotune, preloadFormantAutotuneWorklet } from '../audio/formantAutotune';
import {
  createAutotuneMonitorDetector,
  preloadAutotuneMonitorWorklet,
} from '../audio/autotuneMonitor';

export type MonitorAutotuneOptions = {
  params: Record<string, number>;
};

export class InputMonitor {
  private mic: Tone.UserMedia | null = null;
  private analyser: Tone.Analyser | null = null;
  private monitorGain: Tone.Gain | null = null;
  private dryGain: Tone.Gain | null = null;
  private detectTap: Tone.Gain | null = null;
  private formant: FormantAutotune | null = null;
  private detectNode: AudioWorkletNode | null = null;
  private silentSink: Tone.Gain | null = null;
  private corrector = new AutotuneLiveCorrector(defaultAutotuneParams());
  private autotuneParams: Record<string, number> | null = null;
  private autotunePreview = false;
  private monitoring = false;
  private lastPitchTime: number | null = null;
  private generation = 0;
  private deviceId = '';

  async start(
    deviceId: string,
    monitoring: boolean,
    autotune?: MonitorAutotuneOptions | null,
  ): Promise<void> {
    this.stop();
    const generation = this.generation;
    this.deviceId = deviceId;
    this.monitoring = monitoring;
    this.autotuneParams = autotune?.params ?? null;
    this.autotunePreview = !!(monitoring && this.autotuneParams);

    await Tone.start();
    await Promise.all([preloadAutotuneMonitorWorklet(), preloadFormantAutotuneWorklet()]);
    if (generation !== this.generation) {
      return;
    }

    this.mic = new Tone.UserMedia();
    if (deviceId) {
      await this.mic.open(deviceId);
    } else {
      await this.mic.open();
    }
    if (generation !== this.generation) {
      return;
    }

    this.analyser = new Tone.Analyser('waveform', 1024);
    this.monitorGain = new Tone.Gain(monitoring ? 0.7 : 0).toDestination();
    this.mic.connect(this.analyser);

    if (this.autotunePreview && this.autotuneParams) {
      this.corrector.setParams(this.autotuneParams);
      this.corrector.reset();
      this.formant = new FormantAutotune({ quality: 'live' });
      this.formant.setMix(this.corrector.mix());
      this.formant.setPitchSemitones(0, 0);
      this.mic.connect(this.formant.input);
      this.formant.output.connect(this.monitorGain);

      this.detectTap = new Tone.Gain(1);
      this.mic.connect(this.detectTap);
      this.detectNode = createAutotuneMonitorDetector();
      this.detectTap.connect(this.detectNode);
      this.silentSink = new Tone.Gain(0).toDestination();
      this.detectNode.connect(this.silentSink.input);
      this.lastPitchTime = null;
      this.detectNode.port.onmessage = (
        event: MessageEvent<{ pitchHz: number; clarity: number; time: number }>,
      ) => {
        if (!this.formant || !this.autotunePreview) {
          return;
        }
        const data = event.data;
        // Use the audio clock: main-thread message timing jitters, the detector's doesn't.
        const dt = this.lastPitchTime === null ? 0.01 : data.time - this.lastPitchTime;
        this.lastPitchTime = data.time;
        this.formant.setPitchSemitones(this.corrector.step(data.pitchHz, data.clarity, dt));
        this.formant.setMix(this.corrector.mix());
      };
    } else {
      this.dryGain = new Tone.Gain(1);
      this.mic.connect(this.dryGain);
      this.dryGain.connect(this.monitorGain);
    }
  }

  setMonitoring(on: boolean): void {
    this.monitoring = on;
    this.autotunePreview = !!(on && this.autotuneParams);
    if (!this.monitorGain) {
      return;
    }
    this.monitorGain.gain.rampTo(on ? 0.7 : 0, 0.02);
    if (!on) {
      this.corrector.reset();
      this.formant?.setPitchSemitones(0, 0);
    }
  }

  async setAutotunePreview(on: boolean, params?: Record<string, number> | null): Promise<void> {
    if (params) {
      this.autotuneParams = params;
      this.corrector.setParams(params);
    }
    const wantPreview = !!(on && this.monitoring && this.autotuneParams);
    if (wantPreview === this.autotunePreview && this.mic) {
      return;
    }
    if (this.mic) {
      await this.start(this.deviceId, this.monitoring, wantPreview ? { params: this.autotuneParams! } : null);
    } else {
      this.autotunePreview = wantPreview;
    }
  }

  level(): number {
    if (!this.analyser) {
      return -60;
    }
    const samples = this.analyser.getValue() as Float32Array;
    let sum = 0;
    for (const sample of samples) {
      sum += sample * sample;
    }
    return Math.max(-60, 20 * Math.log10(Math.sqrt(sum / samples.length) || 0.000001));
  }

  stop(): void {
    this.generation++;
    if (this.detectNode) {
      this.detectNode.port.onmessage = null;
      this.detectNode.disconnect();
      this.detectNode = null;
    }
    this.mic?.close();
    this.mic?.dispose();
    this.mic = null;
    this.analyser?.dispose();
    this.analyser = null;
    this.monitorGain?.dispose();
    this.monitorGain = null;
    this.dryGain?.dispose();
    this.dryGain = null;
    this.detectTap?.dispose();
    this.detectTap = null;
    this.formant?.dispose();
    this.formant = null;
    this.silentSink?.dispose();
    this.silentSink = null;
    this.autotunePreview = false;
    this.monitoring = false;
    this.corrector.reset();
  }
}
