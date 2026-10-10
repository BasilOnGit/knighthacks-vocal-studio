const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
};

function userFacingMediaError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return 'Microphone permission denied.';
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'No microphone found.';
    }
  }
  return 'Could not access the microphone.';
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export class Recorder {
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private decodeContext: AudioContext | null = null;

  async start(deviceId = ''): Promise<void> {
    this.releaseStream();
    this.chunks = [];

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ ...AUDIO_CONSTRAINTS, audio: { ...(AUDIO_CONSTRAINTS.audio as MediaTrackConstraints), deviceId: deviceId ? { exact: deviceId } : undefined } });
    } catch (error) {
      this.releaseStream();
      throw new Error(userFacingMediaError(error));
    }

    try {
      const recorder = new MediaRecorder(this.stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };
      this.mediaRecorder = recorder;
      recorder.start();
    } catch {
      this.releaseStream();
      throw new Error('Could not start recording.');
    }
  }

  async stop(): Promise<AudioBuffer> {
    const recorder = this.mediaRecorder;
    if (!recorder || recorder.state === 'inactive') {
      this.releaseStream();
      throw new Error('Not recording.');
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => {
        this.releaseStream();
        reject(new Error('Recording failed.'));
      };
      recorder.onstop = () => {
        resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.stop();
    });

    this.releaseStream();

    if (blob.size === 0) {
      throw new Error('Recording was empty.');
    }

    try {
      const data = await blob.arrayBuffer();
      return await this.context().decodeAudioData(data.slice(0));
    } catch {
      throw new Error('Could not decode the recording.');
    }
  }

  private context(): AudioContext {
    if (!this.decodeContext || this.decodeContext.state === 'closed') {
      this.decodeContext = new AudioContext();
    }
    return this.decodeContext;
  }

  private releaseStream() {
    this.mediaRecorder = null;
    stopTracks(this.stream);
    this.stream = null;
  }
}
