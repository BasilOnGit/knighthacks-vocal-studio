import React from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/plugins/regions';
import type { TrimRange } from '../../../../shared/types';

const TRIM_REGION_ID = 'trim';

type WaveformProps = {
  buffer: AudioBuffer;
  trim: TrimRange;
  onTrimChange: (trim: TrimRange) => void;
};

export function Waveform({ buffer, trim, onTrimChange }: WaveformProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const regionsRef = React.useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const trimRef = React.useRef(trim);
  trimRef.current = trim;
  const onTrimChangeRef = React.useRef(onTrimChange);
  onTrimChangeRef.current = onTrimChange;
  const trimFromRegionRef = React.useRef(false);

  const syncTrimRegion = React.useCallback(
    (nextTrim: TrimRange) => {
      const regions = regionsRef.current;
      if (!regions) {
        return;
      }
      const start = clamp(nextTrim.start, 0, buffer.duration);
      const end = clamp(nextTrim.end, start + 0.05, buffer.duration);

      regions.clearRegions();
      regions.addRegion({
        id: TRIM_REGION_ID,
        start,
        end,
        drag: false,
        resize: true,
        color: 'rgba(242, 100, 25, 0.28)',
        minLength: 0.05,
      });
    },
    [buffer.duration],
  );

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const ws = WaveSurfer.create({
      container,
      height: 76,
      waveColor: '#F26419',
      progressColor: '#F26419',
      cursorWidth: 0,
      interact: false,
      backend: 'WebAudio',
    });
    const regions = ws.registerPlugin(RegionsPlugin.create());
    regionsRef.current = regions;

    const unsubscribe = regions.on('region-updated', (region) => {
      if (region.id !== TRIM_REGION_ID) {
        return;
      }
      const nextTrim = {
        start: clamp(region.start, 0, buffer.duration),
        end: clamp(region.end, 0, buffer.duration),
      };
      if (nextTrim.end <= nextTrim.start) {
        return;
      }
      trimRef.current = nextTrim;
      trimFromRegionRef.current = true;
      onTrimChangeRef.current(nextTrim);
    });

    const channels = channelData(buffer);
    void ws.load('', channels, buffer.duration).then(() => {
      syncTrimRegion(trimRef.current);
    });

    return () => {
      unsubscribe();
      ws.destroy();
      regionsRef.current = null;
    };
  }, [buffer, syncTrimRegion]);

  React.useEffect(() => {
    trimRef.current = trim;
    if (trimFromRegionRef.current) {
      trimFromRegionRef.current = false;
      return;
    }
    syncTrimRegion(trim);
  }, [trim.start, trim.end, syncTrimRegion, trim]);

  return <div ref={containerRef} className="waveform waveform--full-take" />;
}
function channelData(buffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }
  return channels;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

