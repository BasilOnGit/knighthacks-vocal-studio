import * as Tone from 'tone';
import { preloadAudioWorkletModule } from './audioWorkletModule';

const PROCESSOR_NAME = 'vocal-studio-autotune-monitor';
const WORKLET_MODULE_URL = '/autotuneMonitorProcessor.worklet.js';

let moduleLoad: Promise<void> | null = null;

export function preloadAutotuneMonitorWorklet(): Promise<void> {
  if (moduleLoad) {
    return moduleLoad;
  }
  moduleLoad = preloadAudioWorkletModule(WORKLET_MODULE_URL);
  return moduleLoad;
}

export function createAutotuneMonitorDetector(): AudioWorkletNode {
  return Tone.getContext().createAudioWorkletNode(PROCESSOR_NAME);
}
