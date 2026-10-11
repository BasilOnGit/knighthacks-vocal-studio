import React from 'react';
import type { SessionEngine } from '../engine/SessionEngine';
import { clampTimelineSec } from '../session/timelineCoords';

export type SeekPhase = 'scrub' | 'commit';

type Options = {
  engineRef: React.RefObject<SessionEngine | null>;
  timelineDurationSec: number;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  recording: boolean;
  recordPending: boolean;
};

/**
 * Playhead + transport: seeks use synchronous `SessionEngine.seekTo` when possible
 * so jumps while playing do not pass through an async restart gap.
 */
export function usePlayheadTransport({
  engineRef,
  timelineDurationSec,
  playing,
  setPlaying,
  recording,
  recordPending,
}: Options) {
  const [positionSec, setPositionSec] = React.useState(0);
  const positionRef = React.useRef(0);
  const scrubbingRef = React.useRef(false);
  const resumePlaybackAfterScrubRef = React.useRef(false);
  const wantsTransportRef = React.useRef(false);
  const playRequestRef = React.useRef(0);

  const transportLocked = recording || recordPending;

  const clamp = React.useCallback(
    (sec: number) => clampTimelineSec(sec, timelineDurationSec),
    [timelineDurationSec],
  );

  const applyPosition = React.useCallback(
    (sec: number) => {
      const next = clamp(sec);
      positionRef.current = next;
      setPositionSec(next);
      return next;
    },
    [clamp],
  );

  const interruptEngine = React.useCallback(() => {
    playRequestRef.current += 1;
    engineRef.current?.interruptPlayback();
  }, [engineRef]);

  const stopEngine = React.useCallback(() => {
    wantsTransportRef.current = false;
    playRequestRef.current += 1;
    engineRef.current?.stop();
    setPlaying(false);
  }, [engineRef, setPlaying]);

  const trySyncSeek = React.useCallback(
    (sec: number, requestId: number): boolean => {
      const engine = engineRef.current;
      if (!engine) {
        return false;
      }
      const ok = engine.seekTo(sec);
      if (requestId !== playRequestRef.current) {
        return false;
      }
      if (!ok) {
        return false;
      }
      wantsTransportRef.current = true;
      setPlaying(true);
      return true;
    },
    [engineRef, setPlaying],
  );

  const startEngineAt = React.useCallback(
    async (sec: number): Promise<boolean> => {
      const requestId = ++playRequestRef.current;
      wantsTransportRef.current = true;
      const at = clamp(sec);
      applyPosition(at);

      if (trySyncSeek(at, requestId)) {
        return true;
      }

      try {
        const started = await engineRef.current?.play(at, () =>
          clamp(positionRef.current),
        );
        if (requestId !== playRequestRef.current) {
          return false;
        }
        if (!started) {
          wantsTransportRef.current = false;
          setPlaying(false);
          return false;
        }
        wantsTransportRef.current = true;
        setPlaying(true);
        return true;
      } catch {
        if (requestId === playRequestRef.current) {
          wantsTransportRef.current = false;
          setPlaying(false);
        }
        return false;
      }
    },
    [applyPosition, clamp, engineRef, setPlaying, trySyncSeek],
  );

  const shouldKeepTransport = React.useCallback(
    () => wantsTransportRef.current || playing || resumePlaybackAfterScrubRef.current,
    [playing],
  );

  const resumeAt = React.useCallback(
    (sec: number) => {
      const at = clamp(sec);
      applyPosition(at);
      const requestId = ++playRequestRef.current;
      wantsTransportRef.current = true;
      if (!trySyncSeek(at, requestId)) {
        void startEngineAt(clamp(positionRef.current));
      }
    },
    [applyPosition, clamp, positionRef, startEngineAt, trySyncSeek],
  );

  const seek = React.useCallback(
    (sec: number, phase: SeekPhase) => {
      if (transportLocked) {
        return;
      }
      const next = clamp(sec);
      if (phase === 'scrub') {
        if (!scrubbingRef.current) {
          scrubbingRef.current = true;
          resumePlaybackAfterScrubRef.current = shouldKeepTransport();
          interruptEngine();
          if (resumePlaybackAfterScrubRef.current) {
            setPlaying(false);
          }
        }
        applyPosition(next);
        return;
      }

      scrubbingRef.current = false;
      if (resumePlaybackAfterScrubRef.current) {
        resumePlaybackAfterScrubRef.current = false;
        resumeAt(next);
      } else {
        applyPosition(next);
      }
    },
    [
      applyPosition,
      clamp,
      interruptEngine,
      resumeAt,
      shouldKeepTransport,
      transportLocked,
      setPlaying,
    ],
  );

  const jumpTo = React.useCallback(
    (sec: number) => {
      if (transportLocked) {
        return;
      }
      const next = clamp(sec);
      const restart = shouldKeepTransport() && !scrubbingRef.current;
      scrubbingRef.current = false;
      resumePlaybackAfterScrubRef.current = false;
      if (!restart) {
        interruptEngine();
      }
      applyPosition(next);
      if (restart) {
        resumeAt(next);
      }
    },
    [applyPosition, clamp, interruptEngine, resumeAt, shouldKeepTransport, transportLocked],
  );

  const stopPlayback = React.useCallback(
    (resetToStart = false) => {
      playRequestRef.current += 1;
      scrubbingRef.current = false;
      resumePlaybackAfterScrubRef.current = false;
      stopEngine();
      if (resetToStart) {
        applyPosition(0);
      }
    },
    [applyPosition, stopEngine],
  );

  const syncFromEngine = React.useCallback(() => {
    if (scrubbingRef.current || transportLocked) {
      return;
    }
    const engine = engineRef.current;
    if (!engine?.isTransportActive()) {
      return;
    }
    const sec = engine.getSeconds();
    if (Number.isFinite(sec)) {
      applyPosition(sec);
    }
  }, [applyPosition, engineRef, transportLocked]);

  const onPlaybackEnded = React.useCallback(() => {
    playRequestRef.current += 1;
    wantsTransportRef.current = false;
    setPlaying(false);
    syncFromEngine();
  }, [setPlaying, syncFromEngine]);

  return {
    positionSec,
    positionRef,
    scrubbingRef,
    applyPosition,
    seek,
    jumpTo,
    startEngineAt,
    stopPlayback,
    syncFromEngine,
    onPlaybackEnded,
  };
}
