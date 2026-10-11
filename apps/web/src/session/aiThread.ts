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

const MAX_STORED_TURNS_PER_TRACK = 20;

function isAiTurn(value: unknown): value is AiTurn {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const turn = value as Record<string, unknown>;
  return (
    typeof turn.prompt === 'string' &&
    typeof turn.name === 'string' &&
    typeof turn.explanation === 'string' &&
    typeof turn.source === 'string' &&
    typeof turn.at === 'number' &&
    Array.isArray(turn.summary) &&
    turn.summary.every((line) => typeof line === 'string')
  );
}

/** Restore AI chat from localStorage (ignores malformed entries). */
export function parseAiThreadState(raw: unknown): AiThreadState {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const out: AiThreadState = {};
  for (const [trackId, turns] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(turns)) {
      continue;
    }
    const valid = turns.filter(isAiTurn).slice(-MAX_STORED_TURNS_PER_TRACK);
    if (valid.length > 0) {
      out[trackId] = valid;
    }
  }
  return out;
}
