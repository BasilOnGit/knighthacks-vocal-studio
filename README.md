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
- React + TypeScript + Vite frontend with a vocal-style prompt form.
- Node API with health endpoint, prompt validation, request-size limit, and explicit unimplemented AI response.
- Hugging Face and Neon environment placeholders.
- Proposed PostgreSQL preset schema and a team build plan.

This is a starter scaffold, not a finished audio editor. AI generation currently returns HTTP 501. Recording, effects, export, and persistence still need implementation. Neon is the database; the Node server is the backend application.

## Checks
`npm test` checks backend prompt validation.
`npm run check` checks frontend TypeScript.
`npm run build` builds the frontend.

See [the build plan](docs/BUILD_PLAN.md) for work order and Cursor handoff.
