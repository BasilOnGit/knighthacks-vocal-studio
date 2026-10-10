let decodeContext: AudioContext | null = null;

function getDecodeContext(): AudioContext {
  if (!decodeContext) {
    decodeContext = new AudioContext();
  }
  return decodeContext;
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const context = getDecodeContext();
  const data = await file.arrayBuffer();
  return context.decodeAudioData(data.slice(0));
}

export const AUDIO_FILE_ACCEPT =
  'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm,.aiff,.aif';
