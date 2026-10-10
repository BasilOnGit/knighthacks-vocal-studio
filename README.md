# KnightHacks Vocal Studio
AI assisted vocal effects studio using Hugging Face models to generate and apply custom presets.

## Start locally
Install Node.js 22+ and npm, then:
```bash
git clone https://github.com/glitchyxlatrell/knighthacks-vocal-studio.git
cd knighthacks-vocal-studio
npm install
npm run dev:api
```
In a second terminal, run `npm run dev:web` and open the URL Vite prints.
Copy `apps/api/.env.example` to `apps/api/.env` when configuring integrations. Never commit tokens or database credentials.

## What is included
- Record a vocal, trim it on a waveform, and play the trimmed clip.
- Measure the take (loudness, brightness, pitch) and show warnings.
- Apply an editable effect chain (gate, autotune, EQ, compressor, de-esser, saturation, chorus, delay, reverb) with a dry/processed toggle.
- Node API that validates the prompt and voice measurements, calls Hugging Face when `HF_TOKEN` and `HF_MODEL` are set, and returns a labeled fallback preset if that call fails.
- Hugging Face and Neon environment placeholders, plus the team build plan.

The updated studio supports audio imports, recording onto multiple tracks, overlapping snippets, per-snippet effects, waveform trimming, clip deletion with Backspace/Delete, microphone monitoring, and track/master mixing. Desktop controls fit within the viewport; track and inspector panels scroll independently. Export and saved sessions are not implemented. Neon is the database; the Node server is the backend application.

## Checks
`npm test` checks backend prompt validation.
`npm run test:ui` checks clip editing, snippet operations, and audio scheduling using a mocked audio engine.
`npm run check` checks frontend TypeScript.
`npm run build` builds the frontend.

See [the build plan](docs/BUILD_PLAN.md) for work order and Cursor handoff.
See [the UI/backend handoff](docs/UI_BACKEND_HANDOFF.md) for integration points and manual verification.
