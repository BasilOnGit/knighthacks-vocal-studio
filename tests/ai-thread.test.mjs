import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAiThreadState, historyForApi } from '../apps/web/src/session/aiThread.ts';

test('parseAiThreadState keeps valid turns and drops garbage', () => {
  const raw = {
    vocal: [
      {
        prompt: 'dream pop',
        name: 'Dream pop',
        explanation: 'Airy',
        source: 'model',
        summary: ['Added reverb'],
        at: 1,
      },
      { prompt: 'broken' },
    ],
    beat: 'not-an-array',
  };
  const state = parseAiThreadState(raw);
  assert.equal(state.vocal?.length, 1);
  assert.equal(state.vocal?.[0].prompt, 'dream pop');
  assert.equal(state.beat, undefined);
});

test('historyForApi returns prior prompts only', () => {
  const threads = {
    vocal: [
      {
        prompt: 'warm R&B',
        name: 'Warm',
        explanation: 'x',
        source: 'fallback',
        summary: [],
        at: 1,
      },
      {
        prompt: 'less reverb',
        name: 'Warm',
        explanation: 'y',
        source: 'model',
        summary: [],
        at: 2,
      },
    ],
  };
  assert.deepEqual(historyForApi(threads, 'vocal'), [{ prompt: 'warm R&B' }, { prompt: 'less reverb' }]);
});
