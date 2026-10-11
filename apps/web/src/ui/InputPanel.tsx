import React from 'react';
import { InputMonitor } from '../engine/monitor';

export function InputPanel({
  deviceId,
  onDeviceChange,
  recording,
  monitorAutotune,
}: {
  deviceId: string;
  onDeviceChange: (id: string) => void;
  recording: boolean;
  monitorAutotune: Record<string, number> | null;
}) {
  const monitor = React.useRef<InputMonitor | null>(null);
  if (!monitor.current) monitor.current = new InputMonitor();
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [active, setActive] = React.useState(false);
  const [monitoring, setMonitoring] = React.useState(false);
  const [autotunePreview, setAutotunePreview] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [level, setLevel] = React.useState(-60);

  React.useEffect(() => {
    const refresh = () => {
      void navigator.mediaDevices
        ?.enumerateDevices()
        .then((d) => setDevices(d.filter((x) => x.kind === 'audioinput')))
        .catch(() => {});
    };
    refresh();
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => {
      monitor.current?.stop();
      navigator.mediaDevices?.removeEventListener('devicechange', refresh);
    };
  }, []);

  React.useEffect(() => {
    if (!active) {
      setLevel(-60);
      return;
    }
    const timer = window.setInterval(() => setLevel(monitor.current?.level() ?? -60), 80);
    return () => window.clearInterval(timer);
  }, [active]);

  React.useEffect(() => {
    if (!active || !monitoring) {
      return;
    }
    void monitor.current?.setAutotunePreview(autotunePreview, monitorAutotune);
  }, [active, monitoring, autotunePreview, monitorAutotune]);

  React.useEffect(() => {
    if (!monitorAutotune) {
      setAutotunePreview(false);
    }
  }, [monitorAutotune]);

  async function toggleInput() {
    if (active) {
      monitor.current?.stop();
      setActive(false);
      setMonitoring(false);
      setAutotunePreview(false);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const autotune =
        autotunePreview && monitorAutotune ? { params: monitorAutotune } : null;
      await monitor.current!.start(deviceId, false, autotune);
      setDevices(
        (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'),
      );
      setActive(true);
    } catch {
      monitor.current?.stop();
      setError('Microphone unavailable. Check your browser permission and input device.');
    } finally {
      setBusy(false);
    }
  }

  async function onMonitoringChange(checked: boolean) {
    setMonitoring(checked);
    monitor.current?.setMonitoring(checked);
    if (checked && autotunePreview && monitorAutotune) {
      await monitor.current?.setAutotunePreview(true, monitorAutotune);
    }
  }

  return (
    <section className="input-panel" aria-label="Microphone setup">
      <div>
        <span className="eyebrow">INPUT & MONITORING</span>
        <h2>Sound check</h2>
      </div>
      <label>
        Microphone
        <select
          aria-label="Microphone"
          value={deviceId}
          disabled={recording || busy}
          onChange={(e) => {
            monitor.current?.stop();
            setActive(false);
            setMonitoring(false);
            setAutotunePreview(false);
            onDeviceChange(e.target.value);
          }}
        >
          <option value="">System default</option>
          {devices.map((d, i) => (
            <option key={d.deviceId || i} value={d.deviceId}>
              {d.label || `Microphone ${i + 1}`}
            </option>
          ))}
        </select>
      </label>
      <button type="button" disabled={busy} onClick={() => void toggleInput()}>
        {busy ? 'Connecting…' : active ? 'Disconnect input' : 'Check microphone'}
      </button>
      <div className="input-meter">
        <span>
          Input level <strong>{active ? `${Math.round(level)} dB` : 'Offline'}</strong>
        </span>
        <meter
          min={-60}
          max={0}
          low={-40}
          high={-6}
          optimum={-18}
          value={level}
          aria-label="Microphone input level"
        />
        <small>
          {active
            ? level > -6
              ? 'Strong signal — lower your input gain'
              : level < -40
                ? 'Try speaking closer to the mic'
                : 'Signal looks good'
            : 'Connect to check your microphone'}
        </small>
      </div>
      <label className="monitor-switch">
        <input
          type="checkbox"
          checked={monitoring}
          disabled={!active}
          onChange={(e) => void onMonitoringChange(e.target.checked)}
        />
        Hear myself
      </label>
      {monitorAutotune ? (
        <label className="monitor-switch">
          <input
            type="checkbox"
            checked={autotunePreview}
            disabled={!active || !monitoring}
            onChange={(e) => {
              const on = e.target.checked;
              setAutotunePreview(on);
              void monitor.current?.setAutotunePreview(on, monitorAutotune);
            }}
          />
          Autotune preview
        </label>
      ) : null}
      <p className="input-help">
        Use headphones before enabling monitoring. Autotune preview uses the selected clip&apos;s
        autotune settings; recordings stay dry.
      </p>
      {error && <p role="alert" className="form-error">{error}</p>}
    </section>
  );
}
