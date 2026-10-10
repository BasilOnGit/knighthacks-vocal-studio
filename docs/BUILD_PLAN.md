# KnightHacks build plan
Goal: describe a vocal style → Hugging Face produces effect settings → apply settings to uploaded/recorded audio → compare and export.

## Work order
1. Both: clone, install, run frontend/API, agree on a preset JSON contract.
2. Partner / Cursor: choose a Hugging Face model and provider supported by your account; implement apps/api/src/preset.js with timeout, error handling, JSON extraction, schema validation, and numeric clamping. Keep tokens server-side.
3. Latrell: build file upload and browser microphone recording; test permissions and playback. Keep audio local for the first demo.
4. Partner / Cursor: build an audio graph for reverb, delay, EQ, gain, and compression. Use identical settings for preview and offline export.
5. Both: connect generated settings to effects; add dry/wet comparison, controls, and WAV export. Pitch shifting requires a dedicated algorithm/library; changing playback speed also changes duration. Do not label playback-rate changes as pitch correction.
6. Optional: connect Neon from the API and add save/load presets. Neon stores data; the API runs model requests and application logic.
7. Both: test the demo flow, invalid model output, unavailable model, microphone denial, large files, clipping, and export. Prepare a 60-second demo and backup recording.

## Suggested preset contract
Agree on ranges before coding: name, reverbMix (0–1), delayMs (0–1000), delayFeedback (0–0.8), delayMix (0–1), lowGainDb (-12–12), midGainDb (-12–12), highGainDb (-12–12), outputGainDb (-24–6).
Add pitchSemitones only when a pitch shifter is implemented. Model output must never execute code.
Record the selected model ID, provider, license, and required environment variables in README.

## Definition of demo ready
A real Hugging Face response changes audible effects on real audio. User can compare original and processed audio, then export a playable file.
Current scaffold does not yet implement inference, recording, DSP, export, or database access.

## Cursor handoff
Read this plan and README first. Implement one milestone at a time. Keep the preset contract stable, avoid exposing secrets to the frontend, and report tests and unfinished behavior after each milestone.
