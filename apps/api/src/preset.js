import { fakePreset } from '../../../shared/fakePreset.ts';
import { MAX_EFFECTS, PARAM_RANGES } from '../../../shared/params.ts';
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

const SYSTEM_PROMPT = `You choose which effects a vocal needs and set them. Output JSON only, matching the schema, no prose.
Schema: {"name": string, "explanation": string, "chain": [{"type": string, "params": {parameter: number}, "why": string}]}
Use only catalog effects and parameters. Stay inside ranges.
Include only effects that serve the description. Fewer is better. Never more than ${MAX_EFFECTS}.
Adapt to the measurements.
Write a short why for each effect and a one-sentence explanation.
The code fills missing parameters and sorts the chain. Omit effects that are not needed.

Catalog:
${CATALOG}

Adapting to the voice:
Centroid already high (bright voice): boost highs less. Centroid low (dark voice): boost presence and air more.
Low loudness: lower the compressor threshold less and add makeup gain.
High noise floor: avoid heavy compression and big high-frequency boosts.

Descriptor guide:
warm: lowShelf +2 to +3, highShelf -1 to 0, mild compression (ratio 2 to 3)
airy, bright: highShelf +3 to +5, presence +1 to +2
intimate, close: compressor ratio 3 to 4, short reverb (decay under 1 s, mix 0.12 or less), no delay
dreamy, spacious: reverb mix 0.3 to 0.45, decay 3 to 4.5 s, delay mix 0.15 to 0.25 at 350 to 450 ms, light chorus
punchy, aggressive: compressor ratio 4 to 6, attack 5 to 15 ms, saturation drive 0.3 to 0.5, presence +2
gritty, lo-fi: saturation mix 0.3 to 0.5, highShelf -4, lowCut ~150 Hz
radio, telephone: lowCut ~300 Hz, highShelf -6, presence +4
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
  return validatePreset(parseModelJson(content));
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
