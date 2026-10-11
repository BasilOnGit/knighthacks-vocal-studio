import type { EffectNode } from '../../../../shared/types';

export function moveChainNode(
  chain: EffectNode[],
  id: string,
  delta: -1 | 1,
): EffectNode[] {
  const index = chain.findIndex((node) => node.id === id);
  if (index < 0) {
    return chain;
  }
  const target = index + delta;
  if (target < 0 || target >= chain.length) {
    return chain;
  }
  const next = [...chain];
  const [node] = next.splice(index, 1);
  next.splice(target, 0, node);
  return next;
}
