import * as Tone from 'tone';
import { preloadFormantAutotuneWorklet } from '../audio/formantAutotune';
import { preloadNoiseGateWorklet } from '../audio/noiseGate';
import { VocalChain } from '../chain/VocalChain';
import type { Snippet } from '../session/snippets';
import { clipTimelineStartSec, clipTimelineEndSec } from '../session/clip';
import type { Preset } from '../../../../shared/types';
import type { Mix } from '../ui/TrackMixer';

type ClipSlot = {
  clip: Snippet;
  player: Tone.Player;
  gain: Tone.Gain;
  pan: Tone.Panner;
};

type TrackSlot = {
  trackId: string;
  bus: Tone.Gain;
  chain: VocalChain;
  dry: Tone.Gain;
  wet: Tone.Gain;
  dryComp: Tone.Delay;
  wetComp: Tone.Delay;
  trackGain: Tone.Gain;
  spectrumAnalyser: Tone.Analyser;
  spectrumSink: Tone.Gain;
  chainKey: string;
  preset: Preset;
  autotuneSourceKey: string;
  autotuneClipId: string;
};

const AUTOTUNE_TICK_SEC = 0.02;
/** Upper bound for latency compensation (the autotune worklet adds ~0.09 s). */
const MAX_COMPENSATION_SEC = 0.5;
const SEEK_FADE_IN_SEC = 0.008;

export class SessionEngine {
  /** @deprecated Use clipSlots — kept for tests. */
  slots = new Map<string, ClipSlot & { trackGain?: Tone.Gain; gain: Tone.Gain; pan: Tone.Panner; dryComp?: Tone.Delay; wetComp?: Tone.Delay; chain?: VocalChain }>();
  clipSlots = new Map<string, ClipSlot>();
  trackSlots = new Map<string, TrackSlot>();
  private master: Tone.Gain;
  private limiter: Tone.Limiter;
  private endEvent: number | null = null;
  private autotuneEvent: number | null = null;
  private dry = false;
  private revision = 0;
  private compensationSec = 0;
  private playFrom = 0;
  private clips: Snippet[] = [];
  private workletsReady = false;
  private transportActive = false;

  constructor(private onEnded: () => void) {
    this.master = new Tone.Gain(1);
    this.limiter = new Tone.Limiter(-1).toDestination();
    this.master.connect(this.limiter);
  }

  sync(clips: Snippet[], trackPresets: Record<string, Preset>): void {
    this.clips = clips;
    const clipIds = new Set(clips.map((c) => c.id));
    for (const [id, slot] of this.clipSlots) {
      if (!clipIds.has(id)) {
        this.disposeClipSlot(slot);
        this.clipSlots.delete(id);
        this.slots.delete(id);
      }
    }

    const trackIds = new Set([
      ...Object.keys(trackPresets),
      ...clips.map((c) => c.trackId),
    ]);

    for (const [trackId, track] of this.trackSlots) {
      if (!trackIds.has(trackId)) {
        this.disposeTrackSlot(track);
        this.trackSlots.delete(trackId);
      }
    }

    for (const trackId of trackIds) {
      this.ensureTrackSlot(trackId, trackPresets[trackId] ?? { name: '', explanation: '', chain: [] });
    }

    for (const clip of clips) {
      let slot = this.clipSlots.get(clip.id);
      const track = this.trackSlots.get(clip.trackId);
      if (!track) continue;

      if (!slot) {
        const player = new Tone.Player();
        const gain = new Tone.Gain(1);
        const pan = new Tone.Panner(clip.pan);
        player.connect(gain);
        gain.connect(pan);
        pan.connect(track.bus);
        player.buffer.set(clip.buffer);
        slot = { clip, player, gain, pan };
        this.clipSlots.set(clip.id, slot);
        this.slots.set(clip.id, {
          ...slot,
          trackGain: track.trackGain,
          dryComp: track.dryComp,
          wetComp: track.wetComp,
          chain: track.chain,
        });
      }

      slot.pan.pan.rampTo(clip.pan, 0.03);
      slot.gain.gain.rampTo(clip.muted ? 0 : Tone.dbToGain(clip.volumeDb), 0.03);
      slot.clip = clip;
      this.slots.set(clip.id, {
        ...slot,
        trackGain: track.trackGain,
        dryComp: track.dryComp,
        wetComp: track.wetComp,
        chain: track.chain,
      });
    }

    for (const track of this.trackSlots.values()) {
      const preset = trackPresets[track.trackId] ?? track.preset;
      const key = preset.chain.map((n) => `${n.id}:${n.type}`).join('|');
      if (track.chainKey !== key) {
        track.chain.setChain(preset);
        track.chainKey = key;
        track.autotuneSourceKey = '';
        track.autotuneClipId = '';
      } else if (track.preset !== preset) {
        for (const node of preset.chain) {
          const previous = track.preset.chain.find((n) => n.id === node.id);
          if (previous?.enabled !== node.enabled) {
            track.chain.setEnabled(node.id, node.enabled);
          }
          for (const [paramKey, value] of Object.entries(node.params)) {
            if (previous?.params[paramKey] !== value) {
              track.chain.updateParam(node.id, paramKey, value);
            }
          }
        }
      }
      track.preset = preset;
    }

    this.updateCompensation();
    this.refreshAutotuneSources();
  }

  private ensureTrackSlot(trackId: string, preset: Preset): TrackSlot {
    let track = this.trackSlots.get(trackId);
    if (track) return track;

    const bus = new Tone.Gain(1);
    const chain = new VocalChain();
    const dry = new Tone.Gain(this.dry ? 1 : 0);
    const wet = new Tone.Gain(this.dry ? 0 : 1);
    const dryComp = new Tone.Delay(0, MAX_COMPENSATION_SEC);
    const wetComp = new Tone.Delay(0, MAX_COMPENSATION_SEC);
    const trackGain = new Tone.Gain(1);
    const spectrumAnalyser = new Tone.Analyser('fft', 2048);
    const spectrumSink = new Tone.Gain(0);
    bus.connect(spectrumAnalyser);
    spectrumAnalyser.connect(spectrumSink);
    spectrumSink.connect(this.master);

    bus.connect(dry);
    bus.connect(chain.input);
    chain.output.connect(wet);
    dry.connect(dryComp);
    dryComp.connect(trackGain);
    wet.connect(wetComp);
    wetComp.connect(trackGain);
    trackGain.connect(this.master);

    track = {
      trackId,
      bus,
      chain,
      dry,
      wet,
      dryComp,
      wetComp,
      trackGain,
      spectrumAnalyser,
      spectrumSink,
      chainKey: '',
      preset,
      autotuneSourceKey: '',
      autotuneClipId: '',
    };
    chain.onLatencyChange(() => this.updateCompensation());
    this.trackSlots.set(trackId, track);
    return track;
  }

  private refreshAutotuneSources(): void {
    for (const track of this.trackSlots.values()) {
      const clip = this.pickAutotuneClip(track.trackId);
      if (!clip) {
        track.autotuneSourceKey = '';
        track.autotuneClipId = '';
        continue;
      }
      const autotuneKey = `${clip.id}:${clip.trim.start}:${clip.trim.end}:${clip.buffer.length}:${clip.buffer.sampleRate}`;
      if (track.autotuneSourceKey !== autotuneKey) {
        track.chain.setAutotuneSource(clip.buffer, clip.trim);
        track.autotuneSourceKey = autotuneKey;
        track.autotuneClipId = clip.id;
      }
    }
  }

  /** Pre-FX track bus spectrum (dB per FFT bin) for EQ UI. */
  getTrackSpectrumDb(trackId: string): Float32Array | null {
    const track = this.trackSlots.get(trackId);
    if (!track) {
      return null;
    }
    return track.spectrumAnalyser.getValue() as Float32Array;
  }

  getAudioSampleRate(): number {
    return Tone.getContext().sampleRate;
  }

  isTransportActive(): boolean {
    return this.transportActive;
  }

  private pickAutotuneClip(trackId: string): Snippet | null {
    const onTrack = this.clips.filter((c) => c.trackId === trackId);
    if (onTrack.length === 0) return null;
    const timelineSec = Tone.getTransport().seconds;
    const active = onTrack.find((clip) => {
      const start = clipTimelineStartSec(clip);
      const end = clipTimelineEndSec(clip);
      return timelineSec >= start && timelineSec < end;
    });
    return active ?? onTrack[0];
  }

  private updateCompensation(): void {
    if (this.dry) {
      this.compensationSec = 0;
      for (const track of this.trackSlots.values()) {
        track.dryComp.delayTime.value = 0;
        track.wetComp.delayTime.value = 0;
      }
      return;
    }
    let longest = 0;
    for (const track of this.trackSlots.values()) {
      longest = Math.max(longest, track.chain.latencySec);
    }
    longest = Math.min(MAX_COMPENSATION_SEC, longest);
    this.compensationSec = longest;
    for (const track of this.trackSlots.values()) {
      const own = Math.min(longest, track.chain.latencySec);
      track.dryComp.delayTime.value = longest;
      track.wetComp.delayTime.value = longest - own;
    }
  }

  setMixes(mixes: Record<string, Mix>, trackIds: string[]): void {
    const anySolo = trackIds.some((id) => mixes[id]?.solo);
    for (const track of this.trackSlots.values()) {
      const mix = mixes[track.trackId] ?? { db: 0, muted: false, solo: false };
      track.trackGain.gain.rampTo(
        mix.muted || (anySolo && !mix.solo) ? 0 : Tone.dbToGain(mix.db),
        0.03,
      );
    }
  }

  setMasterGain(db: number): void {
    this.master.gain.rampTo(Tone.dbToGain(db), 0.03);
  }

  setBypass(dry: boolean): void {
    this.dry = dry;
    for (const track of this.trackSlots.values()) {
      track.dry.gain.cancelScheduledValues(Tone.now());
      track.wet.gain.cancelScheduledValues(Tone.now());
      track.dry.gain.value = dry ? 1 : 0;
      track.wet.gain.value = dry ? 0 : 1;
    }
    this.updateCompensation();
  }

  getSeconds(): number {
    if (!this.transportActive) {
      return this.playFrom;
    }
    return Math.max(this.playFrom, Tone.getTransport().seconds - this.compensationSec);
  }

  private clearTransportEvents(): void {
    const transport = Tone.getTransport();
    if (this.endEvent !== null) {
      transport.clear(this.endEvent);
      this.endEvent = null;
    }
    if (this.autotuneEvent !== null) {
      transport.clear(this.autotuneEvent);
      this.autotuneEvent = null;
    }
  }

  /** Stop players and transport; keep `playFrom` for UI until the next schedule. */
  private haltTransport(): void {
    this.clearTransportEvents();
    for (const track of this.trackSlots.values()) {
      track.chain.resetAutotuneSmoothing();
    }
    for (const slot of this.clipSlots.values()) {
      slot.player.unsync();
      slot.player.stop();
    }
    const transport = Tone.getTransport();
    transport.stop();
    transport.seconds = 0;
    this.transportActive = false;
  }

  /** Pause for scrubbing (no FX tail reset). */
  interruptPlayback(): void {
    this.revision++;
    this.haltTransport();
  }

  stop(): void {
    this.revision++;
    this.haltTransport();
    this.playFrom = 0;
    for (const track of this.trackSlots.values()) {
      track.chain.resetEffectTails();
    }
  }

  private async ensureAudioReady(): Promise<void> {
    await Tone.start();
    if (!this.workletsReady) {
      await Promise.all([preloadNoiseGateWorklet(), preloadFormantAutotuneWorklet()]);
      this.workletsReady = true;
    }
  }

  /**
   * Synchronous reschedule from a timeline position (no await gap).
   * Returns false if there is no audible timeline left from `from`.
   */
  private scheduleTimeline(from: number): boolean {
    this.haltTransport();

    const transport = Tone.getTransport();
    const start = Math.max(0, from);
    let end = start;
    let scheduledAny = false;

    transport.stop();
    transport.seconds = start;
    this.playFrom = start;

    for (const slot of this.clipSlots.values()) {
      const clip = slot.clip;
      const clipStart = clipTimelineStartSec(clip);
      const clipEnd = clipTimelineEndSec(clip);
      if (clipEnd <= start) continue;

      const elapsed = Math.max(0, start - clipStart);
      const trimDuration = clip.trim.end - clip.trim.start;
      const fadeIn = Math.min(clip.fadeIn, trimDuration / 2);
      const fadeOut = Math.min(clip.fadeOut, trimDuration / 2);
      const envelope = slot.gain.gain;
      const amplitude = clip.muted ? 0 : Tone.dbToGain(clip.volumeDb);
      envelope.cancelScheduledValues(Tone.now());
      envelope.value = amplitude;

      const playAt = Math.max(start, clipStart);
      const offset = clip.trim.start + elapsed;
      const remaining = clipEnd - playAt;
      const atClipStart = elapsed <= 1e-9;

      slot.player.fadeIn = atClipStart ? fadeIn : SEEK_FADE_IN_SEC;
      slot.player.fadeOut = Math.min(fadeOut, remaining);
      slot.player.sync().start(playAt, offset, remaining);
      scheduledAny = true;
      end = Math.max(end, clipEnd);
    }

    if (!scheduledAny || end <= start) {
      this.playFrom = start;
      return false;
    }

    this.updateCompensation();
    this.refreshAutotuneSources();
    this.tickAutotune();
    this.autotuneEvent = transport.scheduleRepeat(() => {
      this.tickAutotune();
    }, AUTOTUNE_TICK_SEC);
    this.endEvent = transport.scheduleOnce(() => {
      this.stop();
      this.onEnded();
    }, end + 0.05 + this.compensationSec);
    transport.start();
    this.transportActive = true;
    return true;
  }

  /**
   * Jump playhead while transport may already be running. Synchronous — no worklet await.
   */
  seekTo(from: number): boolean {
    if (!this.workletsReady) {
      return false;
    }
    this.revision++;
    const revision = this.revision;
    const ok = this.scheduleTimeline(from);
    if (revision !== this.revision) {
      return false;
    }
    return ok;
  }

  private tickAutotune(): void {
    const timelineSec = this.getSeconds();
    for (const track of this.trackSlots.values()) {
      const clip = this.clips.find((c) => {
        if (c.trackId !== track.trackId) return false;
        const clipStart = clipTimelineStartSec(c);
        const clipEnd = clipTimelineEndSec(c);
        return timelineSec >= clipStart && timelineSec < clipEnd;
      });
      if (!clip) continue;
      const autotuneKey = `${clip.id}:${clip.trim.start}:${clip.trim.end}:${clip.buffer.length}:${clip.buffer.sampleRate}`;
      if (track.autotuneSourceKey !== autotuneKey) {
        track.chain.setAutotuneSource(clip.buffer, clip.trim);
        track.autotuneSourceKey = autotuneKey;
        track.autotuneClipId = clip.id;
      }
      const sourceTime = clip.trim.start + (timelineSec - clipTimelineStartSec(clip));
      track.chain.tickAutotune(sourceTime);
    }
  }

  async play(from: number): Promise<boolean> {
    this.revision++;
    const revision = this.revision;
    await this.ensureAudioReady();
    if (revision !== this.revision) {
      return false;
    }
    return this.scheduleTimeline(from);
  }

  private disposeClipSlot(slot: ClipSlot): void {
    slot.player.unsync();
    slot.player.dispose();
    slot.gain.dispose();
    slot.pan.dispose();
  }

  private disposeTrackSlot(track: TrackSlot): void {
    track.chain.onLatencyChange(null);
    track.chain.dispose();
    track.bus.dispose();
    track.dry.dispose();
    track.wet.dispose();
    track.dryComp.dispose();
    track.wetComp.dispose();
    track.trackGain.dispose();
    track.spectrumAnalyser.dispose();
    track.spectrumSink.dispose();
  }

  dispose(): void {
    this.stop();
    for (const slot of this.clipSlots.values()) this.disposeClipSlot(slot);
    for (const track of this.trackSlots.values()) this.disposeTrackSlot(track);
    this.clipSlots.clear();
    this.trackSlots.clear();
    this.slots.clear();
    this.master.dispose();
    this.limiter.dispose();
  }
}
