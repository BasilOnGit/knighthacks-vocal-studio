class VocalStudioNoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -45, minValue: -80, maxValue: 15 },
      { name: 'attack', defaultValue: 0.005, minValue: 0.00001, maxValue: 2 },
      { name: 'release', defaultValue: 0.1, minValue: 0.001, maxValue: 5 },
      { name: 'floor', defaultValue: 0.0001, minValue: 0, maxValue: 1 },
    ];
  }

  constructor() {
    super();
    this.gain = 1;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) {
      return true;
    }

    const block = output[0].length;
    const sr = sampleRate;
    const threshLin = Math.pow(10, paramAt(parameters.threshold, 0) / 20);
    const floor = paramAt(parameters.floor, 0);

    for (let i = 0; i < block; i++) {
      const attack = paramAt(parameters.attack, i);
      const release = paramAt(parameters.release, i);

      let peak = 0;
      if (input) {
        for (let ch = 0; ch < input.length; ch++) {
          const channel = input[ch];
          if (!channel) continue;
          const abs = Math.abs(channel[i]);
          if (abs > peak) peak = abs;
        }
      }

      const target = peak >= threshLin ? 1 : floor;
      const tau = target >= this.gain ? attack : release;
      const coef = 1 - Math.exp(-1 / (Math.max(tau, 0.0001) * sr));
      this.gain += (target - this.gain) * coef;

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

registerProcessor('vocal-studio-noise-gate', VocalStudioNoiseGateProcessor);
