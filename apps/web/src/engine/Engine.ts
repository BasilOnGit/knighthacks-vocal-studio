import * as Tone from 'tone';
import { VocalChain } from '../chain/VocalChain';
import type {
  Engine as EngineContract,
  Preset,
  TrackId,
  TrimRange,
  VocalInputNode,
} from '../../../../shared/types';

const FADE_SEC = 0.03;

type PlaybackEngineOptions = {
  onEnded?: () => void;
};

export class PlaybackEngine implements EngineContract {
  private readonly player: Tone.Player;
  private readonly chain: VocalChain;
  private readonly dryGain: Tone.Gain;
  private readonly wetGain: Tone.Gain;
  private readonly limiter: Tone.Limiter;
  private readonly onEnded?: () => void;
  private trimDuration = 0;
  private endEvent: number | null = null;
  private contextReady = false;
  private bypassed = false;
  private presetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: PlaybackEngineOptions = {}) {
    this.onEnded = options.onEnded;
    this.player = new Tone.Player();
    this.chain = new VocalChain();
    this.dryGain = new Tone.Gain(0);
    this.wetGain = new Tone.Gain(1);
    this.limiter = new Tone.Limiter(-1).toDestination();
    this.player.connect(this.dryGain);
    this.player.connect(this.chain.input);
    this.dryGain.connect(this.limiter);
    this.chain.output.connect(this.wetGain);
    this.wetGain.connect(this.limiter);
  }

  async loadBeat(_file: File): Promise<void> {
    return;
  }

  setVocal(buffer: AudioBuffer, trim: TrimRange, _startSec?: number): void {
    this.halt();
    this.player.unsync();
    this.player.buffer.set(buffer);
    const duration = Math.max(0, trim.end - trim.start);
    this.trimDuration = duration;
    this.player.sync().start(0, trim.start, duration);
  }

  play(): void {
    void this.startPlayback();
  }

  stop(): void {
    this.halt();
  }

  seek(_sec: number): void {
    return;
  }

  setBypass(dry: boolean): void {
    this.bypassed = dry;
    const now = Tone.now();
    this.dryGain.gain.cancelScheduledValues(now);
    this.wetGain.gain.cancelScheduledValues(now);
    this.dryGain.gain.setValueAtTime(dry ? 1 : 0, now);
    this.wetGain.gain.setValueAtTime(dry ? 0 : 1, now);
  }

  updateParam(id: string, key: string, value: number): void {
    this.chain.updateParam(id, key, value);
  }

  setEnabled(id: string, on: boolean): void {
    this.chain.setEnabled(id, on);
  }

  setPreset(preset: Preset | null): void {
    const now = Tone.now();
    this.wetGain.gain.cancelScheduledValues(now);
    this.wetGain.gain.rampTo(0, FADE_SEC);
    if (this.presetTimer != null) {
      clearTimeout(this.presetTimer);
    }
    this.presetTimer = setTimeout(() => {
      this.presetTimer = null;
      this.chain.setChain(preset ?? { name: '', explanation: '', chain: [] });
      const at = Tone.now();
      this.wetGain.gain.cancelScheduledValues(at);
      this.wetGain.gain.setValueAtTime(0, at);
      this.wetGain.gain.rampTo(this.bypassed ? 0 : 1, FADE_SEC);
    }, FADE_SEC * 1000);
  }

  setTrackGain(_track: TrackId, _db: number): void {
    return;
  }

  setMute(_track: TrackId, _muted: boolean): void {
    return;
  }

  setVocalOffsetMs(_ms: number): void {
    return;
  }

  getVocalInput(): VocalInputNode {
    return this.player;
  }

  getSeconds(): number {
    return Tone.getTransport().seconds;
  }

  private async startPlayback(): Promise<void> {
    if (!this.player.loaded || this.trimDuration <= 0) {
      return;
    }
    if (!this.contextReady) {
      await Tone.start();
      this.contextReady = true;
    }
    this.halt();
    const transport = Tone.getTransport();
    this.endEvent = transport.scheduleOnce(() => {
      this.halt();
      this.onEnded?.();
    }, this.trimDuration);
    transport.start();
  }

  private halt(): void {
    const transport = Tone.getTransport();
    if (this.endEvent != null) {
      transport.clear(this.endEvent);
      this.endEvent = null;
    }
    transport.stop();
    transport.seconds = 0;
  }
}
