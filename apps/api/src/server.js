import { createServer } from 'node:http';
import {
  validatePrompt,
  validateFeatures,
  validateCurrentPreset,
  validateCurrentTrackVolume,
  validateOtherTracks,
  validateHistory,
  generatePreset,
} from './preset.js';

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') return send(res, 200, { ok: true });
  if (req.method !== 'POST' || req.url !== '/api/presets/generate') return send(res, 404, { error: 'Not found' });
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 8192) {
        send(res, 413, { error: 'Request too large' });
        req.resume();
        return;
      }
      chunks.push(chunk);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      return send(res, 400, {
        error: 'Provide valid JSON with a vocal style description between 1 and 1000 characters.',
      });
    }
    let prompt;
    let features;
    let currentPreset;
    let currentTrackVolumeDb;
    let otherTracks;
    let history;
    try {
      prompt = validatePrompt(body);
      features = validateFeatures(body.features);
      currentPreset = validateCurrentPreset(body);
      currentTrackVolumeDb = validateCurrentTrackVolume(body);
      otherTracks = validateOtherTracks(body);
      history = validateHistory(body);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }
    send(
      res,
      200,
      await generatePreset(prompt, features, {
        currentPreset,
        currentTrackVolumeDb,
        otherTracks,
        history,
      }),
    );
  } catch (error) {
    send(res, error.status || 500, { error: error.status ? error.message : 'Unable to generate preset' });
  }
});

server.listen(Number(process.env.PORT || 3001), '127.0.0.1', () => console.log('Vocal Studio API ready'));
