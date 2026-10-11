export type VocalLayerRole = 'lead' | 'background' | 'adlib' | 'unknown';

const ADLIB_IN_PROMPT =
  /\b(adlib|ad-?libs?|ad lib|fills?|call and response|oohs?|ahhs?|vocal runs|runs and fills)\b/i;
const BG_IN_PROMPT =
  /\b(background vocal|bg vocal|backing vocal|harmonies?|harmony stack|stacked vocal|double tracked|bgv|bv layer)\b/i;
const WET_IN_PROMPT =
  /\b(more reverb|lots of reverb|heavy reverb|reverb heavy|lush|drowned|swimmy|wet|spacious|ambient|hall|cathedral|ethereal|floating|washy|shoegaze|dreamy)\b/i;

const ADLIB_IN_NAME = /\b(adlibs?|ad-?libs?|fill|oohs?|ahhs?)\b/i;
const BG_IN_NAME = /\b(bg|background|backing|harmony|harmonies|stack|double|bv)\b/i;

export function inferVocalLayerRole(prompt: string, trackName?: string): VocalLayerRole {
  const name = trackName?.trim() ?? '';
  if (ADLIB_IN_PROMPT.test(prompt) || (name && ADLIB_IN_NAME.test(name))) {
    return 'adlib';
  }
  if (BG_IN_PROMPT.test(prompt) || (name && BG_IN_NAME.test(name))) {
    return 'background';
  }
  return 'unknown';
}

export function promptRequestsWetSpace(prompt: string): boolean {
  return WET_IN_PROMPT.test(prompt);
}

/** Extra user-message lines for the preset model (not shown to end users). */
export function vocalLayerHintsForModel(
  prompt: string,
  trackName?: string,
): string[] {
  const role = inferVocalLayerRole(prompt, trackName);
  const lines: string[] = [];

  if (trackName?.trim()) {
    lines.push(`Current track name: ${trackName.trim().slice(0, 80)}`);
  }

  if (role === 'background') {
    lines.push(
      'Layer role: background / harmony vocal — sit behind the lead (trackVolumeDb often −4 to −10). Use wetter time-based FX than a lead: reverb mix commonly 35–65 (up to 75–90 when the prompt wants lush or drowned). Match or exceed reverb/delay on other background tracks in the session when stacking.',
    );
  } else if (role === 'adlib') {
    lines.push(
      'Layer role: adlib / ear-candy — can be wetter than the lead (reverb mix 45–80+; delay 20–45 when echo fits). User may want obvious space; full catalog values (mix/size up to 100) are allowed when they ask for wet, lush, or floating adlibs.',
    );
  }

  if (promptRequestsWetSpace(prompt)) {
    lines.push(
      'User asked for wet/space/reverb — treat habit ranges as starting points only. You may set reverb mix, sizePct, and tonePct anywhere in the catalog (0–100), including high mixes (70–100) and large rooms (size 55–100) when it serves the prompt.',
    );
  }

  return lines;
}

export const REVERB_GUIDANCE_FOR_MODEL = `REVERB (catalog 0–100 for mix, sizePct, tonePct — habits are not caps):
- Lead vocal: intimate/dry-ish 6–20 mix; standard pop/rap room 12–28; spacious lead 28–50.
- Background / harmony / stacked vocals: usually wetter than the lead — mix 35–65 typical; 65–85 when prompt implies lush, drowned, or floating; match sibling BG tracks' reverb when other tracks are provided.
- Adlibs / fills / ear candy: often 45–80+ mix; delay + long verb is common; go toward catalog max when user asks for heavy reverb or ambient wash.
- If the user asks for more reverb, wetter, hall, cathedral, dreamy, or shoegaze — raise mix and sizePct past conservative defaults; do not refuse high values.
- Only stay dry/minimal when the user explicitly wants dry, bone-dry, podcast, or no reverb.`;
