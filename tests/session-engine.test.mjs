import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { newSnippet } from '../apps/web/src/session/snippets.ts';
import { clipTimelineStartSec, clipTimelineEndSec } from '../apps/web/src/session/clip.ts';
const source = fs.readFileSync(new URL('../apps/web/src/engine/SessionEngine.ts', import.meta.url), 'utf8');
const code = ts
  .transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } })
  .outputText.replace(/^import .*;\n/gm, '')
  .replace('export class SessionEngine', 'class SessionEngine');
function setup() {
  const players = [];
  const chains = [];
  const params = [];
  class Param {
    constructor(value) {
      this.value = value;
      params.push(this);
    }
    rampTo(value) {
      this.value = value;
    }
    setValueAtTime(value) {
      this.value = value;
    }
    cancelScheduledValues() {}
  }
  class Node {
    constructor(value = 1) {
      this.gain = new Param(value);
      this.pan = new Param(value);
    }
    connect() {
      return this;
    }
    disconnect() {
      return this;
    }
    dispose() {
      this.disposed = true;
    }
    toDestination() {
      return this;
    }
  }
  class Player extends Node {
    constructor() {
      super();
      players.push(this);
      this.buffer = { set: (buffer) => {
        this.audio = buffer;
      } };
    }
    sync() {
      return this;
    }
    unsync() {
      return this;
    }
    start(at, offset, duration) {
      this.scheduled = { at, offset, duration };
      return this;
    }
    stop() {
      this.scheduled = undefined;
    }
  }
  class Delay extends Node {
    constructor() {
      super();
      this.delayTime = new Param(0);
    }
  }
  class Analyser extends Node {
    getValue() {
      return new Float32Array(0);
    }
  }
  class Chain extends Node {
    constructor() {
      super();
      chains.push(this);
      this.input = new Node();
      this.output = new Node();
      this.updates = [];
      this.latencySec = 0;
    }
    setChain(preset) {
      this.preset = preset;
    }
    setEnabled(id, on) {
      this.updates.push({ id, on });
    }
    updateParam(id, key, value) {
      this.updates.push({ id, key, value });
    }
    onLatencyChange(listener) {
      this.latencyListener = listener;
    }
    setAutotuneSource() {}
    tickAutotune() {}
    resetAutotuneSmoothing() {}
    resetEffectTails() {}
  }
  const transport = {
    seconds: 0,
    stop() {},
    cancel() {},
    start() {
      this.started = true;
    },
    clear() {},
    scheduleOnce(callback, at) {
      this.end = at;
      return 1;
    },
    scheduleRepeat() {
      return 2;
    },
  };
  const tone = {
    Gain: Node,
    Limiter: Node,
    Panner: Node,
    Delay,
    Analyser,
    Player,
    dbToGain: (db) => 10 ** (db / 20),
    getTransport: () => transport,
    now: () => 0,
    start: async () => {},
    getContext: () => ({ rawContext: { baseLatency: 0, outputLatency: 0 } }),
  };
  const preload = async () => {};
  const Engine = new Function(
    'Tone',
    'VocalChain',
    'clipTimelineStartSec',
    'clipTimelineEndSec',
    'preloadNoiseGateWorklet',
    'preloadFormantAutotuneWorklet',
    code + '\nreturn SessionEngine;',
  )(tone, Chain, clipTimelineStartSec, clipTimelineEndSec, preload, preload);
  return { engine: new Engine(() => {}), players, chains, tone, transport };
}
const buffer = { duration: 5 };
const emptyPresets = { beat: { name: '', explanation: '', chain: [] }, vocal: { name: '', explanation: '', chain: [] } };

test('all overlapping snippets schedule concurrently, including trimmed source offsets', async () => {
  const { engine, players } = setup();
  const a = newSnippet(buffer, 'A', 'vocal', 0, 'a');
  const b = newSnippet(buffer, 'B', 'vocal', 1, 'b');
  b.trim = { start: 2, end: 5 };
  b.clipStartSec = -1;
  engine.sync([a, b], emptyPresets);
  assert.equal(await engine.play(0), true);
  assert.deepEqual(players[0].scheduled, { at: 0.05, offset: 0, duration: 5 });
  assert.deepEqual(players[1].scheduled, { at: 1.05, offset: 2, duration: 3 });
});

test('seeking to a gap before a clip still plays the upcoming clip', async () => {
  const { engine, players, transport } = setup();
  const late = newSnippet(buffer, 'A', 'vocal', 3, 'a');
  engine.sync([late], emptyPresets);
  // Playhead in the empty region before the clip: playback must still start.
  assert.equal(await engine.play(1), true);
  assert.equal(transport.started, true);
  assert.deepEqual(players[0].scheduled, { at: 2.05, offset: 0, duration: 5 });
  // Playhead past all audio: nothing to play.
  assert.equal(await engine.play(9), false);
});

test('clips entirely behind the playhead are not scheduled', async () => {
  const { engine, players } = setup();
  const early = newSnippet(buffer, 'A', 'vocal', 0, 'a');
  const cover = newSnippet(buffer, 'B', 'vocal', 4, 'b');
  engine.sync([early, cover], emptyPresets);
  assert.equal(await engine.play(5), true);
  assert.equal(players[0].scheduled, undefined);
  assert.deepEqual(players[1].scheduled, { at: 0.05, offset: 1, duration: 4 });
});

test('clips on the same track share one effect chain', () => {
  const { engine, chains } = setup();
  const a = newSnippet(buffer, 'A', 'vocal', 0, 'a');
  const b = newSnippet(buffer, 'B', 'vocal', 0, 'b');
  const preset = {
    name: '',
    explanation: '',
    chain: [{ id: 'reverb-a', type: 'reverb', enabled: true, params: { mix: 20, sizePct: 17, tonePct: 18 } }],
  };
  engine.sync([a, b], { ...emptyPresets, vocal: preset });
  const vocalChain = engine.trackSlots.get('vocal').chain;
  assert.equal(vocalChain.preset.chain.length, 1);
  assert.equal(chains.filter((c) => c.preset?.chain?.length).length, 1);
  const changed = {
    ...emptyPresets,
    vocal: { ...preset, chain: [{ ...preset.chain[0], params: { mix: 40, sizePct: 17, tonePct: 18 } }] },
  };
  engine.sync([a, b], changed);
  assert.deepEqual(vocalChain.updates, [{ id: 'reverb-a', key: 'mix', value: 40 }]);
});

test('removed clips release resources', () => {
  const { engine, players, chains } = setup();
  const a = newSnippet(buffer, 'A', 'vocal', 0, 'a');
  const b = newSnippet(buffer, 'B', 'vocal', 0, 'b');
  engine.sync([a, b], emptyPresets);
  engine.sync([b], emptyPresets);
  assert.equal(players[0].disposed, true);
  assert.equal(engine.clipSlots.has('a'), false);
});

test('clip volume, pan, track mute and solo use separate audio nodes', () => {
  const { engine } = setup();
  const a = newSnippet(buffer, 'A', 'vocal', 0, 'a');
  a.volumeDb = -6;
  a.pan = -0.5;
  const b = newSnippet(buffer, 'B', 'beat', 0, 'b');
  engine.sync([a, b], emptyPresets);
  engine.setMixes({ vocal: { db: -3, muted: false, solo: true } }, ['vocal', 'beat']);
  const slot = engine.clipSlots.get('a');
  assert.ok(Math.abs(slot.gain.gain.value - 10 ** (-6 / 20)) < 1e-8);
  assert.equal(slot.pan.pan.value, -0.5);
  assert.ok(Math.abs(engine.trackSlots.get('vocal').trackGain.gain.value - 10 ** (-3 / 20)) < 1e-8);
  assert.equal(engine.trackSlots.get('beat').trackGain.gain.value, 0);
});

test('play uses the latest timeline position after worklet warmup', async () => {
  const { engine, players, tone } = setup();
  engine.sync([newSnippet(buffer, 'A', 'vocal', 0, 'a')], emptyPresets);
  let resolve;
  tone.start = () =>
    new Promise((r) => {
      resolve = r;
    });
  const pending = engine.play(0, () => 2);
  resolve();
  assert.equal(await pending, true);
  assert.deepEqual(players[0].scheduled, { at: 0.05, offset: 2, duration: 3 });
});

test('stopping during audio-context startup cancels playback', async () => {
  const { engine, tone, transport } = setup();
  engine.sync([newSnippet(buffer, 'A', 'vocal', 0, 'a')], emptyPresets);
  let resolve;
  tone.start = () =>
    new Promise((r) => {
      resolve = r;
    });
  const pending = engine.play(0);
  engine.stop();
  resolve();
  assert.equal(await pending, false);
  assert.equal(transport.started, undefined);
});

test('tracks are delayed to line up with the chain that has the most latency', async () => {
  const { engine, transport } = setup();
  const vocal = newSnippet(buffer, 'V', 'vocal', 0, 'v');
  const beat = newSnippet(buffer, 'B', 'beat', 0, 'b');
  engine.sync([vocal, beat], emptyPresets);
  const vocalTrack = engine.trackSlots.get('vocal');
  const beatTrack = engine.trackSlots.get('beat');
  vocalTrack.chain.latencySec = 0.09;
  vocalTrack.chain.latencyListener();
  assert.ok(Math.abs(vocalTrack.wetComp.delayTime.value - 0) < 1e-9);
  assert.ok(Math.abs(beatTrack.wetComp.delayTime.value - 0.09) < 1e-9);
  assert.ok(
    Math.abs(vocalTrack.dryComp.delayTime.value - 0.09) < 1e-9 &&
      Math.abs(beatTrack.dryComp.delayTime.value - 0.09) < 1e-9,
  );
  assert.equal(await engine.play(1), true);
  assert.ok(Math.abs(transport.end - (5 + 0.05 + 0.09)) < 1e-9);
  transport.seconds = 1.5;
  assert.ok(Math.abs(engine.getSeconds() - 1.41) < 1e-9);
  transport.seconds = 1.02;
  assert.equal(engine.getSeconds(), 1);
});

test('seekTo reschedules synchronously after worklets are warm', async () => {
  const { engine, players, transport } = setup();
  engine.sync([newSnippet(buffer, 'A', 'vocal', 0, 'a')], emptyPresets);
  assert.equal(await engine.play(0), true);
  assert.equal(engine.seekTo(2), true);
  assert.deepEqual(players[0].scheduled, { at: 0.05, offset: 2, duration: 3 });
  assert.equal(transport.started, true);
  transport.seconds = 2.2;
  assert.ok(Math.abs(engine.getSeconds() - 2.2) < 1e-9);
});

test('no latency anywhere means no compensation delay', () => {
  const { engine } = setup();
  engine.sync(
    [newSnippet(buffer, 'A', 'vocal', 0, 'a'), newSnippet(buffer, 'B', 'beat', 0, 'b')],
    emptyPresets,
  );
  for (const track of engine.trackSlots.values()) {
    assert.equal(track.dryComp.delayTime.value, 0);
    assert.equal(track.wetComp.delayTime.value, 0);
  }
});
