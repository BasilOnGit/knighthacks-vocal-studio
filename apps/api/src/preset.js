import { buildMixingGuideForModel } from '../../../shared/mixingGuide.ts';
import { FEW_SHOT_SEEDS, matchSeed } from '../../../shared/matchSeed.ts';
import { MAX_EFFECTS, PARAM_RANGES, fillParams } from '../../../shared/params.ts';
import { stampPresetFromFeatures } from '../../../shared/stampPreset.ts';
import { MAX_OTHER_TRACKS_FOR_MODEL } from '../../../shared/otherTracks.ts';
import { clampTrackVolumeDb, withResolvedTrackVolume } from '../../../shared/trackVolume.ts';
import { validatePreset } from '../../../shared/validate.ts';
import { REVERB_GUIDANCE_FOR_MODEL, vocalLayerHintsForModel } from '../../../shared/vocalLayer.ts';

const FEATURE_KEYS = [
  'loudnessDb',
  'peakDb',
  'centroidHz',
  'pitchHz',
  'noiseFloorDb',
  'voicedSeconds',
  'key',
  'scaleMajor',
  'keyConfidence',
  'pitchStability',
  'crestDb',
  'sibilanceRatio',
  'bpm',
];

const HF_CHAT_URL = 'https://router.huggingface.co/v1/chat/completions';
const MODEL_TIMEOUT_MS = 20_000;

const CATALOG = Object.entries(PARAM_RANGES)
  .map(([type, params]) => {
    const ranges = Object.entries(params)
      .map(([key, range]) => `${key} ${range.min} to ${range.max}`)
      .join(', ');
    return `${type}: ${ranges}`;
  })
  .join('\n');

const MIXING_GUIDE = buildMixingGuideForModel();

const FEW_SHOT_BLOCK = FEW_SHOT_SEEDS.map((seed) => JSON.stringify({
  name: seed.name,
  explanation: seed.explanation,
  trackVolumeDb: seed.trackVolumeDb ?? 0,
  chain: seed.chain.map(({ type, params, why }) => ({ type, params, why })),
})).join('\n');

const SYSTEM_PROMPT = `You are an expert vocal mixing engineer. Output JSON only, matching the schema, no prose.
Schema: {"name": string, "explanation": string, "trackVolumeDb": number (optional, −36 to +6), "chain": [{"type": string, "params": {parameter: number}, "why": string}]}
Use only catalog effects and parameters. Stay inside ranges. Never more than ${MAX_EFFECTS} effects.
Units: mix/drive/amount/width and most wet controls are 0–100 (percent). autotune key is 0–11 (0=C … 11=B). scaleMajor 1=major, 0=minor. delay pingPong 0 or 1.
The chain array is serial signal flow: index 0 processes the vocal first. The host applies your order exactly — it never re-sorts.
You choose which effects to include and their order based on the user's prompt and the voice features. Do not paste a default template chain every time.
You may include the same type more than once (e.g. two eq nodes). Write a short why per effect as an imperative phrase only (e.g. "clean up residual noise while preserving vocal texture") — the app prepends measured level context; do not start with "Based on sound input".
The explanation field should summarize the sonic goal and why this chain order serves the prompt.
The code fills missing parameters and assigns ids. Do not guess musical key — use features.key and features.scaleMajor when setting autotune (these reflect the beat track when BPM is present, not the singer's detected key).

Workflow (internal, before you write JSON):
1. Interpret the prompt (genre, mood, references, dry/wet, tuned/raw, bright/dark).
2. Select effects that match — omit what the prompt does not need.
3. Sequence them deliberately for that sound (not a fixed master bus order).
4. Set parameters using features and the catalog ranges.
5. Set trackVolumeDb when the vibe needs a different fader level (track mixer, not clip gain). Omit on follow-ups only if the user did not ask to change level.
6. When other session tracks are listed in the user message, use them as context: stack background vocals consistently, differentiate only when the prompt asks (e.g. "darker BG", "wider double").

Parameter habits (clean first — this DSP gets harsh if you copy bright DAW numbers blindly):
trackVolumeDb — −36 to +6 dB; whisper/intimate/background −3 to −6, standard pop/rap 0 to +2, loud anthem/upfront +2 to +4; lower if loudnessDb > −16, raise if loudnessDb < −26
compressor — mix 100 always (serial); kneeDb 10–14; ratio 2.5–4 intimate, 4–6 punchy; makeupDb 0–2; attack 8–15 ms, release 50–120 ms
autotune — mix 100 or omit (mix 0); never partial mix — soften with retuneSpeed/snap, not mix
saturation — omit for clean/BandLab-style vocals; drive 0.06–0.15, mix 0.08–0.18 only for warmth/grit
deesser — freqHz 8000–14000 (air/sizzle), not 5–6 kHz (that chews presence). mix 60–85 strength (not dry/wet), thresholdDb around -24 to -18
delay — timeMs, feedback and mix as 0–100 % (BandLab D-Delay): feedback 10–20 on leads, mix 10–25; pingPong 1 for stereo bounce on spacious/dreamy, 0 for mono slap
denoise — place first when used; amount 35–55 clean-up, 55–80 noisy room; omit on pristine studio takes
rider — after compressor for smooth level; targetDb -20 to -16; speed 0.25–0.5; maxGainDb 4–8; omit for aggressive punch chains
doubler — mix 12–30 subtle width, 30–45 obvious stack; delayMs 12–22; width 60–90; before delay/reverb when widening
${REVERB_GUIDANCE_FOR_MODEL}
eq — start near 0 dB. Do not stack presenceDb and airDb; for clean treble use a little airDb (1–3) and leave presenceDb at 0 or a cut. High-pass only unless the prompt asks for tone.

${MIXING_GUIDE}

Example presets (compact JSON — match units and style, do not copy blindly):
${FEW_SHOT_BLOCK}

Catalog (parameter ranges):
${CATALOG}`;

export function validatePrompt(body) {
  if (!body || typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 1000) {
    throw new Error('Provide a vocal style description between 1 and 1000 characters.');
  }
  return body.prompt.trim();
}

export function validateFeatures(features) {
  if (!features || typeof features !== 'object') {
    throw new Error('Provide voice measurements as finite numbers.');
  }
  const result = {};
  for (const key of FEATURE_KEYS) {
    const value = features[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error('Provide voice measurements as finite numbers.');
    }
    result[key] = value;
  }
  return result;
}

export function validateHistory(body) {
  if (body?.history == null) {
    return [];
  }
  if (!Array.isArray(body.history)) {
    throw new Error('history must be an array of prior prompts.');
  }
  const out = [];
  for (const entry of body.history.slice(-5)) {
    if (!entry || typeof entry.prompt !== 'string' || !entry.prompt.trim()) {
      continue;
    }
    out.push({ prompt: entry.prompt.trim() });
  }
  return out;
}

export function promptRejectsSpace(prompt) {
  return /\b(dry|no reverb|bone-?dry|without reverb|a cappella dry|podcast)\b/i.test(prompt);
}

/** Append a high-pass EQ only when the model omitted EQ. Never inject reverb. */
export function ensureMixProtocol(preset) {
  const chain = [...preset.chain];
  if (!chain.some((node) => node.type === 'eq')) {
    chain.push({
      type: 'eq',
      params: fillParams('eq', { lowCutHz: 80 }),
      why: 'Default high-pass cleanup',
    });
  }
  return validatePreset({ ...preset, chain });
}

function parseModelJson(content) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function isRetryable(error) {
  return error instanceof SyntaxError || error?.name === 'ZodError';
}

function seedStartingPreset(prompt, currentPreset) {
  if (currentPreset?.chain?.length) {
    return currentPreset;
  }
  return validatePreset(matchSeed(prompt));
}

function finishPreset(preset, prompt, features, currentTrackVolumeDb) {
  const protocol = ensureMixProtocol(preset);
  const stamped = stampPresetFromFeatures(protocol, features);
  return withResolvedTrackVolume(stamped, prompt, features, currentTrackVolumeDb);
}

const OTHER_TRACK_CHAIN_TYPES = new Set(Object.keys(PARAM_RANGES));

export function validateOtherTracks(body) {
  if (body?.otherTracks == null) {
    return [];
  }
  if (!Array.isArray(body.otherTracks)) {
    throw new Error('otherTracks must be an array.');
  }
  const out = [];
  for (const entry of body.otherTracks.slice(0, MAX_OTHER_TRACKS_FOR_MODEL)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 80) : '';
    if (!name) {
      continue;
    }
    const role = entry.role === 'beat' ? 'beat' : 'vocal';
    const clipCount =
      typeof entry.clipCount === 'number' && Number.isFinite(entry.clipCount)
        ? Math.max(0, Math.floor(entry.clipCount))
        : 0;
    const trackVolumeDb =
      typeof entry.trackVolumeDb === 'number' && Number.isFinite(entry.trackVolumeDb)
        ? clampTrackVolumeDb(entry.trackVolumeDb)
        : 0;
    const presetName =
      typeof entry.presetName === 'string' ? entry.presetName.trim().slice(0, 120) : 'Untitled';
    const explanation =
      typeof entry.explanation === 'string' ? entry.explanation.trim().slice(0, 500) : '';
    const chain = [];
    if (Array.isArray(entry.chain)) {
      for (const node of entry.chain.slice(0, 12)) {
        if (!node || typeof node !== 'object' || typeof node.type !== 'string') {
          continue;
        }
        if (!OTHER_TRACK_CHAIN_TYPES.has(node.type)) {
          continue;
        }
        const rawParams = node.params && typeof node.params === 'object' ? node.params : {};
        const validatedNode = validatePreset({
          name: 'context',
          explanation: '',
          chain: [{ type: node.type, params: rawParams }],
        }).chain[0];
        if (!validatedNode) {
          continue;
        }
        const why =
          typeof node.why === 'string' && node.why.trim() ? node.why.trim().slice(0, 200) : undefined;
        chain.push({
          type: validatedNode.type,
          params: validatedNode.params,
          ...(why ? { why } : {}),
        });
      }
    }
    const snapshot = {
      name,
      role,
      clipCount,
      trackVolumeDb,
      presetName,
      explanation,
      chain,
    };
    if (typeof entry.presetSource === 'string' && entry.presetSource.trim()) {
      snapshot.presetSource = entry.presetSource.trim().slice(0, 32);
    }
    if (typeof entry.lastPrompt === 'string' && entry.lastPrompt.trim()) {
      snapshot.lastPrompt = entry.lastPrompt.trim().slice(0, 500);
    }
    out.push(snapshot);
  }
  return out;
}

export function validateCurrentTrackVolume(body) {
  if (body?.currentTrackVolumeDb == null) {
    return undefined;
  }
  const value = body.currentTrackVolumeDb;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('currentTrackVolumeDb must be a finite number.');
  }
  return clampTrackVolumeDb(value);
}

export function validateCurrentTrackName(body) {
  if (body?.currentTrackName == null) {
    return undefined;
  }
  if (typeof body.currentTrackName !== 'string') {
    throw new Error('currentTrackName must be a string.');
  }
  const trimmed = body.currentTrackName.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, 80);
}

function userMessage(
  prompt,
  features,
  errorNote,
  currentPreset,
  history,
  currentTrackVolumeDb,
  otherTracks,
  currentTrackName,
) {
  const lines = [
    `Prompt: ${prompt}`,
    `Features: ${JSON.stringify(features)}`,
    'Do not guess key — set autotune key/scaleMajor from features.key and features.scaleMajor (beat key when features.bpm > 0).',
    'Build a custom chain: choose effects and their order for this prompt and voice. Do not output a generic chain unless the prompt is generic.',
  ];
  for (const hint of vocalLayerHintsForModel(prompt, currentTrackName)) {
    lines.push(hint);
  }
  if (currentTrackVolumeDb !== undefined) {
    lines.push(
      `Current track fader: ${currentTrackVolumeDb} dB (allowed −36 to +6). Set trackVolumeDb when the vibe needs a different level.`,
    );
  }
  if (otherTracks.length > 0) {
    lines.push(
      'Other tracks already in this session (match their stack/level when adding a similar layer; beat is reference only — do not process the beat):',
    );
    lines.push(JSON.stringify(otherTracks));
  }
  if (history.length > 0) {
    lines.push(
      'This is a follow-up refinement. Adjust the current chain to match the new prompt; keep working parts unless the user asks for a new sound.',
    );
    lines.push(
      `Prior user prompts: ${history.map((entry) => entry.prompt).join(' → ')}`,
    );
  }
  if (currentPreset?.chain?.length) {
    if (history.length === 0) {
      lines.push(
        'Refine the current chain below when the prompt is incremental (e.g. less reverb, brighter). Replace it entirely only if the prompt asks for a new sound.',
      );
    }
    lines.push(`Current chain JSON: ${JSON.stringify(currentPreset)}`);
  } else {
    lines.push(
      `Starting seed chain JSON (refine this — do not invent a unrelated template): ${JSON.stringify(seedStartingPreset(prompt, currentPreset))}`,
    );
  }
  if (errorNote) {
    lines.push(`The previous output failed validation: ${errorNote.slice(0, 500)}`);
    lines.push('Return corrected JSON only.');
  }
  return lines.join('\n');
}

async function requestPreset(
  fetchImpl,
  token,
  model,
  prompt,
  features,
  errorNote,
  currentPreset,
  history,
  currentTrackVolumeDb,
  otherTracks,
  currentTrackName,
) {
  const response = await fetchImpl(HF_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: userMessage(
            prompt,
            features,
            errorNote,
            currentPreset,
            history,
            currentTrackVolumeDb,
            otherTracks,
            currentTrackName,
          ),
        },
      ],
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Model request failed (${response.status})`);
  }
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new SyntaxError('Model returned no JSON message');
  }
  const validated = validatePreset(parseModelJson(content));
  return finishPreset(validated, prompt, features, currentTrackVolumeDb);
}

export function validateCurrentPreset(body) {
  if (body?.currentPreset == null) {
    return undefined;
  }
  return validatePreset(body.currentPreset);
}

export async function generatePreset(prompt, features, options = {}) {
  const token = (options.token !== undefined ? options.token : process.env.HF_TOKEN)?.trim();
  const model = (options.model !== undefined ? options.model : process.env.HF_MODEL)?.trim();
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const history = options.history ?? [];
  const currentPreset = options.currentPreset
    ? validatePreset(options.currentPreset)
    : undefined;
  const currentTrackVolumeDb = options.currentTrackVolumeDb;
  const otherTracks = options.otherTracks ?? [];
  const currentTrackName = options.currentTrackName;
  if (!token || !model) {
    const seed = validatePreset(matchSeed(prompt));
    return {
      preset: finishPreset(seed, prompt, features, currentTrackVolumeDb),
      source: 'fallback',
    };
  }

  let errorNote = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const preset = await requestPreset(
        fetchImpl,
        token,
        model,
        prompt,
        features,
        errorNote,
        currentPreset,
        history,
        currentTrackVolumeDb,
        otherTracks,
        currentTrackName,
      );
      return { preset, source: 'model' };
    } catch (error) {
      if (attempt === 1 || !isRetryable(error)) {
        const seed = validatePreset(matchSeed(prompt));
        return {
          preset: finishPreset(seed, prompt, features, currentTrackVolumeDb),
          source: 'fallback',
        };
      }
      errorNote = error instanceof Error ? error.message : 'Invalid preset JSON';
    }
  }
  const seed = validatePreset(matchSeed(prompt));
  return {
    preset: finishPreset(seed, prompt, features, currentTrackVolumeDb),
    source: 'fallback',
  };
}
