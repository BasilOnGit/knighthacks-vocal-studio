import React from 'react';
import { createRoot } from 'react-dom/client';
import { analyze, featureWarnings } from './analysis/analyze';
import { decodeAudioFile } from './audio/decodeAudioFile';
import { PlaybackEngine } from './engine/Engine';
import { Recorder } from './engine/recorder';
import type { Preset, TrimRange } from '../../../shared/types';
import {
  canAddSessionLane,
  createExtraTrack,
  MAX_SESSION_LANES,
  sortExtraTracks,
  type ExtraTrack,
} from './session/extraTracks';
import { timelineClipStartSec, trimDurationSec } from './audio/sliceBuffer';
import {
  clipTimelineEndSec,
  clipTimelineStartSec,
  createSessionClip,
  type SessionAudioClip,
} from './session/clip';
import { computeTimelineDurationSec } from './session/timeline';
import { AudioImportRow } from './ui/AudioImportRow';
import { TimelinePlayhead } from './ui/TimelinePlayhead';
import { TimelineRuler } from './ui/TimelineRuler';
import { BeatRow } from './ui/BeatRow';
import { EffectsPanel } from './ui/EffectsPanel';
import { FeatureList } from './ui/FeatureList';
import { PromptBox } from './ui/PromptBox';
import { TopBar } from './ui/TopBar';
import { VocalRow } from './ui/VocalRow';
import './style.css';

function chainSignature(preset: Preset | null): string {
  if (!preset) {
    return '';
  }
  return preset.chain.map((node) => `${node.id}:${node.type}`).join('|');
}

function App() {
  const recorderRef = React.useRef(new Recorder());
  const recordBusyRef = React.useRef(false);
  const generateLock = React.useRef(false);
  const [prompt, setPrompt] = React.useState('');
  const [preset, setPreset] = React.useState<Preset | null>(null);
  const [aiPreset, setAiPreset] = React.useState<Preset | null>(null);
  const [source, setSource] = React.useState<string | null>(null);
  const [generateError, setGenerateError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [dry, setDry] = React.useState(false);
  const [masterDb, setMasterDb] = React.useState(0);
  const [recording, setRecording] = React.useState(false);
  const [vocalBuffer, setVocalBuffer] = React.useState<AudioBuffer | null>(null);
  const [trim, setTrim] = React.useState<TrimRange | null>(null);
  const [recordError, setRecordError] = React.useState<string | null>(null);
  const [beatClip, setBeatClip] = React.useState<SessionAudioClip | null>(null);
  const [beatImportBusy, setBeatImportBusy] = React.useState(false);
  const [beatImportError, setBeatImportError] = React.useState<string | null>(null);
  const [extraTracks, setExtraTracks] = React.useState<ExtraTrack[]>([]);
  const [trackImportBusyId, setTrackImportBusyId] = React.useState<string | null>(null);
  const [trackImportError, setTrackImportError] = React.useState<string | null>(null);
  const [playheadSec, setPlayheadSec] = React.useState(0);
  const [vocalClipStartSec, setVocalClipStartSec] = React.useState(0);
  const [recordingElapsedSec, setRecordingElapsedSec] = React.useState(0);
  const recordPerfStartRef = React.useRef<number | null>(null);
  const engineRef = React.useRef<PlaybackEngine | null>(null);
  if (engineRef.current == null) {
    engineRef.current = new PlaybackEngine({
      onEnded: () => {
        setPlaying(false);
        setPlayheadSec(0);
      },
    });
  }
  const engine = engineRef.current;

  const features = React.useMemo(() => {
    if (!vocalBuffer || !trim) {
      return null;
    }
    return analyze(vocalBuffer, trim.start, trim.end);
  }, [vocalBuffer, trim]);

  React.useEffect(() => {
    if (vocalBuffer && trim) {
      engine.setVocal(
        vocalBuffer,
        trim,
        timelineClipStartSec(vocalClipStartSec, trim),
      );
    } else {
      engine.clearVocal();
    }
  }, [engine, vocalBuffer, trim, vocalClipStartSec]);

  React.useEffect(() => {
    if (beatClip) {
      engine.setBeatClip(
        beatClip.buffer,
        beatClip.trim,
        clipTimelineStartSec(beatClip),
      );
    } else {
      engine.clearBeatClip();
    }
  }, [engine, beatClip]);

  React.useEffect(() => {
    for (const track of extraTracks) {
      if (track.clip) {
        engine.setAuxClip(
          track.id,
          track.clip.buffer,
          track.clip.trim,
          clipTimelineStartSec(track.clip),
        );
      } else {
        engine.clearAuxClip(track.id);
      }
    }
  }, [engine, extraTracks]);

  const chainKey = chainSignature(preset);

  React.useEffect(() => {
    if (preset) {
      engine.setPreset(preset, { pitchHz: features?.pitchHz ?? 0 });
    }
    // Rebuild only when effect ids or types change. Slider edits keep this key stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, chainKey, features?.pitchHz]);

  React.useEffect(() => {
    if (!playing) {
      return;
    }
    let frame = 0;
    const tick = () => {
      setPlayheadSec(engine.getSeconds());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engine, playing]);

  React.useEffect(() => {
    if (!recording) {
      recordPerfStartRef.current = null;
      setRecordingElapsedSec(0);
      return;
    }
    recordPerfStartRef.current = performance.now();
    const interval = window.setInterval(() => {
      const start = recordPerfStartRef.current;
      if (start == null) {
        return;
      }
      const elapsed = (performance.now() - start) / 1000;
      setRecordingElapsedSec(elapsed);
      setPlayheadSec(vocalClipStartSec + elapsed);
    }, 50);
    return () => window.clearInterval(interval);
  }, [recording, vocalClipStartSec]);

  function stopPlayback() {
    engine.stop();
    setPlaying(false);
    if (!recording) {
      setPlayheadSec(0);
    }
  }

  function play() {
    if (!canPlay || recording) {
      return;
    }
    engine.play(playheadSec);
    setPlaying(true);
  }

  async function importAudioFile(
    file: File,
    placeAtSec: number,
    onClip: (clip: SessionAudioClip) => void,
    setBusy: (busy: boolean) => void,
    setError: (message: string | null) => void,
  ) {
    setBusy(true);
    setError(null);
    try {
      const buffer = await decodeAudioFile(file);
      if (playing) {
        stopPlayback();
      }
      onClip(createSessionClip(buffer, file.name, placeAtSec));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not decode audio file.');
    } finally {
      setBusy(false);
    }
  }

  async function startRecord() {
    if (recordBusyRef.current || recording) {
      return;
    }
    recordBusyRef.current = true;
    setRecordError(null);
    const recordAtSec = playing ? engine.getSeconds() : playheadSec;
    stopPlayback();
    setVocalClipStartSec(recordAtSec);
    setPlayheadSec(recordAtSec);
    try {
      await recorderRef.current.start();
      setRecording(true);
    } catch (error) {
      setRecording(false);
      setRecordError(
        error instanceof Error ? error.message : 'Could not access the microphone.',
      );
    } finally {
      recordBusyRef.current = false;
    }
  }

  async function stopRecord() {
    if (recordBusyRef.current || !recording) {
      return;
    }
    recordBusyRef.current = true;
    setRecordError(null);
    try {
      const buffer = await recorderRef.current.stop();
      const nextTrim = { start: 0, end: buffer.duration };
      engine.setVocal(buffer, nextTrim, vocalClipStartSec);
      setVocalBuffer(buffer);
      setTrim(nextTrim);
    } catch (error) {
      setRecordError(error instanceof Error ? error.message : 'Recording failed.');
    } finally {
      setRecording(false);
      recordBusyRef.current = false;
    }
  }

  function transportStop() {
    if (recording) {
      void stopRecord();
      return;
    }
    stopPlayback();
  }

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (generateLock.current || !features || !prompt.trim()) {
      return;
    }
    generateLock.current = true;
    setBusy(true);
    setGenerateError(null);
    try {
      const response = await fetch('/api/presets/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), features }),
      });
      const data = (await response.json().catch(() => null)) as {
        preset?: Preset;
        source?: unknown;
        error?: unknown;
      } | null;
      if (!response.ok || !data?.preset || typeof data.source !== 'string') {
        const message =
          data && typeof data.error === 'string'
            ? data.error
            : 'Could not generate a preset.';
        throw new Error(message);
      }
      const next = data.preset;
      const rebuildsViaEffect = chainSignature(next) !== chainSignature(preset);
      setAiPreset(structuredClone(next));
      setPreset(next);
      setSource(data.source);
      if (!rebuildsViaEffect) {
        engine.setPreset(next, { pitchHz: features?.pitchHz ?? 0 });
      }
    } catch (error) {
      const message =
        error instanceof Error && !(error instanceof TypeError)
          ? error.message
          : 'Could not generate a preset.';
      setGenerateError(message);
    } finally {
      generateLock.current = false;
      setBusy(false);
    }
  }

  function changeParam(id: string, key: string, value: number) {
    setPreset((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        chain: current.chain.map((node) =>
          node.id === id ? { ...node, params: { ...node.params, [key]: value } } : node,
        ),
      };
    });
    engine.updateParam(id, key, value);
  }

  function changeEnabled(id: string, enabled: boolean) {
    setPreset((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        chain: current.chain.map((node) => (node.id === id ? { ...node, enabled } : node)),
      };
    });
    engine.setEnabled(id, enabled);
  }

  function resetPreset() {
    if (!aiPreset) {
      return;
    }
    const next = structuredClone(aiPreset);
    setPreset(next);
    for (const node of next.chain) {
      engine.setEnabled(node.id, node.enabled);
      for (const [key, value] of Object.entries(node.params)) {
        engine.updateParam(node.id, key, value);
      }
    }
  }

  const hasVocalClip =
    vocalBuffer != null && trim != null && trimDurationSec(trim) > 0 && !recording;
  const hasBeatClip = beatClip != null && trimDurationSec(beatClip.trim) > 0;
  const hasAuxClip = extraTracks.some(
    (track) => track.clip != null && trimDurationSec(track.clip.trim) > 0,
  );
  const canPlay = (hasVocalClip || hasBeatClip || hasAuxClip) && !recording;
  const canAddTrack = canAddSessionLane(extraTracks);
  const sortedExtraTracks = sortExtraTracks(extraTracks);

  const vocalClipEndSec =
    vocalBuffer && trim && !recording
      ? timelineClipStartSec(vocalClipStartSec, trim) + trimDurationSec(trim)
      : 0;
  const recordingEndSec = recording ? vocalClipStartSec + recordingElapsedSec : 0;
  const beatClipEndSec = beatClip ? clipTimelineEndSec(beatClip) : 0;
  const auxClipEndSec = extraTracks.map((track) =>
    track.clip ? clipTimelineEndSec(track.clip) : 0,
  );
  const timelineDurationSec = computeTimelineDurationSec(
    [vocalClipEndSec, recordingEndSec, beatClipEndSec, ...auxClipEndSec].filter((n) => n > 0),
  );

  function seekTimeline(sec: number) {
    const clamped = Math.max(0, Math.min(sec, timelineDurationSec));
    if (playing) {
      engine.play(clamped);
    } else {
      engine.seek(clamped);
    }
    setPlayheadSec(clamped);
  }

  function addTrack() {
    setExtraTracks((current) => {
      const next = createExtraTrack(current);
      return next ? [...current, next] : current;
    });
  }

  function removeTrack(id: string) {
    engine.clearAuxClip(id);
    setExtraTracks((current) => current.filter((track) => track.id !== id));
  }

  function updateBeatClip(updater: (clip: SessionAudioClip) => SessionAudioClip) {
    setBeatClip((current) => (current ? updater(current) : current));
  }

  function updateTrackClip(
    trackId: string,
    updater: (clip: SessionAudioClip) => SessionAudioClip,
  ) {
    setExtraTracks((current) =>
      current.map((track) =>
        track.id === trackId && track.clip ? { ...track, clip: updater(track.clip) } : track,
      ),
    );
  }

  return (
    <div className="daw">
      <TopBar
        playing={playing}
        recording={recording}
        canPlay={canPlay}
        positionSec={playheadSec}
        dry={dry}
        masterDb={masterDb}
        onPlay={play}
        onRecord={() => {
          void startRecord();
        }}
        onStop={transportStop}
        onDryChange={(next) => {
          setDry(next);
          engine.setBypass(next);
        }}
        onMasterDbChange={setMasterDb}
      />
      <div className="daw-arrangement">
        <div className="arrangement-h-scroll">
          <div
            className="arrangement-canvas"
            style={{ '--timeline-sec': timelineDurationSec } as React.CSSProperties}
          >
            <TimelineRuler
              durationSec={timelineDurationSec}
              seekDisabled={recording}
              onSeek={seekTimeline}
            />
            <BeatRow
              timelineDurationSec={timelineDurationSec}
              clip={beatClip}
              importBusy={beatImportBusy}
              importError={beatImportError}
              onImportFile={(file) => {
                void importAudioFile(
                  file,
                  playheadSec,
                  setBeatClip,
                  setBeatImportBusy,
                  setBeatImportError,
                );
              }}
              onTrimChange={(next) => {
                if (playing) {
                  stopPlayback();
                }
                updateBeatClip((clip) => ({ ...clip, trim: next }));
              }}
              onClipTimelineStartChange={(timelineStart) => {
                if (playing) {
                  stopPlayback();
                }
                updateBeatClip((clip) => ({
                  ...clip,
                  clipStartSec: Math.max(0, timelineStart - clip.trim.start),
                }));
              }}
              onClearClip={() => {
                if (playing) {
                  stopPlayback();
                }
                setBeatClip(null);
                setBeatImportError(null);
              }}
            />
            <VocalRow
              recording={recording}
              timelineDurationSec={timelineDurationSec}
              clipStartSec={vocalClipStartSec}
              recordingElapsedSec={recordingElapsedSec}
              trim={trim}
              recordError={recordError}
              buffer={vocalBuffer}
              onTrimChange={(next) => {
                if (playing) {
                  stopPlayback();
                }
                setTrim(next);
              }}
              onClipTimelineStartChange={(timelineStart) => {
                if (playing) {
                  stopPlayback();
                }
                if (!trim) {
                  return;
                }
                setVocalClipStartSec(Math.max(0, timelineStart - trim.start));
              }}
            />
            {sortedExtraTracks.map((track) => (
              <AudioImportRow
                key={track.id}
                trackLabel={`Track ${track.laneNumber}`}
                ariaLabel={`Track ${track.laneNumber}`}
                timelineDurationSec={timelineDurationSec}
                clip={track.clip}
                importBusy={trackImportBusyId === track.id}
                importError={trackImportBusyId === track.id ? trackImportError : null}
                onImportFile={(file) => {
                  setTrackImportError(null);
                  void importAudioFile(
                    file,
                    playheadSec,
                    (clip) => {
                      setExtraTracks((current) =>
                        current.map((row) => (row.id === track.id ? { ...row, clip } : row)),
                      );
                    },
                    (busy) => setTrackImportBusyId(busy ? track.id : null),
                    setTrackImportError,
                  );
                }}
                onTrimChange={(next) => {
                  if (playing) {
                    stopPlayback();
                  }
                  updateTrackClip(track.id, (clip) => ({ ...clip, trim: next }));
                }}
                onClipTimelineStartChange={(timelineStart) => {
                  if (playing) {
                    stopPlayback();
                  }
                  updateTrackClip(track.id, (clip) => ({
                    ...clip,
                    clipStartSec: Math.max(0, timelineStart - clip.trim.start),
                  }));
                }}
                onRemoveTrack={() => removeTrack(track.id)}
                onClearClip={
                  track.clip
                    ? () => {
                        if (playing) {
                          stopPlayback();
                        }
                        setExtraTracks((current) =>
                          current.map((row) =>
                            row.id === track.id ? { ...row, clip: null } : row,
                          ),
                        );
                      }
                    : undefined
                }
              />
            ))}
            <TimelinePlayhead
              positionSec={playheadSec}
              durationSec={timelineDurationSec}
              disabled={recording}
              onPositionChange={seekTimeline}
            />
          </div>
        </div>
        <div className="arrangement-toolbar">
          <button
            type="button"
            className="arrangement-add-track"
            onClick={addTrack}
            disabled={!canAddTrack}
          >
            Add track
          </button>
          {!canAddTrack ? (
            <span className="arrangement-cap-hint">Maximum of {MAX_SESSION_LANES} tracks</span>
          ) : null}
        </div>
      </div>
      <div className="daw-rack">
        {features ? (
          <>
            <h2 className="section-title">Voice measurements</h2>
            <FeatureList features={features} warnings={featureWarnings(features)} />
          </>
        ) : null}
        {preset ? (
          <EffectsPanel
            preset={preset}
            source={source}
            onParamChange={changeParam}
            onEnabledChange={changeEnabled}
            onReset={resetPreset}
          />
        ) : null}
      </div>
      <div className="daw-prompt">
        <PromptBox
          prompt={prompt}
          busy={busy}
          hasTake={vocalBuffer != null}
          onPromptChange={setPrompt}
          onGenerate={generate}
        />
        {generateError ? (
          <p className="form-error" role="alert">
            {generateError}
          </p>
        ) : null}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
