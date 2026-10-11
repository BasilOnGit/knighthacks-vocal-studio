/**
 * Reference for the preset model: effect selection and signal-flow reasoning.
 * The host preserves chain order exactly — nothing re-sorts after generation.
 */

export const CHAIN_ORDER_RULES = `CHAIN ORDER (you decide — host keeps your array order):
- Pick which effects belong, then sequence them for the user's prompt. Do not default to a fixed template order.
- Reason about signal flow: pitch/tuning and noise cleanup before tone shaping; dynamics before time-based effects in most pop mixes, but creative orders are valid when the prompt implies it (e.g. distorted room, reverse space, lo-fi crush after reverb).
- Typical patterns (examples only — adapt or break them when the prompt calls for it):
  • Clean pop/rap lead: denoise? → gate? → autotune? → EQ cut → compressor → rider? → deesser → EQ boost? → saturation? → delay? → reverb
  • Intimate dry-ish: denoise? → EQ → compressor → deesser → light reverb (skip delay/chorus)
  • Dreamy/wide: EQ → compressor → deesser → doubler? → chorus? → delay (ping-pong?) → long reverb (delay before reverb keeps repeats clear)
  • Aggressive/trap: autotune → EQ → heavy compressor → deesser → saturation → short room
  • Lo-fi/telephone: EQ (band-limit) → saturation → light compressor → tiny room or none
- You may use the same effect twice (e.g. subtractive EQ then additive EQ). Give each a distinct why.
- Omit effects the prompt rejects (dry, no reverb, natural/unprocessed, etc.).`;

export const EFFECT_SELECTION_GUIDE = `EFFECT SELECTION (map user words + voice features to tools):
denoise — steady hiss/room tone, fan noise, laptop hum; use when noiseFloorDb is high or user asks to clean/denoise. Place early (before EQ/compression). Prefer denoise for constant noise; use gate for bleed between phrases.
gate — noisy room (high noiseFloorDb), bleed, inconsistent takes, room between words; skip on clean home recordings. Can follow denoise when both constant noise and gaps matter.
autotune — trap, hyperpop, T-Pain, polished pitch, modern R&B, "perfect" vocals; omit for raw, jazz, spoken word, natural.
eq — almost always at least once for HPF and tone; subtractive early (mud, rumble), additive when bright/airy/pop/radio.
compressor — almost always for vocal level control; lighter for intimate, heavier for punch/aggressive.
rider — even level without heavy squash: podcast, broadcast, whisper-to-loud singing, "smooth" dynamics; use after compressor when crestDb is high or loudness swings. Skip when user wants punchy/aggressive compression character.
deesser — default for sung vocals; set freqHz in the air band (8–14 kHz) so it tames sizzle without dulling 3–6 kHz. mix is strength (60–85 typical), not a dry/wet blend; raise thresholdDb if the take is already dull.
saturation — warmth, grit, lo-fi, tape, edge; omit for clean/polished vocals; keep drive/mix low unless the user wants distortion.
chorus — wide, lush, 80s, dreamy, modulated thickness; skip for dry intimate rap or podcast tone.
doubler — subtle width/thickness, "double tracked", stacked vocal, Haas width without obvious chorus; lighter than chorus. Skip for mono/dry podcast.
delay — slap, echo, spacious, rhythmic; keep mix low on lead vocals unless prompt emphasizes it. Set pingPong to 1 for stereo bounce (dream pop, EDM, wide mixes); 0 for mono slap (rap, intimate).
reverb — space and depth; skip only when user wants dry/bone-dry/no reverb. Lead vocals: short room to medium hall. Background/harmony/adlib layers are usually wetter than the lead — higher mix and longer size are normal, not a mistake. When the user asks for lush, drowned, ambient, or more reverb, use high catalog values (mix/size up to 100).`;

export const EFFECT_MIX_RULES = `EFFECT MIX (avoid stacked / double vocals):
autotune — mix is dry+wet parallel. NEVER use partial mix (no 30–70%). Use mix 100 whenever tuning is audible, or omit autotune / mix 0. Soften tuning with lower retuneSpeed (0.35–0.8) and snap (0.65–0.9), not mix.
compressor — serial dynamics: keep mix 100. Use lower ratio/threshold for lighter compression, not parallel mix.
deesser — mix is sibilance-band strength only (not dry/wet). Prefer 60–85 on sung vocals; ease off with higher thresholdDb, not mix near 50 unless sibilance is very mild.
saturation, delay, reverb, chorus, doubler — partial mix is normal (wet send level).`;

export const PROMPT_INTERPRETATION = `INTERPRET THE USER PROMPT (do this before building the chain):
1. Extract genre, mood, era, and references (e.g. "Billie Eilish whisper", "2000s pop punk", "podcast clean").
2. List desired traits: bright/dark, dry/wet, wide/mono, clean/gritty, tuned/raw, loud/soft.
3. Choose effects that produce those traits — not every effect on every preset.
4. Order the chain so each step makes sense for that story (document briefly in each why).
5. Set trackVolumeDb (−36 to +6 dB) when the prompt implies level: whisper/intimate/dreamy lower (−2 to −5), upfront/rap/anthem higher (+1 to +4), podcast/spoken near 0; nudge down if loudnessDb is hot, up if the take is quiet.
6. When other session tracks are provided, treat them as already mixed: match their role (e.g. second background vocal ≈ same or wetter space/level as the first BG — copy reverb mix/size from their chain when stacking). Sit new layers relative to them (quieter fader for BG/adlibs, similar or higher reverb/delay when harmonies should melt together). Do not fight the beat track.
7. Background, harmony, adlib, and ear-candy tracks: bias toward higher reverb/delay mix than the lead unless the prompt says dry/upfront. User requests for "more reverb" or wet space override conservative defaults — use the full parameter ranges.
8. Use voice features to tune parameters (not to copy a fixed chain):
   - High centroidHz → no presence boost, little or no airDb, deesser around 10–14 kHz
   - Low loudnessDb → gentler compressor threshold, makeupDb only 1–3
   - High noiseFloorDb → denoise (early), gate if gaps between phrases, cautious HF boosts, skip saturation
   - High crestDb or uneven loudnessDb → rider after compressor; lighter ratio on compressor
   - Low pitchStability → autotune or omit tuning per prompt; do not add chorus/doubler unless user wants width
   - Low centroidHz → a little airDb; avoid a narrow presence peak (sounds harsh on this engine)`;

export const STYLE_PRESETS = `STYLE → STARTING POINTS (vary order and omit as needed):
warm intimate: EQ cut → compressor (low ratio) → deesser → short reverb
airy pop: EQ cut → compressor → deesser → EQ boost (presence/air) → reverb
dreamy spacious: EQ → compressor → deesser → doubler → delay (pingPong 1) → long reverb
punchy aggressive: EQ → compressor (fast, higher ratio) → deesser → saturation → short reverb
trap/autotune: autotune → EQ → compressor → deesser → delay optional → room reverb
radio/telephone: EQ band-limit (high lowCut, cut air) → saturation → compressor → minimal reverb
lo-fi gritty: EQ → saturation → compressor → dark short reverb
wide doubles: EQ → compressor → deesser → doubler → chorus? → delay + reverb
podcast/broadcast: denoise → EQ → compressor → rider → deesser (no reverb unless asked)`;

export function buildMixingGuideForModel(): string {
  return [
    CHAIN_ORDER_RULES,
    EFFECT_SELECTION_GUIDE,
    EFFECT_MIX_RULES,
    PROMPT_INTERPRETATION,
    STYLE_PRESETS,
  ].join('\n\n');
}
