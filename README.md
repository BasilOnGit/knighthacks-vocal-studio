# KnightHacks Vocal Studio (Waverio Studio)

Browser-based vocal DAW with real-time FX, multi-track recording, and AI-assisted preset generation. The web app runs the audio engine locally; the Node API handles preset generation via Hugging Face when configured.

## Requirements

- **Node.js 22+** and npm
- Modern Chromium-based browser (Web Audio, AudioWorklets, IndexedDB)

## Quick start

```bash
git clone https://github.com/glitchyxlatrell/knighthacks-vocal-studio.git
cd knighthacks-vocal-studio
npm install
```

Configure the API (optional for offline / fallback presets):

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` and set `HF_TOKEN` and `HF_MODEL` when you want live model generation. Never commit `.env` or secrets.

Run **two terminals**:

```bash
# Terminal 1 — API (port 3001)
npm run dev:api

# Terminal 2 — web UI (Vite; proxies /api → localhost:3001)
npm run dev:web
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Repo layout

| Path | Role |
|------|------|
| `apps/web` | React + Vite frontend, Tone.js engine, worklets, timeline UI |
| `apps/api` | Preset generation API, validation, HF integration |
| `shared/` | Preset types, effect params, seed library, mixing helpers |
| `tests/` | UI/engine unit tests (`npm run test:ui`) |

## What you can do

**Timeline & tracks**

- Multiple tracks (beat, vocal, custom), record or import audio, overlapping clips per track
- Trim clips on the waveform, drag clips between tracks, undo/redo
- Transport: play/pause, loop, scrub, mix export (WAV)
- Per-clip volume, pan, fades, mute; per-track mixer (level, mute, solo)

**Effects**

- Track-level chains (all clips on a track share the same FX): gate, denoise, rider, autotune, EQ, compressor, de-esser, saturation, chorus, delay, reverb
- Manual edits, saved presets (per browser tab), reset after AI generate
- Bypass FX toggle on the transport bar
- Formant-preserving autotune uses [Rubber Band](https://breakfastquay.com/rubberband/) via `rubberband-wasm` (GPLv2) in the browser

**AI assistant**

- Describe a sound in the **AI** inspector tab; optional follow-up turns per track
- Uses voice measurements from the selected track’s audio; can consider other tracks in the session
- API returns a validated preset; falls back to a local seed preset if the model call fails

**Projects & persistence**

- **Project tabs** in the top bar: switch, create (+), rename (double-click tab), delete (× when more than one project)
- Each project auto-saves to **localStorage** (session JSON) and **IndexedDB** (clip audio)
- Up to 16 projects in this browser; data stays on the device

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` / `npm run dev:web` | Vite dev server |
| `npm run dev:api` | API with watch |
| `npm run build` | Production web build |
| `npm run check` | Typecheck `apps/web` |
| `npm test` | API tests (`apps/api`) |
| `npm run test:ui` | Shared + web logic tests in `tests/` |

## Environment (`apps/api/.env`)

| Variable | Purpose |
|----------|---------|
| `PORT` | API port (default `3001`) |
| `HF_TOKEN` | Hugging Face token for generation |
| `HF_MODEL` | Model id for generation |
| `DATABASE_URL` | Optional Neon / Postgres (placeholders in repo) |

## Docs

- [Build plan](docs/BUILD_PLAN.md) — milestones and handoff
- [UI ↔ API handoff](docs/UI_BACKEND_HANDOFF.md) — integration and manual checks

## License note

Third-party audio components (including Rubber Band) carry their own licenses. See dependency licenses and the Rubber Band site for distribution terms if you ship binaries or WASM publicly.
