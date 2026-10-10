# UI and backend handoff

## Run this branch

Use Node.js 22+, run `npm ci`, then run `npm run dev:api` and `npm run dev:web` in separate terminals. Configure `apps/api/.env` from the existing example for Hugging Face. The existing Vite proxy routes `/api` to the API server; production hosting needs equivalent routing.

## Preset integration

The UI keeps the existing `POST /api/presets/generate` contract: JSON `{ prompt, features }`, with measured voice features from the selected snippet. It expects `{ preset, source }`, validates the preset with `shared/validate.ts`, and applies it to the snippet selected when the request started. An error response may include `{ error }`. Existing shared effect types and parameter definitions are unchanged. The Node API and its Hugging Face integration are preserved in this branch.

The preset lives on each snippet, rather than on one global vocal track. `apps/web/src/main.tsx` owns session state and the request. `session/snippets.ts` defines snippets and editing helpers; `engine/SessionEngine.ts` schedules overlapping clips and creates independent effect chains. `InputPanel.tsx`, `engine/monitor.ts`, and `engine/recorder.ts` handle browser microphone input and raw monitoring.

## Session data

Audio buffers, tracks, snippets, mix settings, and generated presets currently live in browser memory. There are no session persistence, upload, export, or authentication endpoints connected. Audio files are decoded locally. Clip source offsets and timeline position are separate: `clipStartSec` can be negative after a trimmed clip is moved to zero; its audible timeline start remains nonnegative. Preserve this distinction when adding persistence.

## Verify integration

Run `npm run build`, `npm test`, and `npm run test:ui`. UI scheduling tests use mocked Tone nodes; they do not replace real audio testing. In a browser, check microphone permission/device selection, recording several takes on different tracks, overlapping playback, trimming/restoring and moving to zero, Backspace deletion outside text fields, per-clip effects, and mute/solo/master/dry controls. Check the compact layout at laptop sizes and the mobile view tabs.

With the API running, generate a preset for a selected clip and confirm successful model and fallback responses are labeled correctly. Verify that changing selection while generation runs updates the original clip. The private preview at https://vocal-studio-ui-test.cosmicray4.chatgpt.site is a frontend-only test deployment; it has no API backend.
