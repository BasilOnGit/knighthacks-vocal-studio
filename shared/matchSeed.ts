/**
 * Keyword-matched fallback presets and few-shot examples for the preset model.
 *
 * Chain order follows widely taught vocal insert flow: cleanup → subtractive EQ →
 * dynamics → de-ess → color → time-based FX (iZotope vocal workflow, SOS-style guides,
 * genre cheat sheets from pro mix references). Parameters use this app's BandLab-style
 * ranges and engine-safe levels — not copied 1:1 from DAW plugin defaults.
 */
import { fillParams } from './params.ts';
import type { EffectNode, EffectType, Preset } from './types.ts';

export interface SeedSpec {
  id: string;
  /** Maintainer note: sonic goal and typical reference material. */
  notes: string;
  match: RegExp;
  build: () => Preset;
}

function node(
  seedId: string,
  slot: string,
  type: EffectType,
  params: Record<string, number>,
  why: string,
): EffectNode {
  return {
    id: `${seedId}-${slot}`,
    type,
    enabled: true,
    params: fillParams(type, params),
    why,
  };
}

function buildPreset(
  seedId: string,
  name: string,
  explanation: string,
  steps: Array<{ slot: string; type: EffectType; params: Record<string, number>; why: string }>,
  trackVolumeDb?: number,
): Preset {
  const preset: Preset = {
    name,
    explanation,
    chain: steps.map((step) => node(seedId, step.slot, step.type, step.params, step.why)),
  };
  if (trackVolumeDb !== undefined) {
    preset.trackVolumeDb = trackVolumeDb;
  }
  return preset;
}

function noiseCleanupSeed(): Preset {
  return buildPreset('noise-cleanup', 'Noise cleanup', 'Reduce steady noise then balance level.', [
    { slot: 'denoise', type: 'denoise', params: { amount: 65 }, why: 'Tame constant room noise first' },
    { slot: 'eq', type: 'eq', params: { lowCutHz: 90 }, why: 'Remove rumble after denoise' },
    {
      slot: 'comp',
      type: 'compressor',
      params: { thresholdDb: -20, ratio: 3, mix: 100, kneeDb: 12 },
      why: 'Even level',
    },
    { slot: 'deess', type: 'deesser', params: { mix: 55, freqHz: 12000 }, why: 'Control sibilance' },
  ]);
}

function podcastSeed(): Preset {
  return buildPreset('podcast', 'Podcast / dry', 'Clean spoken voice with broadcast dynamics, no space.', [
    { slot: 'denoise', type: 'denoise', params: { amount: 45 }, why: 'Light cleanup for home mics' },
    { slot: 'eq', type: 'eq', params: { lowCutHz: 100, presenceDb: 2 }, why: 'Speech clarity' },
    {
      slot: 'comp',
      type: 'compressor',
      params: { thresholdDb: -18, ratio: 2.5, mix: 100, attackMs: 12, kneeDb: 12 },
      why: 'Consistent level',
    },
    {
      slot: 'rider',
      type: 'rider',
      params: { targetDb: -17, speed: 0.4, maxGainDb: 5 },
      why: 'Broadcast-smooth dynamics',
    },
    { slot: 'deess', type: 'deesser', params: { mix: 60, freqHz: 11000 }, why: 'Tame sibilance' },
  ], -1);
}

function telephoneRadioSeed(): Preset {
  return buildPreset(
    'telephone',
    'Telephone / radio',
    'Narrow band-limited vocal like a phone or AM radio (300 Hz–3 kHz window).',
    [
      {
        slot: 'eq',
        type: 'eq',
        params: { lowCutHz: 280, bodyDb: 2, presenceDb: 3, airDb: -8 },
        why: 'Band-limit mids; roll off air like a small speaker',
      },
      {
        slot: 'sat',
        type: 'saturation',
        params: { drive: 12, mix: 14 },
        why: 'Light grit like handset distortion',
      },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -20, ratio: 4, attackMs: 8, mix: 100 },
        why: 'Squashed broadcast level',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 50, freqHz: 9000 }, why: 'Tame harsh mids' },
      { slot: 'verb', type: 'reverb', params: { mix: 6, sizePct: 8, tonePct: 12 }, why: 'Tiny room only' },
    ],
  );
}

function loFiWarmSeed(): Preset {
  return buildPreset(
    'lo-fi',
    'Lo-fi warm',
    'Dusty, dark vocal with tape-style warmth and a small room (bedroom pop / lo-fi hip-hop).',
    [
      {
        slot: 'eq',
        type: 'eq',
        params: { lowCutHz: 100, bodyDb: -2, airDb: -2 },
        why: 'Darken and clear mud before compression',
      },
      {
        slot: 'sat',
        type: 'saturation',
        params: { drive: 14, mix: 18 },
        why: 'Tape-style warmth',
      },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -20, ratio: 3, attackMs: 15, mix: 100, kneeDb: 14 },
        why: 'Gentle glue',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 45, freqHz: 12000 }, why: 'Keep saturation smooth' },
      { slot: 'verb', type: 'reverb', params: { mix: 14, sizePct: 14, tonePct: 12 }, why: 'Short dark room' },
    ],
  );
}

function hyperpopSeed(): Preset {
  return buildPreset(
    'hyperpop',
    'Hyperpop',
    'Hard-tuned, bright, saturated lead with controlled sibilance (hyperpop / digicore).',
    [
      {
        slot: 'tune',
        type: 'autotune',
        params: { mix: 100, snap: 1, retuneSpeed: 1, speed: 0.95, key: 0, scaleMajor: 1 },
        why: 'Locked robotic tuning',
      },
      {
        slot: 'eq',
        type: 'eq',
        params: { lowCutHz: 110, bodyDb: -3, airDb: 2 },
        why: 'Clear mud; controlled brightness',
      },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -22, ratio: 6, attackMs: 5, releaseMs: 70, mix: 100 },
        why: 'Forward, dense vocal',
      },
      {
        slot: 'sat',
        type: 'saturation',
        params: { drive: 18, mix: 20 },
        why: 'Grit without washing out lyrics',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 72, freqHz: 12000 }, why: 'Tame esses after saturation' },
      { slot: 'chorus', type: 'chorus', params: { mix: 18, depth: 35, rateHz: 1.8 }, why: 'Modulated thickness' },
    ],
    1,
  );
}

function trapSeed(): Preset {
  return buildPreset('trap', 'Trap / T-Pain', 'Hard-tuned lead with punch, slap delay, and short room.', [
    {
      slot: 'tune',
      type: 'autotune',
      params: { mix: 100, snap: 1, retuneSpeed: 0.95, key: 0, scaleMajor: 1 },
      why: 'Full wet trap tuning',
    },
    {
      slot: 'eq',
      type: 'eq',
      params: { lowCutHz: 100, bodyDb: -2, airDb: 1.5 },
      why: 'Tight low end; slight air for modern trap',
    },
    {
      slot: 'comp',
      type: 'compressor',
      params: { thresholdDb: -22, ratio: 5, attackMs: 8, releaseMs: 80, mix: 100 },
      why: 'Punchy trap vocal',
    },
    { slot: 'deess', type: 'deesser', params: { mix: 65, freqHz: 13000 }, why: 'Control bright tuning artifacts' },
    { slot: 'delay', type: 'delay', params: { timeMs: 250, feedback: 12, mix: 15 }, why: 'Short slap' },
    { slot: 'verb', type: 'reverb', params: { mix: 10, sizePct: 12, tonePct: 22 }, why: 'Tight room' },
  ], 2);
}

function drillSeed(): Preset {
  return buildPreset('drill', 'UK drill', 'Dark, firm vocal with moderate tuning and minimal space.', [
    {
      slot: 'tune',
      type: 'autotune',
      params: { mix: 100, snap: 0.9, retuneSpeed: 0.64, key: 0, scaleMajor: 0 },
      why: 'Moderate tuning, not full T-Pain',
    },
    {
      slot: 'eq',
      type: 'eq',
      params: { lowCutHz: 110, bodyDb: -2.5, airDb: -1 },
      why: 'Dark, lean tone',
    },
    {
      slot: 'comp',
      type: 'compressor',
      params: { thresholdDb: -21, ratio: 5.5, attackMs: 7, releaseMs: 90, mix: 100 },
      why: 'Aggressive level control',
    },
    { slot: 'deess', type: 'deesser', params: { mix: 60, freqHz: 12000 }, why: 'Tame sibilance' },
    { slot: 'verb', type: 'reverb', params: { mix: 8, sizePct: 10, tonePct: 10 }, why: 'Dark short room' },
  ]);
}

function backgroundVocalSeed(): Preset {
  return buildPreset(
    'bg-vocal',
    'Background vocal',
    'Harmony stack behind the lead with wetter space than a lead vocal.',
    [
      { slot: 'eq', type: 'eq', params: { lowCutHz: 100, bodyDb: -2, airDb: 1.5 }, why: 'Sit behind the lead' },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -22, ratio: 3.5, attackMs: 12, mix: 100 },
        why: 'Glue the stack',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 58, freqHz: 12000 }, why: 'Smooth stack brightness' },
      { slot: 'dbl', type: 'doubler', params: { mix: 24, delayMs: 18, width: 75 }, why: 'Stereo width' },
      {
        slot: 'delay',
        type: 'delay',
        params: { timeMs: 400, feedback: 18, mix: 30, pingPong: 1 },
        why: 'Depth behind lead',
      },
      { slot: 'verb', type: 'reverb', params: { mix: 52, sizePct: 50, tonePct: 32 }, why: 'Wet hall for BG layer' },
    ],
    -6,
  );
}

function adlibVocalSeed(): Preset {
  return buildPreset(
    'adlib',
    'Adlib / ear candy',
    'Floating adlibs with obvious delay and long reverb tail.',
    [
      { slot: 'eq', type: 'eq', params: { lowCutHz: 110, bodyDb: -2.5, airDb: 2 }, why: 'Light and behind lead' },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -23, ratio: 3, attackMs: 14, mix: 100 },
        why: 'Controlled level',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 55, freqHz: 12000 }, why: 'Smooth top in space' },
      {
        slot: 'delay',
        type: 'delay',
        params: { timeMs: 420, feedback: 22, mix: 35, pingPong: 1 },
        why: 'Obvious echo on fills',
      },
      { slot: 'verb', type: 'reverb', params: { mix: 62, sizePct: 58, tonePct: 34 }, why: 'Long wet tail for adlibs' },
    ],
    -8,
  );
}

function dreamPopSeed(): Preset {
  return buildPreset('dream-pop', 'Dream pop', 'Airy vocal with width, ping-pong delay, and lush reverb.', [
    { slot: 'eq', type: 'eq', params: { lowCutHz: 90, airDb: 3, bodyDb: -2 }, why: 'Airy top, soft mids' },
    {
      slot: 'comp',
      type: 'compressor',
      params: { thresholdDb: -20, ratio: 3, attackMs: 12, mix: 100 },
      why: 'Even level before space',
    },
    { slot: 'deess', type: 'deesser', params: { mix: 55, freqHz: 12000 }, why: 'Smooth brightness' },
    {
      slot: 'dbl',
      type: 'doubler',
      params: { mix: 22, delayMs: 18, width: 75 },
      why: 'Subtle stereo width before space',
    },
    {
      slot: 'delay',
      type: 'delay',
      params: { timeMs: 380, feedback: 18, mix: 22, pingPong: 1 },
      why: 'Ping-pong repeats',
    },
    { slot: 'verb', type: 'reverb', params: { mix: 32, sizePct: 45, tonePct: 35 }, why: 'Wide hall' },
  ], -2);
}

function warmRnBSeed(): Preset {
  return buildPreset('warm-rnb', 'Warm R&B', 'Intimate R&B with gentle tone shaping and soft space.', [
    { slot: 'eq', type: 'eq', params: { lowCutHz: 90, bodyDb: -1.5, airDb: 2 }, why: 'Warm body with a little air' },
    {
      slot: 'comp',
      type: 'compressor',
      params: { thresholdDb: -20, ratio: 3, mix: 100, kneeDb: 12 },
      why: 'Even level for R&B intimacy',
    },
    {
      slot: 'rider',
      type: 'rider',
      params: { targetDb: -18, speed: 0.35, maxGainDb: 6 },
      why: 'Gentle level ride after compression',
    },
    { slot: 'deess', type: 'deesser', params: { mix: 58, freqHz: 12000 }, why: 'Smooth esses on sung lines' },
    { slot: 'verb', type: 'reverb', params: { mix: 14, sizePct: 18, tonePct: 20 }, why: 'Small dark room' },
  ], -2);
}

function airyPopSeed(): Preset {
  return buildPreset(
    'airy-pop',
    'Airy pop',
    'Forward chart-pop vocal: bright, controlled dynamics, short bright room.',
    [
      { slot: 'eq', type: 'eq', params: { lowCutHz: 90, bodyDb: -1.5, airDb: 3 }, why: 'HPF and gentle air' },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -19, ratio: 3.5, attackMs: 12, releaseMs: 90, kneeDb: 12, mix: 100 },
        why: 'Pop-forward level',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 62, freqHz: 13000 }, why: 'Control sizzle from air boost' },
      { slot: 'verb', type: 'reverb', params: { mix: 12, sizePct: 16, tonePct: 38 }, why: 'Short bright room' },
    ],
  );
}

function hipHopSeed(): Preset {
  return buildPreset(
    'hip-hop',
    'Hip-hop lead',
    'Clear rap vocal: tight low end, punchy compression, minimal tuning.',
    [
      { slot: 'eq', type: 'eq', params: { lowCutHz: 95, bodyDb: -2, presenceDb: 1.5 }, why: 'Clear mud; forward presence' },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -21, ratio: 4, attackMs: 10, releaseMs: 100, mix: 100 },
        why: 'Punchy rap level',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 65, freqHz: 12000 }, why: 'Tame esses' },
      { slot: 'delay', type: 'delay', params: { timeMs: 220, feedback: 10, mix: 12 }, why: 'Optional subtle slap' },
    ],
  );
}

function rockPunkSeed(): Preset {
  return buildPreset(
    'rock',
    'Rock / punk',
    'Aggressive sung vocal with presence, grit, and a tight room.',
    [
      { slot: 'eq', type: 'eq', params: { lowCutHz: 100, bodyDb: -2, presenceDb: 2.5 }, why: 'Cut mud; forward mid presence' },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -20, ratio: 5, attackMs: 6, releaseMs: 80, mix: 100 },
        why: 'Rock vocal punch',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 60, freqHz: 11000 }, why: 'Control harsh esses' },
      { slot: 'sat', type: 'saturation', params: { drive: 12, mix: 15 }, why: 'Edge and density' },
      { slot: 'verb', type: 'reverb', params: { mix: 11, sizePct: 14, tonePct: 28 }, why: 'Short room' },
    ],
  );
}

function countrySeed(): Preset {
  return buildPreset(
    'country',
    'Country',
    'Natural, present vocal with light compression and a small hall.',
    [
      {
        slot: 'eq',
        type: 'eq',
        params: { lowCutHz: 80, lowShelfDb: 1, presenceDb: 2 },
        why: 'Warm body and forward clarity',
      },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -19, ratio: 2.5, attackMs: 15, releaseMs: 120, kneeDb: 14, mix: 100 },
        why: 'Light country glue',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 50, freqHz: 11000 }, why: 'Gentle de-ess' },
      { slot: 'verb', type: 'reverb', params: { mix: 13, sizePct: 20, tonePct: 30 }, why: 'Small hall' },
    ],
  );
}

function jazzNaturalSeed(): Preset {
  return buildPreset(
    'natural',
    'Natural / jazz',
    'Minimal processing: gentle HPF and light dynamics, no space.',
    [
      { slot: 'eq', type: 'eq', params: { lowCutHz: 70 }, why: 'Only remove rumble' },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -24, ratio: 2, attackMs: 20, releaseMs: 150, mix: 100, kneeDb: 14 },
        why: 'Barely-there level control',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 35, freqHz: 10000 }, why: 'Only if esses poke' },
    ],
  );
}

function worshipGospelSeed(): Preset {
  return buildPreset(
    'worship',
    'Worship / gospel',
    'Wide, reverent vocal with doubles and a long hall.',
    [
      { slot: 'eq', type: 'eq', params: { lowCutHz: 90, airDb: 2, bodyDb: -1 }, why: 'Open top; controlled body' },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -20, ratio: 3.5, attackMs: 12, mix: 100 },
        why: 'Even level for big space',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 58, freqHz: 12000 }, why: 'Smooth brightness' },
      { slot: 'dbl', type: 'doubler', params: { mix: 20, delayMs: 16, width: 70 }, why: 'Congregational width' },
      { slot: 'delay', type: 'delay', params: { timeMs: 420, feedback: 15, mix: 14, pingPong: 1 }, why: 'Rhythmic depth' },
      { slot: 'verb', type: 'reverb', params: { mix: 28, sizePct: 55, tonePct: 32 }, why: 'Long hall' },
    ],
  );
}

function synth80sSeed(): Preset {
  return buildPreset(
    'synth-80s',
    '80s synth-pop',
    'Chorus-heavy, bright vocal with slap delay and plate-style space.',
    [
      { slot: 'eq', type: 'eq', params: { lowCutHz: 95, airDb: 2.5, presenceDb: 1 }, why: 'Bright 80s sheen' },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -19, ratio: 3.5, attackMs: 10, mix: 100 },
        why: 'Consistent level',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 60, freqHz: 12000 }, why: 'Tame bright esses' },
      { slot: 'chorus', type: 'chorus', params: { mix: 30, depth: 40, rateHz: 1.2 }, why: 'Lush modulation' },
      { slot: 'delay', type: 'delay', params: { timeMs: 320, feedback: 16, mix: 18 }, why: 'Slap and width' },
      { slot: 'verb', type: 'reverb', params: { mix: 18, sizePct: 28, tonePct: 40 }, why: 'Plate-like room' },
    ],
  );
}

function edmHouseSeed(): Preset {
  return buildPreset(
    'edm',
    'EDM / house vocal',
    'Tight, bright club vocal with firm dynamics and short delay.',
    [
      { slot: 'eq', type: 'eq', params: { lowCutHz: 105, bodyDb: -2, airDb: 2 }, why: 'Lean low end for club systems' },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -21, ratio: 4.5, attackMs: 8, releaseMs: 70, mix: 100 },
        why: 'Consistent on loud beats',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 68, freqHz: 13000 }, why: 'Bright but controlled' },
      { slot: 'delay', type: 'delay', params: { timeMs: 250, feedback: 14, mix: 16, pingPong: 1 }, why: 'Rhythmic stereo delay' },
      { slot: 'verb', type: 'reverb', params: { mix: 10, sizePct: 12, tonePct: 35 }, why: 'Short bright room' },
    ],
  );
}

function metalScreamSeed(): Preset {
  return buildPreset(
    'metal',
    'Metal / scream',
    'Gated, dense vocal for loud performances with controlled harshness.',
    [
      { slot: 'gate', type: 'gate', params: { thresholdDb: -38, attackMs: 1, releaseMs: 120 }, why: 'Reduce bleed between phrases' },
      { slot: 'eq', type: 'eq', params: { lowCutHz: 120, bodyDb: -3, presenceDb: 2 }, why: 'Tight lows; cut mud' },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -22, ratio: 6, attackMs: 5, releaseMs: 60, mix: 100 },
        why: 'Heavy vocal density',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 65, freqHz: 10000 }, why: 'Tame harsh esses' },
      { slot: 'sat', type: 'saturation', params: { drive: 16, mix: 18 }, why: 'Aggressive edge' },
      { slot: 'verb', type: 'reverb', params: { mix: 8, sizePct: 10, tonePct: 22 }, why: 'Minimal room' },
    ],
  );
}

function anthemSeed(): Preset {
  return buildPreset(
    'anthem',
    'Arena / anthem',
    'Big stadium vocal with delay and long reverberant tail.',
    [
      { slot: 'eq', type: 'eq', params: { lowCutHz: 95, bodyDb: -1.5, airDb: 2.5 }, why: 'Full but controlled tone' },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -19, ratio: 4, attackMs: 10, mix: 100 },
        why: 'Sustained level for big space',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 58, freqHz: 12000 }, why: 'Smooth top in reverb' },
      { slot: 'delay', type: 'delay', params: { timeMs: 450, feedback: 20, mix: 20, pingPong: 1 }, why: 'Wide rhythmic depth' },
      { slot: 'verb', type: 'reverb', params: { mix: 35, sizePct: 62, tonePct: 38 }, why: 'Large hall' },
    ],
    3,
  );
}

function indieFolkSeed(): Preset {
  return buildPreset(
    'indie-folk',
    'Indie / folk',
    'Intimate acoustic vocal: light dynamics and a touch of room.',
    [
      { slot: 'eq', type: 'eq', params: { lowCutHz: 85, bodyDb: -1, airDb: 1 }, why: 'Natural tone cleanup' },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -22, ratio: 2.5, attackMs: 18, releaseMs: 140, kneeDb: 14, mix: 100 },
        why: 'Gentle folk glue',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 45, freqHz: 11000 }, why: 'Light de-ess' },
      { slot: 'verb', type: 'reverb', params: { mix: 11, sizePct: 16, tonePct: 26 }, why: 'Small natural room' },
    ],
  );
}

function balancedPopSeed(): Preset {
  return buildPreset(
    'balanced-pop',
    'Balanced pop vocal',
    'Versatile modern pop chain when no specific genre is named.',
    [
      { slot: 'eq', type: 'eq', params: { lowCutHz: 85, bodyDb: -1.5, airDb: 2 }, why: 'Standard HPF and tone cleanup' },
      {
        slot: 'comp',
        type: 'compressor',
        params: { thresholdDb: -20, ratio: 3.5, attackMs: 12, kneeDb: 12, mix: 100 },
        why: 'Even pop level',
      },
      { slot: 'deess', type: 'deesser', params: { mix: 62, freqHz: 12000 }, why: 'Default sung-vocal de-ess' },
      { slot: 'verb', type: 'reverb', params: { mix: 12, sizePct: 15, tonePct: 28 }, why: 'Short room' },
    ],
    0,
  );
}

/**
 * First match wins. Order from most specific intents to broad genres.
 */
export const SEED_SPECS: SeedSpec[] = [
  {
    id: 'noise-cleanup',
    notes: 'Steady noise / hiss — denoise before dynamics (RX-style cleanup workflow).',
    match:
      /\b(denoise|noise reduction|de-?noise|hiss|hum|fan noise|clean up (the )?noise|background noise)\b/,
    build: noiseCleanupSeed,
  },
  {
    id: 'podcast',
    notes: 'Spoken word / broadcast — dry, rider-smooth (podcast mixing guides).',
    match:
      /\b(podcast|spoken|spoken word|voiceover|voice-over|narration|audiobook|interview|broadcast|talk show)\b|\b(bone-?dry|no reverb|without reverb|\bdry\b)\b/,
    build: podcastSeed,
  },
  {
    id: 'adlib',
    notes: 'Adlibs / fills — wet delay and long verb behind the lead.',
    match: /\b(adlib|ad-?libs?|ad lib|vocal fills?|oohs? and ahhs?|call and response)\b/i,
    build: adlibVocalSeed,
  },
  {
    id: 'bg-vocal',
    notes: 'Background / harmony stack — wetter than lead, lower fader.',
    match:
      /\b(background vocal|backing vocal|bg vocal|harmonies?|harmony stack|stacked vocal|bgv|bv layer)\b/i,
    build: backgroundVocalSeed,
  },
  {
    id: 'telephone',
    notes: 'POTS-style bandpass ~300 Hz–3 kHz (MusicProductionWiki / lo-fi telephone recipes).',
    match: /\b(telephone|phone filter|phone effect|megaphone|intercom|am radio|walkie|tinny|band-?pass vocal)\b/,
    build: telephoneRadioSeed,
  },
  {
    id: 'hyperpop',
    notes: 'Hard tune + saturation + de-ess after color (hyperpop chain guides).',
    match: /\b(hyperpop|hyper pop|digicore|glitch pop|100 gecs|pc music)\b/,
    build: hyperpopSeed,
  },
  {
    id: 'trap',
    notes: 'Trap / melodic rap — full autotune, punch, slap delay (trap vocal cheat sheets).',
    match:
      /\b(trap|t-?pain|autotune heavy|hard tune|travis scott|future vocal|melodic trap)\b/,
    build: trapSeed,
  },
  {
    id: 'drill',
    notes: 'UK drill — darker, firmer, lighter tuning than trap.',
    match: /\b(drill|uk drill|pop smoke|central cee)\b/,
    build: drillSeed,
  },
  {
    id: 'metal',
    notes: 'Scream / metal — gate, heavy compression, saturation.',
    match: /\b(metal|scream|screamo|hardcore|deathcore|metalcore)\b/,
    build: metalScreamSeed,
  },
  {
    id: 'indie-folk',
    notes: 'Indie / folk — light touch and small room.',
    match: /\b(indie folk|folk vocal|acoustic pop|acoustic folk|bon iver|fragile vocal)\b/,
    build: indieFolkSeed,
  },
  {
    id: 'natural',
    notes: 'Jazz / raw — minimal chain, no space.',
    match:
      /\b(jazz|unprocessed|raw vocal|no effects|minimal processing|singer-?songwriter)\b/,
    build: jazzNaturalSeed,
  },
  {
    id: 'dream-pop',
    notes: 'Dream pop / shoegaze — width, delay before long reverb.',
    match: /\b(dream pop|dreamy|ethereal|shoegaze|cocteau|reverb heavy|billie)\b/,
    build: dreamPopSeed,
  },
  {
    id: 'lo-fi',
    notes: 'Lo-fi bedroom — warmth, saturation, dark short room (lo-fi vocal guides).',
    match: /\b(lo-?fi|lofi|bedroom pop|joji|dusty|vintage vocal|tape vocal)\b/,
    build: loFiWarmSeed,
  },
  {
    id: 'worship',
    notes: 'Worship / gospel — doubles and long hall.',
    match: /\b(worship|gospel|hymn|church vocal|christian vocal)\b/,
    build: worshipGospelSeed,
  },
  {
    id: 'synth-80s',
    notes: '80s — chorus + delay + plate-style verb.',
    match: /\b(80s|eighties|synth[- ]?pop|new wave|synthwave|depeche|madonna)\b/,
    build: synth80sSeed,
  },
  {
    id: 'anthem',
    notes: 'Stadium / cinematic — long verb and delay.',
    match: /\b(arena|anthem|stadium|epic vocal|cinematic vocal|big vocal)\b/,
    build: anthemSeed,
  },
  {
    id: 'edm',
    notes: 'Club vocal — tight lows, firm compression, short delay.',
    match: /\b(edm|house vocal|techno vocal|club vocal|festival drop vocal|dance vocal)\b/,
    build: edmHouseSeed,
  },
  {
    id: 'rock',
    notes: 'Rock / punk — presence, fast compression, grit.',
    match: /\b(rock vocal|punk|pop punk|emo|post-?hardcore|grunge)\b/,
    build: rockPunkSeed,
  },
  {
    id: 'country',
    notes: 'Country — present mids, light compression, small hall.',
    match: /\b(country|nashville|americana|bluegrass)\b/,
    build: countrySeed,
  },
  {
    id: 'hip-hop',
    notes: 'Rap lead without mandatory hard tune.',
    match: /\b(hip hop|hip-hop|rap vocal|boom bap|lyrical rap)\b/,
    build: hipHopSeed,
  },
  {
    id: 'airy-pop',
    notes: 'Chart pop — bright air, short room.',
    match:
      /\b(airy pop|radio pop|top 40|chart pop|ariana|taylor swift|mainstream pop)\b|\bpop vocal\b/,
    build: airyPopSeed,
  },
  {
    id: 'warm-rnb',
    notes: 'R&B / soul — warm body, rider, small room.',
    match: /\b(r&b|rnb|warm|intimate|soul|neo soul|neo-soul)\b/,
    build: warmRnBSeed,
  },
];

export function matchSeed(prompt: string): Preset {
  const text = prompt.normalize('NFKC').toLowerCase();
  for (const spec of SEED_SPECS) {
    if (spec.match.test(text)) {
      return spec.build();
    }
  }
  return balancedPopSeed();
}

/** Compact examples for the HF system prompt (diverse styles, not the full library). */
export const FEW_SHOT_SEEDS: Preset[] = [
  warmRnBSeed(),
  trapSeed(),
  dreamPopSeed(),
  podcastSeed(),
  hyperpopSeed(),
  loFiWarmSeed(),
];

export function seedSpecById(id: string): SeedSpec | undefined {
  return SEED_SPECS.find((spec) => spec.id === id);
}
