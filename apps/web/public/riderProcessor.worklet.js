class VocalStudioRiderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'targetDb', defaultValue: -18, minValue: -24, maxValue: -6 },
      { name: 'speed', defaultValue: 0.4, minValue: 0, maxValue: 1 },
      { name: 'maxGainDb', defaultValue: 6, minValue: 0, maxValue: 12 },
    ];
  }

  constructor() {
    super();
    this.gain = 1;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output?.length) {
      return true;
    }
    const block = output[0].length;
    const sr = sampleRate;

    for (let i = 0; i < block; i++) {
      const targetDb = paramAt(parameters.targetDb, i);
      const speed = paramAt(parameters.speed, i);
      const maxGainDb = paramAt(parameters.maxGainDb, i);
      const targetLin = Math.pow(10, targetDb / 20);
      const maxGain = Math.pow(10, maxGainDb / 20);

      let sum = 0;
      let count = 0;
      if (input) {
        for (let ch = 0; ch < input.length; ch++) {
          const channel = input[ch];
          if (!channel) continue;
          const sample = channel[i];
          sum += sample * sample;
          count += 1;
        }
      }
      const rms = count > 0 ? Math.sqrt(sum / count) : 0;
      let desired = rms > 1e-6 ? targetLin / rms : 1;
      desired = Math.min(maxGain, Math.max(1 / maxGain, desired));

      const attack = 0.003 + (1 - speed) * 0.12;
      const release = 0.02 + (1 - speed) * 0.35;
      const tau = desired >= this.gain ? attack : release;
      const coef = 1 - Math.exp(-1 / (Math.max(tau, 0.001) * sr));
      this.gain += (desired - this.gain) * coef;

      for (let ch = 0; ch < output.length; ch++) {
        const inCh = input && input[ch];
        const outCh = output[ch];
        if (!outCh) continue;
        outCh[i] = (inCh ? inCh[i] : 0) * this.gain;
      }
    }
    return true;
  }
}

function paramAt(arr, index) {
  return arr.length > 1 ? arr[index] : arr[0];
}

registerProcessor('vocal-studio-rider', VocalStudioRiderProcessor);
