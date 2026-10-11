import * as Tone from 'tone';
import type { BaseContext } from 'tone/build/esm/core/context/BaseContext';

const moduleLoads = new Map<string, Promise<void>>();

/** Tone's context uses standardized-audio-context wrappers — not `instanceof AudioContext`. */
function audioContextWithWorklet(context: BaseContext): BaseAudioContext | null {
  const raw = context.rawContext;
  if (!raw.audioWorklet) {
    return null;
  }
  return raw;
}

/**
 * Load an AudioWorklet module on Tone's underlying AudioContext.
 * Tone's addAudioWorkletModule only keeps the first URL — we call addModule per file.
 */
export function preloadAudioWorkletModule(url: string): Promise<void> {
  const existing = moduleLoads.get(url);
  if (existing) {
    return existing;
  }

  const load = (async () => {
    const audio = audioContextWithWorklet(Tone.getContext());
    if (!audio) {
      throw new Error('AudioWorklet is not available (use https or localhost)');
    }
    try {
      await audio.audioWorklet.addModule(url);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('already been registered')) {
        throw error;
      }
    }
  })();

  moduleLoads.set(url, load);
  return load;
}
