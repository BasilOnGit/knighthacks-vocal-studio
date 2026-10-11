export type AiTurn = {
  prompt: string;
  name: string;
  explanation: string;
  source: string;
  summary: string[];
  at: number;
};

export type AiThreadState = Record<string, AiTurn[]>;

export function appendAiTurn(
  threads: AiThreadState,
  trackId: string,
  turn: AiTurn,
): AiThreadState {
  const prior = threads[trackId] ?? [];
  return { ...threads, [trackId]: [...prior, turn] };
}

export function clearAiThread(threads: AiThreadState, trackId: string): AiThreadState {
  if (!threads[trackId]?.length) {
    return threads;
  }
  const next = { ...threads };
  delete next[trackId];
  return next;
}

export function historyForApi(threads: AiThreadState, trackId: string, limit = 5): { prompt: string }[] {
  const turns = threads[trackId] ?? [];
  return turns.slice(-limit).map((turn) => ({ prompt: turn.prompt }));
}
