import test from 'node:test';
import assert from 'node:assert/strict';
import { clipAnalysisKey } from '../apps/web/src/session/clipAnalysis.ts';
import { newSnippet } from '../apps/web/src/session/snippets.ts';

test('clipAnalysisKey ignores mix and timeline position', () => {
  const buffer = { duration: 5 };
  const a = newSnippet(buffer, 'A', 'vocal', 0, 'a');
  const b = { ...a, volumeDb: -12, pan: -0.5, clipStartSec: 4, name: 'renamed' };
  assert.equal(clipAnalysisKey(a), clipAnalysisKey(b));
});

test('clipAnalysisKey changes when trim changes', () => {
  const buffer = { duration: 5 };
  const a = newSnippet(buffer, 'A', 'vocal', 0, 'a');
  const b = { ...a, trim: { start: 0.5, end: 4 } };
  assert.notEqual(clipAnalysisKey(a), clipAnalysisKey(b));
});
