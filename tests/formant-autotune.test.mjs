import test from 'node:test';
import assert from 'node:assert/strict';
import {createProcessor,wasmBinary,run,voice,rms,bestLag,estimateF0,centsBetween,QUANTUM} from './helpers/workletHarness.mjs';
import {harmonicResidual} from './helpers/audioMetrics.mjs';

const SR=48000;
const FILE='formantAutotuneProcessor.worklet.js',NAME='vocal-studio-formant-autotune';
const make=(quality,extra={})=>createProcessor(FILE,NAME,{wasmBinary:wasmBinary(),quality,...extra},{sampleRate:SR});
const qualities=['studio','live'];

for(const quality of qualities){
 test(`${quality}: shifts pitch accurately and stays clean`,async()=>{
  const p=await make(quality);const f0=220,semis=1.5;
  const out=run(p,voice(3,SR,()=>f0),()=>({mix:1,pitchSemitones:semis}));
  const s=SR,e=Math.floor(SR*2.8),expected=f0*2**(semis/12);
  assert.ok(Math.abs(centsBetween(estimateF0(out,SR,s,e),expected))<3,'pitch within 3 cents');
  // Rubber Band's default transient handling leaves ~5% non-harmonic energy here (audibly rough).
  assert.ok(harmonicResidual(out,SR,expected,s,e)<0.02,'less than 2% non-harmonic energy');
 });

 test(`${quality}: never underruns, even when the pitch control jumps around`,async()=>{
  const p=await make(quality);let seed=99;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  let target=0;
  run(p,voice(5,SR,()=>220),(q)=>{if(q%56===0)target=(rnd()*2-1)*3;return {mix:1,pitchSemitones:target};});
  assert.equal(p.stream.underruns,0,'an underrun is an audible click');
 });

 test(`${quality}: wet signal lands exactly where the dry delay line expects (no echo / comb filter)`,async()=>{
  const p=await make(quality);
  const glide=voice(3,SR,(t)=>150+60*Math.sin(2*Math.PI*0.7*t)+40*t); // non-periodic: unambiguous lag
  const wet=run(p,glide,()=>({mix:1,pitchSemitones:0}));
  const lag=bestLag(glide,wet,Math.floor(SR*0.3),SR,SR*2);
  assert.ok(Math.abs(lag-p.latency)<=2,`wet lag ${lag} vs reported latency ${p.latency}`);
  const dryProc=await make(quality);
  const dry=run(dryProc,glide,()=>({mix:0,pitchSemitones:0}));
  assert.equal(bestLag(glide,dry,Math.floor(SR*0.3),SR,SR*2),dryProc.latency,'dry path is delayed by the same amount');
  assert.equal(p.latency,dryProc.latency);
  assert.ok(bestLag(dry,wet,64,SR,SR*2)<=2,'dry and wet outputs are aligned with each other');
 });

 test(`${quality}: a half dry/half wet mix keeps the level`,async()=>{
  const p=await make(quality);const input=voice(3,SR,()=>220);
  const out=run(p,input,()=>({mix:0.5,pitchSemitones:0}));
  const ratio=rms(out,SR,SR*2.5)/rms(input,SR,SR*2.5);
  assert.ok(ratio>0.9&&ratio<1.1,`level ratio ${ratio.toFixed(2)} (aligned equal-power mixing would be ~1.4)`);
 });

 test(`${quality}: reports a sensible latency to the host`,async()=>{
  const p=await make(quality);
  const ready=p.posted.find(m=>m.type==='ready');
  assert.ok(ready,'posts a ready message');
  assert.equal(ready.latencySamples,p.latency);
  assert.ok(Math.abs(ready.latencySec-p.latency/SR)<1e-12);
  assert.ok(ready.latencySec>0.02&&ready.latencySec<0.15,`latency ${ready.latencySec}`);
 });
}

test('studio latency is higher than live (it trades latency for quality)',async()=>{
 assert.ok((await make('studio')).latency>(await make('live')).latency);
});

test('idle processors stop working but resume perfectly aligned',async()=>{
 const p=await make('live');
 const silence=new Float32Array(SR*2);
 run(p,silence,()=>({mix:1,pitchSemitones:0}));
 assert.equal(p.idle,true,'goes idle after sustained silence');
 const pushedWhileIdle=p.stream.pushed;
 run(p,new Float32Array(SR),()=>({mix:1,pitchSemitones:0}));
 assert.equal(p.stream.pushed,pushedWhileIdle,'no stretcher work while idle');
 const glide=voice(3,SR,(t)=>150+60*Math.sin(2*Math.PI*0.7*t)+40*t);
 const out=run(p,glide,()=>({mix:1,pitchSemitones:0}));
 assert.equal(p.idle,false,'wakes when audio returns');
 assert.ok(Math.abs(bestLag(glide,out,Math.floor(SR*0.3),SR,SR*2)-p.latency)<=2,'alignment survives idling');
 assert.equal(p.stream.underruns,0);
});

test('falls back to an undelayed dry pass-through when the wasm is missing',async()=>{
 const p=await createProcessor(FILE,NAME,{},{sampleRate:SR});
 assert.equal(p.initError,true);
 const input=voice(0.5,SR,()=>220);
 const out=run(p,input,()=>({mix:1,pitchSemitones:3}));
 const processed=Math.floor(input.length/QUANTUM)*QUANTUM; // run() handles whole quanta only
 for(let i=0;i<processed;i++)if(out[i]!==input[i])assert.fail(`sample ${i} differs`);
 assert.ok(p.posted.some(m=>m.type==='error'));
});

test('calibration work is spread over many process() calls',async()=>{
 const p=await createProcessor(FILE,NAME,{wasmBinary:wasmBinary(),quality:'studio'},{sampleRate:SR});
 // createProcessor drives silence until ready; a fresh instance must not be ready after one call
 const registry=(await import('./helpers/workletHarness.mjs')).loadWorklet(FILE,{sampleRate:SR});
 const fresh=new (registry.get(NAME))({processorOptions:{wasmBinary:wasmBinary(),quality:'studio'}});
 for(let i=0;i<50;i++)await new Promise(r=>setImmediate(r));
 const z=new Float32Array(QUANTUM),o=new Float32Array(QUANTUM);
 fresh.process([[z]],[[o]],{mix:new Float32Array([0]),pitchSemitones:new Float32Array([0])});
 assert.equal(fresh.ready,false,'a single call only does a slice of the calibration');
 assert.ok(p.ready);
});
