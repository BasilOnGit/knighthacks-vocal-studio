import React from 'react';
import { PARAM_RANGES } from '../../../../shared/params';
import { sampleEqCurve } from '../audio/eqCurve';

const MIN_HZ = 40;
const MAX_HZ = 16_000;
const MIN_DB = -12;
const MAX_DB = 12;
const CURVE_POINTS = 128;

type EqNodeDef =
  | {
      id: string;
      label: string;
      kind: 'shelf' | 'peak';
      freqKey: string;
      gainKey: string;
      color: string;
    }
  | {
      id: string;
      label: string;
      kind: 'hpf';
      freqKey: string;
      color: string;
    };

const NODES: EqNodeDef[] = [
  { id: 'hpf', label: 'HPF', kind: 'hpf', freqKey: 'lowCutHz', color: '#8b9cb8' },
  { id: 'low', label: 'Low', kind: 'shelf', freqKey: 'lowShelfHz', gainKey: 'lowShelfDb', color: '#91d7b5' },
  { id: 'mid', label: 'Mid', kind: 'peak', freqKey: 'bodyHz', gainKey: 'bodyDb', color: '#b3a0ff' },
  {
    id: 'presence',
    label: 'Presence',
    kind: 'peak',
    freqKey: 'presenceHz',
    gainKey: 'presenceDb',
    color: '#f0c674',
  },
  { id: 'high', label: 'High', kind: 'shelf', freqKey: 'airHz', gainKey: 'airDb', color: '#7ec8e3' },
];

function hzToX(hz: number, width: number): number {
  const logMin = Math.log10(MIN_HZ);
  const logMax = Math.log10(MAX_HZ);
  const t = (Math.log10(Math.max(MIN_HZ, hz)) - logMin) / (logMax - logMin);
  return t * width;
}

function xToHz(x: number, width: number): number {
  const logMin = Math.log10(MIN_HZ);
  const logMax = Math.log10(MAX_HZ);
  const t = Math.min(1, Math.max(0, x / width));
  return Math.pow(10, logMin + t * (logMax - logMin));
}

function dbToY(db: number, height: number): number {
  const t = (db - MIN_DB) / (MAX_DB - MIN_DB);
  return height - t * height;
}

function yToDb(y: number, height: number): number {
  const t = 1 - Math.min(1, Math.max(0, y / height));
  return MIN_DB + t * (MAX_DB - MIN_DB);
}

type EqParamKey = keyof typeof PARAM_RANGES.eq;

function eqRange(key: string) {
  return PARAM_RANGES.eq[key as EqParamKey];
}

function clampParam(key: string, value: number): number {
  const range = eqRange(key);
  if (!range) {
    return value;
  }
  return Math.min(range.max, Math.max(range.min, value));
}

export function EqSpectrumEditor({
  params,
  enabled,
  onParamChange,
  onEditStart,
  getSpectrumDb,
  sampleRate,
}: {
  params: Record<string, number>;
  enabled: boolean;
  onParamChange: (key: string, value: number) => void;
  onEditStart?: () => void;
  getSpectrumDb?: () => Float32Array | null;
  sampleRate?: number;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ id: string; pointerId: number } | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const draw = React.useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const width = wrap.clientWidth;
    const height = 200;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#0d1118';
    ctx.fillRect(0, 0, width, height);

    const gridDb = [0, 6, -6];
    ctx.strokeStyle = '#2a3344';
    ctx.lineWidth = 1;
    for (const db of gridDb) {
      const y = dbToY(db, height);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    const gridHz = [100, 1000, 10000];
    ctx.fillStyle = '#5a6578';
    ctx.font = '10px system-ui, sans-serif';
    for (const hz of gridHz) {
      const x = hzToX(hz, width);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      const label = hz >= 1000 ? `${hz / 1000}k` : String(hz);
      ctx.fillText(label, x + 3, height - 4);
    }

    const spectrum = getSpectrumDb?.();
    if (spectrum && spectrum.length > 1 && sampleRate && sampleRate > 0) {
      const binCount = spectrum.length;
      ctx.fillStyle = 'rgba(120, 140, 180, 0.35)';
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let i = 1; i < binCount; i += 1) {
        const freq = (i * sampleRate) / (2 * binCount);
        if (freq < MIN_HZ) {
          continue;
        }
        if (freq > MAX_HZ) {
          break;
        }
        const x = hzToX(freq, width);
        const db = spectrum[i];
        const y = dbToY(Math.max(MIN_DB, Math.min(MAX_DB, db + 24)), height);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
    }

    const { freqs, magsDb } = sampleEqCurve(params, CURVE_POINTS);
    ctx.strokeStyle = enabled ? '#e8ecf4' : '#6a7385';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < freqs.length; i += 1) {
      const x = hzToX(freqs[i], width);
      const y = dbToY(Math.max(MIN_DB, Math.min(MAX_DB, magsDb[i])), height);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    for (const node of NODES) {
      const freq = params[node.freqKey] ?? eqRange(node.freqKey).default;
      const x = hzToX(freq, width);
      if (node.kind === 'hpf') {
        ctx.strokeStyle = node.color;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, 8);
        ctx.lineTo(x, height - 20);
        ctx.stroke();
        ctx.setLineDash([]);
        const y = height - 14;
        ctx.fillStyle = activeId === node.id ? '#fff' : node.color;
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const gain = params[node.gainKey] ?? eqRange(node.gainKey).default;
      const y = dbToY(gain, height);
      const r = activeId === node.id ? 9 : 7;
      ctx.fillStyle = node.color;
      ctx.strokeStyle = activeId === node.id ? '#fff' : '#1a2030';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e8ecf4';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, x, y - 12);
      ctx.textAlign = 'start';
    }
  }, [params, enabled, getSpectrumDb, sampleRate, activeId]);

  React.useEffect(() => {
    draw();
  }, [draw]);

  React.useEffect(() => {
    let frame = 0;
    function tick() {
      draw();
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  function hitTest(clientX: number, clientY: number): EqNodeDef | null {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const height = rect.height;
    for (const node of [...NODES].reverse()) {
      const freq = params[node.freqKey] ?? eqRange(node.freqKey).default;
      const nx = hzToX(freq, rect.width);
      if (node.kind === 'hpf') {
        const ny = height - 14;
        if ((x - nx) ** 2 + (y - ny) ** 2 <= 12 ** 2) {
          return node;
        }
        continue;
      }
      const gain = params[node.gainKey] ?? eqRange(node.gainKey).default;
      const ny = dbToY(gain, height);
      if ((x - nx) ** 2 + (y - ny) ** 2 <= 14 ** 2) {
        return node;
      }
    }
    return null;
  }

  function onPointerDown(event: React.PointerEvent) {
    const node = hitTest(event.clientX, event.clientY);
    if (!node) {
      return;
    }
    onEditStart?.();
    dragRef.current = { id: node.id, pointerId: event.pointerId };
    setActiveId(node.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    const node = NODES.find((n) => n.id === drag.id);
    const canvas = canvasRef.current;
    if (!node || !canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hz = clampParam(node.freqKey, Math.round(xToHz(x, rect.width)));
    onParamChange(node.freqKey, hz);
    if (node.kind !== 'hpf' && node.gainKey) {
      const db = clampParam(node.gainKey, Math.round(yToDb(y, rect.height) * 10) / 10);
      onParamChange(node.gainKey, db);
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setActiveId(null);
    }
  }

  return (
    <div className="eq-spectrum" ref={wrapRef}>
      <p className="eq-spectrum__hint">
        Drag nodes — horizontal: frequency, vertical: gain (dB). Play audio to see the live spectrum behind the curve.
      </p>
      <canvas
        ref={canvasRef}
        className="eq-spectrum__canvas"
        role="application"
        aria-label="EQ spectrum editor"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}
