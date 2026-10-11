import { validatePreset } from '../../../../shared/validate';
import type { Preset } from '../../../../shared/types';
import type { Mix } from '../ui/TrackMixer';
import type { SessionTrack, Snippet } from './snippets';
import { emptyTrackPreset, newSessionTrack } from './snippets';
import type { AiThreadState } from './aiThread';
import { parseAiThreadState } from './aiThread';

const SESSION_KEY = 'vocal-studio.session.v1';
const BUFFER_DB = 'vocal-studio-audio';
const BUFFER_STORE = 'buffers';

export type PersistedClip = {
  id: string;
  trackId: string;
  name: string;
  volumeDb: number;
  pan: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  trim: { start: number; end: number };
  clipStartSec: number;
  duration: number;
  sampleRate: number;
  numberOfChannels: number;
  fileName: string;
};

export type PersistedSession = {
  tracks: SessionTrack[];
  clips: PersistedClip[];
  mixes: Record<string, Mix>;
  trackSources: Record<string, string>;
  aiThreads?: AiThreadState;
};

function openBufferDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BUFFER_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BUFFER_STORE)) {
        db.createObjectStore(BUFFER_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB failed'));
  });
}

async function putBuffer(id: string, buffer: AudioBuffer): Promise<void> {
  const channels: Float32Array[] = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i).slice());
  }
  const payload = {
    sampleRate: buffer.sampleRate,
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    channels,
  };
  const db = await openBufferDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BUFFER_STORE, 'readwrite');
    tx.objectStore(BUFFER_STORE).put(payload, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('put buffer failed'));
  });
  db.close();
}

async function getBuffer(id: string): Promise<AudioBuffer | null> {
  const db = await openBufferDb();
  const payload = await new Promise<{
    sampleRate: number;
    length: number;
    numberOfChannels: number;
    channels: Float32Array[];
  } | undefined>((resolve, reject) => {
    const tx = db.transaction(BUFFER_STORE, 'readonly');
    const req = tx.objectStore(BUFFER_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('get buffer failed'));
  });
  db.close();
  if (!payload) return null;
  const ctx = new AudioContext();
  const buffer = ctx.createBuffer(
    payload.numberOfChannels,
    payload.length,
    payload.sampleRate,
  );
  for (let i = 0; i < payload.numberOfChannels; i++) {
    buffer.copyToChannel(new Float32Array(payload.channels[i]), i);
  }
  await ctx.close();
  return buffer;
}

export function clipToPersisted(clip: Snippet): PersistedClip {
  return {
    id: clip.id,
    trackId: clip.trackId,
    name: clip.name,
    volumeDb: clip.volumeDb,
    pan: clip.pan,
    muted: clip.muted,
    fadeIn: clip.fadeIn,
    fadeOut: clip.fadeOut,
    trim: { ...clip.trim },
    clipStartSec: clip.clipStartSec,
    duration: clip.buffer.duration,
    sampleRate: clip.buffer.sampleRate,
    numberOfChannels: clip.buffer.numberOfChannels,
    fileName: clip.fileName,
  };
}

export async function persistStudioSession(data: {
  tracks: SessionTrack[];
  clips: Snippet[];
  mixes: Record<string, Mix>;
  trackSources: Record<string, string>;
  aiThreads: AiThreadState;
}): Promise<void> {
  const payload: PersistedSession = {
    tracks: data.tracks.map((t) => ({
      ...t,
      preset: validatePreset(structuredClone(t.preset)),
    })),
    clips: data.clips.map(clipToPersisted),
    mixes: data.mixes,
    trackSources: data.trackSources,
    aiThreads: data.aiThreads,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  await Promise.all(data.clips.map((c) => putBuffer(c.id, c.buffer)));
}

export async function loadStudioSession(): Promise<{
  tracks: SessionTrack[];
  clips: Snippet[];
  mixes: Record<string, Mix>;
  trackSources: Record<string, string>;
  aiThreads: AiThreadState;
} | null> {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  let parsed: PersistedSession;
  try {
    parsed = JSON.parse(raw) as PersistedSession;
  } catch {
    return null;
  }
  if (!parsed.tracks?.length) return null;

  const tracks: SessionTrack[] = parsed.tracks.map((t) => ({
    id: t.id,
    name: t.name,
    preset: validatePreset(t.preset),
  }));

  const clips: Snippet[] = [];
  for (const meta of parsed.clips ?? []) {
    const buffer = await getBuffer(meta.id);
    if (!buffer) continue;
    clips.push({
      id: meta.id,
      trackId: meta.trackId,
      name: meta.name,
      volumeDb: meta.volumeDb,
      pan: meta.pan,
      muted: meta.muted,
      fadeIn: meta.fadeIn,
      fadeOut: meta.fadeOut,
      trim: meta.trim,
      clipStartSec: meta.clipStartSec,
      fileName: meta.fileName ?? meta.name,
      buffer,
    });
  }

  return {
    tracks,
    clips,
    mixes: parsed.mixes ?? {},
    trackSources: parsed.trackSources ?? {},
    aiThreads: parseAiThreadState(parsed.aiThreads),
  };
}

export function defaultStudioTracks(): SessionTrack[] {
  return [newSessionTrack('beat', 'Beat'), newSessionTrack('vocal', 'Vocal')];
}

/** Migrate legacy per-clip presets onto vocal track when loading old session shapes. */
export function mergeLegacyClipPresets(
  tracks: SessionTrack[],
  legacy: { trackId: string; preset?: Preset }[],
): SessionTrack[] {
  const vocal = tracks.find((t) => t.id === 'vocal');
  const legacyVocal = legacy.find((c) => c.trackId === 'vocal' && c.preset?.chain?.length);
  if (!vocal || !legacyVocal?.preset) return tracks;
  if (vocal.preset.chain.length > 0) return tracks;
  return tracks.map((t) =>
    t.id === 'vocal' ? { ...t, preset: validatePreset(legacyVocal.preset!) } : t,
  );
}

export { emptyTrackPreset };
