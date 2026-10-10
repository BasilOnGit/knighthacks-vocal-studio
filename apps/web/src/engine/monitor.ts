export class InputMonitor {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private generation = 0;
  async start(deviceId: string, monitoring: boolean): Promise<void> {
    this.stop();
    const generation = this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    }});
    if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream;
    try {
      this.context = new AudioContext();
      await this.context.resume();
      if (generation !== this.generation) return;
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.gain = this.context.createGain();
      this.gain.gain.value = monitoring ? 0.7 : 0;
      this.context.createMediaStreamSource(stream).connect(this.analyser);
      this.analyser.connect(this.gain).connect(this.context.destination);
    } catch (error) { this.stop(); throw error; }
  }
  setMonitoring(on: boolean): void {
    if (this.gain && this.context) this.gain.gain.setTargetAtTime(on ? 0.7 : 0, this.context.currentTime, 0.02);
  }
  level(): number {
    if (!this.analyser) return -60;
    const samples = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(samples);
    let sum = 0; for (const sample of samples) sum += sample * sample;
    return Math.max(-60, 20 * Math.log10(Math.sqrt(sum / samples.length) || 0.000001));
  }
  stop(): void {
    this.generation++;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    void this.context?.close().catch(() => {}); this.context = null;
    this.gain = null; this.analyser = null;
  }
}
