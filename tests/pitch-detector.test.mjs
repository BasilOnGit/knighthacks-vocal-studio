import test from 'node:test';
import assert from 'node:assert/strict';
import {createProcessor,run,voice} from './helpers/workletHarness.mjs';

const SR=48000;
let seed=7;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};

/** Run the live detector over a voice and return its error in cents against the true f0. */
async function measure(f0At,{seconds=2,noise=0,harmonics=18,firstHarmonic=1}={}){
 const p=await createProcessor('autotuneMonitorProcessor.worklet.js','vocal-studio-autotune-monitor',{},{sampleRate:SR});
 let input=voice(seconds,SR,f0At,{harmonics});
 if(firstHarmonic>1){ // weak/missing fundamental
  input=new Float32Array(input.length);let phase=0;
  for(let i=0;i<input.length;i++){phase+=2*Math.PI*f0At(i/SR)/SR;let s=0;for(let k=firstHarmonic;k<=harmonics;k++)s+=Math.sin(k*phase)/k;input[i]=0.3*s;}
 }
 if(noise)for(let i=0;i<input.length;i++)input[i]+=noise*(rnd()*2-1);
 run(p,input,null);
 const msgs=p.posted.filter(m=>m.time>0.3);
 const errs=msgs.filter(m=>m.pitchHz>0&&m.clarity>0.82).map(m=>Math.abs(1200*Math.log2(m.pitchHz/f0At(m.time-0.0215)))).sort((a,b)=>a-b);
 return {msgs,errs,voicedShare:errs.length/msgs.length,p95:errs[Math.floor(0.95*(errs.length-1))],seconds};
}

for(const hz of [90,110,220,440,600]){
 test(`detects a steady ${hz} Hz voice within 5 cents`,async()=>{
  const r=await measure(()=>hz);
  assert.ok(r.voicedShare>0.95,`voiced share ${r.voicedShare}`);
  assert.ok(r.p95<5,`p95 error ${r.p95} cents`);
 });
}

test('tracks vibrato (220 Hz, +-40 cents at 5.5 Hz) within 8 cents',async()=>{
 const r=await measure((t)=>220*2**(0.4/12*Math.sin(2*Math.PI*5.5*t)));
 assert.ok(r.p95<8,`p95 error ${r.p95}`);
});

test('tracks a glide from 150 to 300 Hz',async()=>{
 const r=await measure((t)=>150*2**t);
 assert.ok(r.p95<8,`p95 error ${r.p95}`);
});

test('stays accurate with noise and with a missing fundamental',async()=>{
 const noisy=await measure(()=>220,{noise:0.15});
 assert.ok(noisy.p95<5,`noisy p95 ${noisy.p95}`);
 const missing=await measure(()=>220,{firstHarmonic:2});
 assert.ok(missing.p95<5,`missing-fundamental p95 ${missing.p95} (octave errors would be ~1200)`);
});

test('reports unvoiced for silence',async()=>{
 const p=await createProcessor('autotuneMonitorProcessor.worklet.js','vocal-studio-autotune-monitor',{},{sampleRate:SR});
 run(p,new Float32Array(SR),null);
 assert.ok(p.posted.length>50);
 assert.ok(p.posted.every(m=>m.pitchHz===0));
});

test('posts frequently (about every 10 ms) with the audio-clock time',async()=>{
 const r=await measure(()=>220);
 const rate=r.msgs.length/(r.seconds-0.3);
 assert.ok(rate>70&&rate<130,`rate ${rate}/s`);
 for(let i=1;i<r.msgs.length;i++)assert.ok(r.msgs[i].time>r.msgs[i-1].time);
});
