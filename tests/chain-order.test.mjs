import test from 'node:test';
import assert from 'node:assert/strict';
import { moveChainNode } from '../apps/web/src/session/chainOrder.ts';

test('moveChainNode swaps the last node up', () => {
  const chain = [
    { id: 'a', type: 'eq', enabled: true, params: {} },
    { id: 'b', type: 'delay', enabled: true, params: {} },
  ];
  const moved = moveChainNode(chain, 'b', -1);
  assert.deepEqual(moved.map((node) => node.id), ['b', 'a']);
});
