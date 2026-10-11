/**
 * Reference for the preset model: effect selection and signal-flow reasoning.
 * The host preserves chain order exactly — nothing re-sorts after generation.
 */

export const CHAIN_ORDER_RULES = `CHAIN ORDER (you decide — host keeps your array order):
- Pick which effects belong, then sequence them for the user's prompt. Do not default to a fixed template order.
- Reason about signal flow: pitch/tuning and noise cleanup before tone shaping; dynamics before time-based effects in most pop mixes, but creative orders are valid when the prompt implies it (e.g. distorted room, reverse space, lo-fi crush after reverb).
- Typical patterns (examples only — adapt or break them when the prompt calls for it):
  • Clean pop/rap lead: gate? → autotune? → EQ cut → compressor → deesser → EQ boost? → saturation? → delay? → reverb
  • Intimate dry-ish: EQ → compressor → deesser → light reverb (skip delay/chorus)
  • Dreamy/wide: EQ → compressor → deesser → chorus → delay → long reverb (delay before reverb keeps repeats clear)
  • Aggressive/trap: autotune → EQ → heavy compressor → deesser → saturation → short room
  • Lo-fi/telephone: EQ (band-limit) → saturation → light compressor → tiny room or none
- You may use the same effect twice (e.g. subtractive EQ then additive EQ). Give each a distinct why.
- Omit effects the prompt rejects (dry, no reverb, natural/unprocessed, etc.).`;

export const EFFECT_SELECTION_GUIDE = `EFFECT SELECTION (map user words + voice features to tools):
gate — noisy room (high noiseFloorDb), bleed, inconsistent takes; skip on clean home recordings.
autotune — trap, hyperpop, T-Pain, polished pitch, modern R&B, "perfect" vocals; omit for raw, jazz, spoken word, natural.
eq — almost always at least once for HPF and tone; subtractive early (mud, rumble), additive when bright/airy/pop/radio.
compressor — almost always for vocal level control; lighter for intimate, heavier for punch/aggressive.
deesser — default for sung vocals; reduce mix if centroidHz is already very high (bright voice).
saturation — warmth, grit, lo-fi, tape, edge; keep drive/mix low unless user wants distortion.
chorus — wide, lush, 80s, dreamy, thick doubles; skip for dry intimate rap or podcast tone.
delay — slap, echo, spacious, rhythmic; keep mix low on lead vocals unless prompt emphasizes it.
reverb — space and depth; skip only when user wants dry/bone-dry/no reverb. Short decay for intimate, long for anthem/dreamy.`;

export const PROMPT_INTERPRETATION = `INTERPRET THE USER PROMPT (do this before building the chain):
1. Extract genre, mood, era, and references (e.g. "Billie Eilish whisper", "2000s pop punk", "podcast clean").
2. List desired traits: bright/dark, dry/wet, wide/mono, clean/gritty, tuned/raw, loud/soft.
3. Choose effects that produce those traits — not every effect on every preset.
4. Order the chain so each step makes sense for that story (document briefly in each why).
5. Use voice features to tune parameters (not to copy a fixed chain):
   - High centroidHz → less air boost, lighter deesser
   - Low loudnessDb → gentler compressor threshold, more makeupDb
   - High noiseFloorDb → gate, cautious HF boosts and heavy saturation
   - Low centroidHz → more presence/air in EQ`;

export const STYLE_PRESETS = `STYLE → STARTING POINTS (vary order and omit as needed):
warm intimate: EQ cut → compressor (low ratio) → deesser → short reverb
airy pop: EQ cut → compressor → deesser → EQ boost (presence/air) → reverb
dreamy spacious: EQ → compressor → deesser → chorus → delay → long reverb
punchy aggressive: EQ → compressor (fast, higher ratio) → deesser → saturation → short reverb
trap/autotune: autotune → EQ → compressor → deesser → delay optional → room reverb
radio/telephone: EQ band-limit (high lowCut, cut air) → saturation → compressor → minimal reverb
lo-fi gritty: EQ → saturation → compressor → dark short reverb
wide doubles: EQ → compressor → deesser → chorus + delay + reverb`;

export function buildMixingGuideForModel(): string {
  return [CHAIN_ORDER_RULES, EFFECT_SELECTION_GUIDE, PROMPT_INTERPRETATION, STYLE_PRESETS].join(
    '\n\n',
  );
}
