import React from 'react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/plugins/regions';
import type { TrimRange } from '../../../../shared/types';

type WaveformProps = {
  buffer: AudioBuffer;
  onTrimChange: (trim: TrimRange) => void;
};

export function Waveform({ buffer, onTrimChange }: WaveformProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const onTrimChangeRef = React.useRef(onTrimChange);
  onTrimChangeRef.current = onTrimChange;

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const ws = WaveSurfer.create({
      container,
      height: 80,
      waveColor: '#b8a0ff',
      progressColor: '#b8a0ff',
      cursorWidth: 0,
      interact: false,
      backend: 'WebAudio',
    });

    const regions = ws.registerPlugin(RegionsPlugin.create());
    const channels = channelData(buffer);
    let cancelled = false;

    const unsubscribe = regions.on('region-updated', (region) => {
      onTrimChangeRef.current({ start: region.start, end: region.end });
    });

    void ws
      .load('', channels, buffer.duration)
      .then(() => {
        if (cancelled) {
          return;
        }
        regions.clearRegions();
        regions.addRegion({
          id: 'trim',
          start: 0,
          end: buffer.duration,
          drag: true,
          resize: true,
          color: 'rgba(184, 160, 255, 0.28)',
          minLength: 0.05,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      });

    return () => {
      cancelled = true;
      unsubscribe();
      ws.destroy();
    };
  }, [buffer]);

  return <div ref={containerRef} className="waveform" />;
}

function channelData(buffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = [];
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }
  return channels;
}
