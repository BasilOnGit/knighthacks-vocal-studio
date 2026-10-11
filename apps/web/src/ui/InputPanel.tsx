import React from 'react';
import { InputMonitor } from '../engine/monitor';
import { Headphones, ICON_SIZE, ICON_STROKE, Mic, Wand2 } from './icons';
import { ToggleButton } from './ToggleButton';

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
  const [detailsOpen, setDetailsOpen] = React.useState(false);

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

  async function onDeviceSelect(nextId: string) {
    onDeviceChange(nextId);
    if (!active) {
      return;
    }
    const keepMonitor = monitoring;
    const keepAutotune = autotunePreview;
    setBusy(true);
    setError('');
    try {
      const autotune =
        keepAutotune && monitorAutotune ? { params: monitorAutotune } : null;
      await monitor.current!.start(nextId, keepMonitor, autotune);
    } catch {
      monitor.current?.stop();
      setActive(false);
      setMonitoring(false);
      setAutotunePreview(false);
      setError('Microphone unavailable. Check your browser permission and input device.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="input-panel" aria-label="Microphone setup">
      <label className="input-panel-mic">
        <span className="input-panel-mic-label">
          <Mic size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
          Mic
        </span>
        <select
          aria-label="Microphone"
          value={deviceId}
          disabled={recording || busy}
          onChange={(e) => void onDeviceSelect(e.target.value)}
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
        {busy ? 'Connecting…' : active ? 'Disconnect' : 'Check mic'}
      </button>
      <div className="input-meter">
        <span>
          Level <strong>{active ? `${Math.round(level)} dB` : '—'}</strong>
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
      </div>
      <div className="toggle-btn-group input-monitor-toggles">
        <ToggleButton
          pressed={monitoring}
          variant="monitor"
          disabled={!active}
          size="sm"
          title="Hear your mic through headphones"
          onToggle={() => void onMonitoringChange(!monitoring)}
        >
          <Headphones size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
          Monitor
        </ToggleButton>
        {monitorAutotune ? (
          <ToggleButton
            pressed={autotunePreview}
            disabled={!active || !monitoring}
            size="sm"
            title="Preview autotune from the focused track"
            onToggle={() => {
              const on = !autotunePreview;
              setAutotunePreview(on);
              void monitor.current?.setAutotunePreview(on, monitorAutotune);
            }}
          >
            <Wand2 size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
            Autotune
          </ToggleButton>
        ) : null}
      </div>
      <details
        className="input-monitor-details"
        open={detailsOpen}
        onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>Monitoring tips</summary>
        <p className="input-help">
          Use headphones before monitoring. Autotune preview follows the focused track;
          recordings stay dry.
        </p>
      </details>
      {error && <p role="alert" className="form-error">{error}</p>}
    </section>
  );
}
