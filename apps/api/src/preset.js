import { fakePreset } from '../../../shared/fakePreset.ts';
import { buildMixingGuideForModel } from '../../../shared/mixingGuide.ts';
import { MAX_EFFECTS, PARAM_RANGES, fillParams } from '../../../shared/params.ts';
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

const MIXING_GUIDE = buildMixingGuideForModel();

const SYSTEM_PROMPT = `You are an expert vocal mixing engineer. Output JSON only, matching the schema, no prose.
Schema: {"name": string, "explanation": string, "chain": [{"type": string, "params": {parameter: number}, "why": string}]}
Use only catalog effects and parameters. Stay inside ranges. Never more than ${MAX_EFFECTS} effects.
The chain array is serial signal flow: index 0 processes the vocal first. The host applies your order exactly — it never re-sorts.
You choose which effects to include and their order based on the user's prompt and the voice features. Do not paste a default template chain every time.
You may include the same type more than once (e.g. two eq nodes). Write a short why per effect (mention placement when order is unusual).
The explanation field should summarize the sonic goal and why this chain order serves the prompt.
The code fills missing parameters and assigns ids.

Workflow (internal, before you write JSON):
1. Interpret the prompt (genre, mood, references, dry/wet, tuned/raw, bright/dark).
2. Select effects that match — omit what the prompt does not need.
3. Sequence them deliberately for that sound (not a fixed master bus order).
4. Set parameters using features and the catalog ranges.

Parameter habits:
compressor — kneeDb 6–12, mix 0.75–0.9 for parallel glue; ratio 3–6 intimate, 4–8 punchy; makeupDb 2–5 when loudnessDb is low
saturation — drive 0.08–0.2, mix 0.1–0.25 unless gritty/lo-fi requested
delay — mix usually under 0.25, feedback under 0.35 on leads
reverb — intimate: decay under 1 s, preDelay 20–40 ms, mix 0.08–0.14; spacious: decay 2–5 s, higher mix

${MIXING_GUIDE}

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

const LEADING_CLEANUP_TYPES = new Set(['gate', 'autotune']);

/** Insert EQ after gate/autotune blocks so model-chosen pitch/noise order is preserved. */
export function eqInsertIndex(chain) {
  let index = 0;
  while (index < chain.length && LEADING_CLEANUP_TYPES.has(chain[index].type)) {
    index += 1;
  }
  return index;
}

export function ensureMixProtocol(preset, prompt) {
  const chain = [...preset.chain];
  if (!chain.some((node) => node.type === 'eq')) {
    chain.splice(eqInsertIndex(chain), 0, {
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
    'Build a custom chain: choose effects and their order for this prompt and voice. Do not output a generic chain unless the prompt is generic.',
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
