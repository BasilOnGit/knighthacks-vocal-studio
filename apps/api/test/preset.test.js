import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePrompt, generatePreset } from '../src/preset.js';
test('accepts trimmed descriptions',()=>assert.equal(validatePrompt({prompt:' R&B '}),'R&B'));
test('rejects malformed and oversized prompts',()=>{
  for (const body of [null,{}, {prompt:3},{prompt:'  '},{prompt:'a'.repeat(1001)}]) assert.throws(()=>validatePrompt(body));
});
test('unimplemented AI is explicit',async()=>assert.rejects(generatePreset('pop'),{status:501}));
