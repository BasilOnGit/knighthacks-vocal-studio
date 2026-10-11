import * as Tone from 'tone';
import type { SessionEngine } from '../engine/SessionEngine';

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function extensionForMime(mime: string): string {
  if (mime.includes('webm')) {
    return 'webm';
  }
  if (mime.includes('ogg')) {
    return 'ogg';
  }
  if (mime.includes('mp4') || mime.includes('m4a')) {
    return 'm4a';
  }
  if (mime.includes('wav')) {
    return 'wav';
  }
  return 'audio';
}

/** Record the session master bus while the timeline plays from the start. */
export async function exportTimelineWav(
  engine: SessionEngine,
  playTimeline: () => Promise<boolean>,
): Promise<void> {
  if (!Tone.Recorder.supported) {
    throw new Error('Export is not supported in this browser.');
  }
  await Tone.start();
  const recorder = new Tone.Recorder();
  engine.connectExportTap(recorder);
  try {
    await recorder.start();
    const started = await playTimeline();
    if (!started) {
      if (recorder.state !== 'stopped') {
        await recorder.stop();
      }
      throw new Error('Nothing to export — add clips and try again.');
    }
    await engine.waitForPlaybackEnd();
    await new Promise((resolve) => setTimeout(resolve, engine.getPostExportPadSec() * 1000));
    const blob = await recorder.stop();
    const ext = extensionForMime(blob.type || recorder.mimeType);
    downloadBlob(blob, `vocal-studio-mix-${Date.now()}.${ext}`);
  } finally {
    engine.disconnectExportTap(recorder);
    recorder.dispose();
  }
}
