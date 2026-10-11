class VocalStudioDenoiseProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'amount', defaultValue: 70, minValue: 0, maxValue: 100 }];
  }

  constructor() {
    super();
    this.noiseFloor = 0.0005;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output?.length) {
      return true;
    }
    const amount = paramAt(parameters.amount, 0) / 100;
    const block = output[0].length;

    for (let i = 0; i < block; i++) {
      const wet = paramAt(parameters.amount, i) / 100;
      let peak = 0;
      if (input) {
        for (let ch = 0; ch < input.length; ch++) {
          const channel = input[ch];
          if (!channel) continue;
          const abs = Math.abs(channel[i]);
          if (abs > peak) peak = abs;
        }
      }
      if (peak < this.noiseFloor * 4) {
        this.noiseFloor = this.noiseFloor * 0.995 + peak * 0.005;
      }
      const suppress = peak > this.noiseFloor ? 1 : Math.max(0.05, peak / (this.noiseFloor + 1e-6));
      const gain = 1 - wet * (1 - suppress);

      for (let ch = 0; ch < output.length; ch++) {
        const inCh = input && input[ch];
        const outCh = output[ch];
        if (!outCh) continue;
        const dry = inCh ? inCh[i] : 0;
        outCh[i] = dry * gain;
      }
    }
    return true;
  }
}

function paramAt(arr, index) {
  return arr.length > 1 ? arr[index] : arr[0];
}

registerProcessor('vocal-studio-denoise', VocalStudioDenoiseProcessor);
