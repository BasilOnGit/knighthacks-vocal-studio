import { fakePreset } from '../../../shared/fakePreset.ts';
import { validatePreset } from '../../../shared/validate.ts';

const FEATURE_KEYS = [
  'loudnessDb',
  'peakDb',
  'centroidHz',
  'pitchHz',
  'noiseFloorDb',
  'voicedSeconds',
];

export function validatePrompt(body) {
  if (!body || typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 1000) {
    throw new Error('Provide a vocal style description between 1 and 1000 characters.');
  }
  return body.prompt.trim();
}

export function validateFeatures(features) {
  if (!features || typeof features !== 'object') {
    throw new Error('Provide the six voice measurements as finite numbers.');
  }
  const result = {};
  for (const key of FEATURE_KEYS) {
    const value = features[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('Provide the six voice measurements as finite numbers.');
    }
    result[key] = value;
  }
  return result;
}

export async function generatePreset(prompt, features) {
  // Accepted for the request contract. No model is connected yet.
  void prompt;
  void features;
  return { preset: validatePreset(fakePreset), source: 'fallback' };
}
