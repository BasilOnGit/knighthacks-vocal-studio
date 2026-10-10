import React from 'react';
import { createRoot } from 'react-dom/client';
import { analyze, featureWarnings } from './analysis/analyze';
import { PlaybackEngine } from './engine/Engine';
import { Recorder } from './engine/recorder';
import type { Preset, TrimRange } from '../../../shared/types';
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

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
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
  const [timeLabel, setTimeLabel] = React.useState('0:00');
  const [dry, setDry] = React.useState(false);
  const [masterDb, setMasterDb] = React.useState(0);
  const [recording, setRecording] = React.useState(false);
  const [vocalBuffer, setVocalBuffer] = React.useState<AudioBuffer | null>(null);
  const [trim, setTrim] = React.useState<TrimRange | null>(null);
  const [recordError, setRecordError] = React.useState<string | null>(null);
  const engineRef = React.useRef<PlaybackEngine | null>(null);
  if (engineRef.current == null) {
    engineRef.current = new PlaybackEngine({
      onEnded: () => {
        setPlaying(false);
        setTimeLabel('0:00');
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
      engine.setVocal(vocalBuffer, trim);
    }
  }, [engine, vocalBuffer, trim]);

  const chainKey = chainSignature(preset);

  React.useEffect(() => {
    if (preset) {
      engine.setPreset(preset);
    }
    // Rebuild only when effect ids or types change. Slider edits keep this key stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, chainKey]);

  React.useEffect(() => {
    if (!playing) {
      setTimeLabel('0:00');
      return;
    }
    let frame = 0;
    const tick = () => {
      setTimeLabel(formatTime(engine.getSeconds()));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engine, playing]);

  function stopPlayback() {
    engine.stop();
    setPlaying(false);
    setTimeLabel('0:00');
  }

  function togglePlay() {
    if (playing) {
      stopPlayback();
      return;
    }
    if (!vocalBuffer || !trim) {
      return;
    }
    engine.play();
    setPlaying(true);
  }

  async function toggleRecord() {
    if (recordBusyRef.current) {
      return;
    }
    recordBusyRef.current = true;
    setRecordError(null);
    try {
      if (recording) {
        try {
          const buffer = await recorderRef.current.stop();
          const nextTrim = { start: 0, end: buffer.duration };
          engine.setVocal(buffer, nextTrim);
          setVocalBuffer(buffer);
          setTrim(nextTrim);
        } catch (error) {
          setRecordError(error instanceof Error ? error.message : 'Recording failed.');
        } finally {
          setRecording(false);
        }
        return;
      }

      stopPlayback();
      try {
        await recorderRef.current.start();
        setRecording(true);
      } catch (error) {
        setRecording(false);
        setRecordError(
          error instanceof Error ? error.message : 'Could not access the microphone.',
        );
      }
    } finally {
      recordBusyRef.current = false;
    }
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
        engine.setPreset(next);
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

  return (
    <main>
      <p className="eyebrow">KNIGHTHACKS 2026</p>
      <h1>Your voice. Your sound.</h1>
      <TopBar
        playing={playing}
        canPlay={vocalBuffer != null && trim != null}
        timeLabel={timeLabel}
        dry={dry}
        masterDb={masterDb}
        onPlayStop={togglePlay}
        onDryChange={(next) => {
          setDry(next);
          engine.setBypass(next);
        }}
        onMasterDbChange={setMasterDb}
      />
      <VocalRow
        recording={recording}
        durationSec={vocalBuffer?.duration ?? null}
        trim={trim}
        recordError={recordError}
        buffer={vocalBuffer}
        onRecord={() => {
          void toggleRecord();
        }}
        onTrimChange={(next) => {
          if (playing) {
            stopPlayback();
          }
          setTrim(next);
        }}
      />
      {features ? (
        <>
          <h2 className="section-title">Voice measurements</h2>
          <FeatureList features={features} warnings={featureWarnings(features)} />
        </>
      ) : null}
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
      {preset ? (
        <EffectsPanel
          preset={preset}
          source={source}
          onParamChange={changeParam}
          onEnabledChange={changeEnabled}
          onReset={resetPreset}
        />
      ) : null}
      <p className="note">
        Master is not wired to audio yet.
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
