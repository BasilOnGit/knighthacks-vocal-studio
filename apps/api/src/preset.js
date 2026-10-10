import { fakePreset } from '../../../shared/fakePreset.ts';
import { FIXED_ORDER, MAX_EFFECTS, PARAM_RANGES, fillParams } from '../../../shared/params.ts';
import { validatePreset } from '../../../shared/validate.ts';

const FEATURE_KEYS = [
  'loudnessDb',
  'peakDb',
  'centroidHz',
  'pitchHz',
  'noiseFloorDb',
  'voicedSeconds',
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

const PROTOCOL_ORDER = FIXED_ORDER.join(' → ');

const SYSTEM_PROMPT = `You are a vocal mixing engineer. Output JSON only, matching the schema, no prose.
Schema: {"name": string, "explanation": string, "chain": [{"type": string, "params": {parameter: number}, "why": string}]}
Use only catalog effects and parameters. Stay inside ranges. Never more than ${MAX_EFFECTS} effects.
List effects in signal order (first in chain = hits the vocal first). The host keeps your order; it does not reorder.
You may include the same type more than once (e.g. two eq nodes: subtractive then additive).
Write a short why for each effect and a one-sentence explanation.
The code fills missing parameters and assigns ids.

Mixing protocol (follow unless the user's prompt clearly contradicts a step):
1. gate — only when noiseFloorDb is high (noisy room); omit on clean takes
2. autotune — when the user asks for autotune, T-Pain, trap, hyperpop, polished pitch, or modern R&B; mix 0.5–1, speed 0.7–1; omit for raw/natural/unprocessed vocals
3. eq (subtractive) — always: HPF via lowCutHz, cut mud with bodyDb if needed, avoid large boosts here
4. compressor — always; faster attack (3–10 ms) and ratio 4–8 for punch; add makeupDb 2–4 dB when loudnessDb is low
5. deesser — default on; lighter mix if centroid is already high (bright voice)
6. eq (additive) — when the style needs presence/air (bright, pop, radio); skip for dark, lo-fi, telephone
7. saturation — default light drive/mix for punch; more for gritty or aggressive
8. chorus / delay — only for wide, dreamy, slap, or spacious prompts
9. reverb — always unless the user asked for dry / no reverb / bone-dry; intimate = short decay and low mix, anthemic = longer and wetter

Do not skip eq, compressor, deesser, or reverb just to keep the chain short. Default mixes should feel forward and punchy, not washed out.

Catalog:
${CATALOG}

Recommended signal order reference: ${PROTOCOL_ORDER}

Adapting to the voice:
Centroid already high (bright voice): boost air less, deesser mix lower. Centroid low (dark voice): presence and air more.
Low loudness: gentler threshold and add makeup gain.
High noise floor: add gate, avoid heavy compression and large high-frequency boosts.

Descriptor guide:
warm: lowShelfDb +2 to +3, airDb -1 to 0, mild compression (ratio 2 to 3), reverb mix ~0.12
airy, bright: airDb +3 to +5, presenceDb +1 to +2
intimate, close: compressor ratio 3 to 4, short reverb (decay under 1 s, mix 0.12 or less), no delay
dreamy, spacious: reverb mix 0.3 to 0.45, decay 3 to 4.5 s, delay mix 0.15 to 0.25 at 350 to 450 ms, light chorus
punchy, aggressive: compressor ratio 5 to 8, attack 3 to 8 ms, release 60 to 120 ms, makeupDb 3 to 5, saturation drive 0.25 to 0.45, mix 0.2 to 0.35, presenceDb +3 to +5, bodyDb -2 if muddy
trap, autotune, T-Pain: autotune mix 0.7 to 1, speed 0.8 to 1, snap 0.85 to 1, then tight compression (ratio 5+, attack under 10 ms)
gritty, lo-fi: saturation mix 0.3 to 0.5, airDb -4, lowCutHz ~150
radio, telephone: lowCutHz ~300 Hz, airDb -6, presenceDb +4, skip second eq
wide, thick: chorus mix 0.25 to 0.35, short delay mix 0.1`;

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

export function promptRejectsSpace(prompt) {
  return /\b(dry|no reverb|bone-?dry|without reverb|a cappella dry)\b/i.test(prompt);
}

export function ensureMixProtocol(preset, prompt) {
  const chain = [...preset.chain];
  if (!chain.some((node) => node.type === 'eq')) {
    chain.unshift({
      type: 'eq',
      params: fillParams('eq', { lowCutHz: 80 }),
      why: 'Default high-pass cleanup',
    });
  }
  if (!chain.some((node) => node.type === 'reverb') && !promptRejectsSpace(prompt)) {
    chain.push({
      type: 'reverb',
      params: fillParams('reverb', { decaySec: 0.9, mix: 0.12 }),
      why: 'Short room by default',
    });
  }
  return validatePreset({ ...preset, chain });
}

function fallbackResult() {
  return { preset: validatePreset(fakePreset), source: 'fallback' };
}

function parseModelJson(content) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function isRetryable(error) {
  return error instanceof SyntaxError || error?.name === 'ZodError';
}

function userMessage(prompt, features, errorNote) {
  const lines = [
    `Prompt: ${prompt}`,
    `Features: ${JSON.stringify(features)}`,
  ];
  if (errorNote) {
    lines.push(`The previous output failed validation: ${errorNote.slice(0, 500)}`);
    lines.push('Return corrected JSON only.');
  }
  return lines.join('\n');
}

async function requestPreset(fetchImpl, token, model, prompt, features, errorNote) {
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
        { role: 'user', content: userMessage(prompt, features, errorNote) },
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
  return ensureMixProtocol(validated, prompt);
}

export async function generatePreset(prompt, features, options = {}) {
  const token = (options.token !== undefined ? options.token : process.env.HF_TOKEN)?.trim();
  const model = (options.model !== undefined ? options.model : process.env.HF_MODEL)?.trim();
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!token || !model) {
    return fallbackResult();
  }

  let errorNote = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const preset = await requestPreset(fetchImpl, token, model, prompt, features, errorNote);
      return { preset, source: 'model' };
    } catch (error) {
      if (attempt === 1 || !isRetryable(error)) {
        return fallbackResult();
      }
      errorNote = error instanceof Error ? error.message : 'Invalid preset JSON';
    }
  }
  return fallbackResult();
}
