import * as Tone from 'tone';

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Record the live master bus while the session plays from the start. */
export async function exportTimelineWav(
  playTimeline: () => Promise<boolean>,
  durationSec: number,
  compensationSec: number,
): Promise<void> {
  await Tone.start();
  const recorder = new Tone.Recorder();
  Tone.getDestination().connect(recorder);
  const started = await playTimeline();
  if (!started) {
    recorder.dispose();
    throw new Error('Nothing to export — add clips and try again.');
  }
  const waitMs = (durationSec + compensationSec + 0.25) * 1000;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  const blob = await recorder.stop();
  recorder.dispose();
  downloadBlob(blob, `vocal-studio-mix-${Date.now()}.wav`);
}
