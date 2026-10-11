import * as Tone from 'tone';
import { preloadNoiseGateWorklet } from '../audio/noiseGate';
import { VocalChain } from '../chain/VocalChain';
import type {
  Engine as EngineContract,
  Preset,
  TrackId,
  TrimRange,
  VocalInputNode,
} from '../../../../shared/types';

const FADE_SEC = 0.03;
const VOCAL_CLIP_ID = 'vocal';
const BEAT_CLIP_ID = 'beat';

type ClipRoute = 'vocal' | 'direct';

type TimelineClip = {
  player: Tone.Player;
  route: ClipRoute;
  trim: TrimRange;
  trimDuration: number;
  timelineStartSec: number;
};

type PlaybackEngineOptions = {
  onEnded?: () => void;
};

export class PlaybackEngine implements EngineContract {
  private readonly vocalPlayer: Tone.Player;
  private readonly chain: VocalChain;
  private readonly dryGain: Tone.Gain;
  private readonly wetGain: Tone.Gain;
  private readonly directGain: Tone.Gain;
  private readonly limiter: Tone.Limiter;
  private readonly onEnded?: () => void;
  private readonly clips = new Map<string, TimelineClip>();
  private endEvent: number | null = null;
  private contextReady = false;
  private bypassed = false;
  private presetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: PlaybackEngineOptions = {}) {
    this.onEnded = options.onEnded;
    this.vocalPlayer = new Tone.Player();
    this.chain = new VocalChain();
    this.dryGain = new Tone.Gain(0);
    this.wetGain = new Tone.Gain(1);
    this.directGain = new Tone.Gain(1);
    this.limiter = new Tone.Limiter(-1).toDestination();
    this.vocalPlayer.connect(this.dryGain);
    this.vocalPlayer.connect(this.chain.input);
    this.dryGain.connect(this.limiter);
    this.chain.output.connect(this.wetGain);
    this.wetGain.connect(this.limiter);
    this.directGain.connect(this.limiter);
    this.clips.set(VOCAL_CLIP_ID, {
      player: this.vocalPlayer,
      route: 'vocal',
      trim: { start: 0, end: 0 },
      trimDuration: 0,
      timelineStartSec: 0,
    });
  }

  async loadBeat(_file: File): Promise<void> {
    return;
  }

  setVocal(buffer: AudioBuffer, trim: TrimRange, startSec = 0): void {
    this.stopTransport();
    this.setClipBuffer(VOCAL_CLIP_ID, buffer, trim, startSec, 'vocal');
  }

  clearVocal(): void {
    this.stopTransport();
    this.clearClip(VOCAL_CLIP_ID);
  }

  setBeatClip(buffer: AudioBuffer, trim: TrimRange, startSec = 0): void {
    this.stopTransport();
    this.setClipBuffer(BEAT_CLIP_ID, buffer, trim, startSec, 'direct');
  }

  clearBeatClip(): void {
    this.stopTransport();
    this.clearClip(BEAT_CLIP_ID);
  }

  setAuxClip(id: string, buffer: AudioBuffer, trim: TrimRange, startSec = 0): void {
    this.stopTransport();
    this.setClipBuffer(id, buffer, trim, startSec, 'direct');
  }

  clearAuxClip(id: string): void {
    this.stopTransport();
    this.clearClip(id);
  }

  play(fromTimelineSec = 0): void {
    void this.startPlayback(fromTimelineSec);
  }

  stop(): void {
    this.stopTransport();
    Tone.getTransport().seconds = 0;
  }

  seek(sec: number): void {
    const position = Math.max(0, sec);
    const transport = Tone.getTransport();
    if (transport.state === 'started') {
      void this.startPlayback(position);
      return;
    }
    transport.stop();
    transport.seconds = position;
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

  setPreset(preset: Preset | null, options?: { pitchHz?: number }): void {
    const now = Tone.now();
    this.wetGain.gain.cancelScheduledValues(now);
    this.wetGain.gain.rampTo(0, FADE_SEC);
    if (this.presetTimer != null) {
      clearTimeout(this.presetTimer);
    }
    this.presetTimer = setTimeout(() => {
      this.presetTimer = null;
      this.chain.setChain(preset ?? { name: '', explanation: '', chain: [] }, {
        pitchHz: options?.pitchHz,
      });
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
    return this.vocalPlayer;
  }

  getSeconds(): number {
    return Tone.getTransport().seconds;
  }

  private setClipBuffer(
    id: string,
    buffer: AudioBuffer,
    trim: TrimRange,
    startSec: number,
    route: ClipRoute,
  ): void {
    let clip = this.clips.get(id);
    if (!clip) {
      const player = new Tone.Player();
      player.connect(this.directGain);
      clip = {
        player,
        route,
        trim: { start: 0, end: 0 },
        trimDuration: 0,
        timelineStartSec: 0,
      };
      this.clips.set(id, clip);
    }
    clip.player.unsync();
    clip.player.buffer.set(buffer);
    clip.route = route;
    clip.trim = trim;
    clip.trimDuration = Math.max(0, trim.end - trim.start);
    clip.timelineStartSec = Math.max(0, startSec);
  }

  private clearClip(id: string): void {
    if (id === VOCAL_CLIP_ID) {
      const clip = this.clips.get(VOCAL_CLIP_ID);
      if (!clip) {
        return;
      }
      clip.player.unsync();
      clip.trim = { start: 0, end: 0 };
      clip.trimDuration = 0;
      clip.timelineStartSec = 0;
      return;
    }
    const clip = this.clips.get(id);
    if (!clip) {
      return;
    }
    clip.player.unsync();
    clip.player.dispose();
    this.clips.delete(id);
  }

  private activeClips(): TimelineClip[] {
    return [...this.clips.values()].filter(
      (clip) => clip.player.loaded && clip.trimDuration > 0,
    );
  }

  private scheduleClipAt(clip: TimelineClip, transportSec: number): void {
    const trim = clip.trim;
    const clipStart = clip.timelineStartSec;
    const clipEnd = clipStart + clip.trimDuration;
    const duration = clip.trimDuration;

    clip.player.unsync();

    if (transportSec >= clipEnd) {
      return;
    }
    if (transportSec <= clipStart) {
      clip.player.sync().start(clipStart, trim.start, duration);
      return;
    }
    const intoClip = transportSec - clipStart;
    clip.player.sync().start(transportSec, trim.start + intoClip, duration - intoClip);
  }

  private clipEndSec(clip: TimelineClip): number {
    return clip.timelineStartSec + clip.trimDuration;
  }

  private async startPlayback(fromTimelineSec: number): Promise<void> {
    const clips = this.activeClips();
    if (clips.length === 0) {
      return;
    }
    if (!this.contextReady) {
      await Tone.start();
      await preloadNoiseGateWorklet();
      this.contextReady = true;
    }
    this.stopTransport();
    const start = Math.max(0, fromTimelineSec);
    for (const clip of clips) {
      this.scheduleClipAt(clip, start);
    }
    const transport = Tone.getTransport();
    transport.seconds = start;
    const endAt = Math.max(start + 0.001, ...clips.map((clip) => this.clipEndSec(clip)));
    this.endEvent = transport.scheduleOnce(() => {
      this.stop();
      this.onEnded?.();
    }, endAt);
    transport.start();
  }

  private stopTransport(): void {
    const transport = Tone.getTransport();
    if (this.endEvent != null) {
      transport.clear(this.endEvent);
      this.endEvent = null;
    }
    for (const clip of this.clips.values()) {
      clip.player.unsync();
    }
    transport.stop();
  }
}
