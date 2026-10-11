import test from 'node:test';
import assert from 'node:assert/strict';
import {createProcessor,wasmBinary,voice,estimateF0,QUANTUM,clock} from './helpers/workletHarness.mjs';
import {PitchCorrector,PLAYBACK_PITCH_LOOKBACK_SEC} from '../apps/web/src/audio/pitchCorrector.ts';
import {buildPitchTrack,pitchHzAtTime} from '../apps/web/src/audio/pitchTrack.ts';

/**
 * Closed loop: a synthetic singer who is flat and has vibrato goes through the real pitch
 * detector / pitch track, the real corrector and the real shifter worklet. We then measure
 * how far the audio that comes out is from the note that was meant.
 */
const SR=48000;
const midiHz=(m)=>440*2**((m-69)/12);
const NOTES=[60,64,67,65,62,64]; // C major melody
const NOTE_SEC=0.7,GLIDE=0.06,FLAT_BY=0.35,VIBRATO=0.25;
const SECONDS=NOTES.length*NOTE_SEC+0.2;
function sungMidi(t){
 const i=Math.min(NOTES.length-1,Math.floor(t/NOTE_SEC));const into=t-i*NOTE_SEC;let m=NOTES[i];
 if(i>0&&into<GLIDE){const x=into/GLIDE;m=NOTES[i-1]+(NOTES[i]-NOTES[i-1])*(x*x*(3-2*x));}
 return m-FLAT_BY+VIBRATO*Math.sin(2*Math.PI*5.5*t);
}
const params={key:0,scaleMajor:1,snap:1,retuneSpeed:0.75};

function tuningError(input,out,latencySec){
 let singer=0,corrected=0,worst=0,n=0;
 for(let i=0;i<NOTES.length;i++){
  for(let t=i*NOTE_SEC+0.2;t+0.06<(i+1)*NOTE_SEC;t+=0.06){ // sustain only: skip the glide and settling
   const target=midiHz(NOTES[i]);
   const fIn=estimateF0(input,SR,Math.floor(t*SR),Math.floor((t+0.06)*SR));
   const fOut=estimateF0(out,SR,Math.floor((t+latencySec)*SR),Math.floor((t+latencySec+0.06)*SR));
   const eIn=Math.abs(1200*Math.log2(fIn/target)),eOut=Math.abs(1200*Math.log2(fOut/target));
   singer+=eIn;corrected+=eOut;worst=Math.max(worst,eOut);n++;
  }
 }
 return {singer:singer/n,corrected:corrected/n,worst};
}

async function runLive(quality){
 const input=voice(SECONDS,SR,(t)=>midiHz(sungMidi(t)));
 const detector=await createProcessor('autotuneMonitorProcessor.worklet.js','vocal-studio-autotune-monitor',{},{sampleRate:SR});
 const shifter=await createProcessor('formantAutotuneProcessor.worklet.js','vocal-studio-formant-autotune',{wasmBinary:wasmBinary(),quality},{sampleRate:SR});
 const corrector=new PitchCorrector({medianSize:3});
 const out=new Float32Array(input.length);
 const inBuf=new Float32Array(QUANTUM),outBuf=new Float32Array(QUANTUM),scratch=new Float32Array(QUANTUM);
 let pitch=0,lastTime=null,seen=0;
 for(let q=0;(q+1)*QUANTUM<=input.length;q++){
  clock.t=q*QUANTUM/SR;
  inBuf.set(input.subarray(q*QUANTUM,(q+1)*QUANTUM));
  detector.process([[inBuf]],[[scratch]],{});
  while(seen<detector.posted.length){ // what monitor.ts does with each detector message
   const m=detector.posted[seen++];const dt=lastTime===null?0.01:m.time-lastTime;lastTime=m.time;
   pitch=corrector.step(m.pitchHz>0&&m.clarity>=0.82?m.pitchHz:0,dt,params);
  }
  shifter.process([[inBuf]],[[outBuf]],{mix:new Float32Array([1]),pitchSemitones:new Float32Array([pitch])});
  out.set(outBuf,q*QUANTUM);
 }
 return {...tuningError(input,out,shifter.latency/SR),underruns:shifter.stream.underruns,latencySec:shifter.latency/SR};
}

async function runPlayback(){
 const input=voice(SECONDS,SR,(t)=>midiHz(sungMidi(t)));
 const frames=buildPitchTrack({sampleRate:SR,length:input.length,numberOfChannels:1,getChannelData:()=>input},{start:0,end:SECONDS});
 const shifter=await createProcessor('formantAutotuneProcessor.worklet.js','vocal-studio-formant-autotune',{wasmBinary:wasmBinary(),quality:'studio'},{sampleRate:SR});
 const corrector=new PitchCorrector({medianSize:1});
 const out=new Float32Array(input.length);
 const inBuf=new Float32Array(QUANTUM),outBuf=new Float32Array(QUANTUM);
 let pitch=0,nextTick=0;
 for(let q=0;(q+1)*QUANTUM<=input.length;q++){
  const t=q*QUANTUM/SR;
  while(nextTick<=t){ // the engine's 20 ms tick, as AutotunePlayback.tick does it
   pitch=corrector.step(pitchHzAtTime(frames,Math.max(0,nextTick-PLAYBACK_PITCH_LOOKBACK_SEC)),0.02,params);nextTick+=0.02;
  }
  inBuf.set(input.subarray(q*QUANTUM,(q+1)*QUANTUM));
  shifter.process([[inBuf]],[[outBuf]],{mix:new Float32Array([1]),pitchSemitones:new Float32Array([pitch])});
  out.set(outBuf,q*QUANTUM);
 }
 return {...tuningError(input,out,shifter.latency/SR),underruns:shifter.stream.underruns,latencySec:shifter.latency/SR};
}

function assertTuned(r,label){
 assert.ok(r.singer>25,`${label}: the test singer should start well out of tune (${r.singer.toFixed(1)} c)`);
 assert.ok(r.corrected<0.4*r.singer,`${label}: corrected error ${r.corrected.toFixed(1)} c should be well under the singer's ${r.singer.toFixed(1)} c`);
 assert.ok(r.corrected<14,`${label}: mean error ${r.corrected.toFixed(1)} c`);
 assert.ok(r.worst<30,`${label}: worst error ${r.worst.toFixed(1)} c`);
 assert.equal(r.underruns,0,`${label}: no clicks`);
}

test('live monitoring pulls a flat, vibrato singer onto the notes',async()=>{
 const r=await runLive('live');assertTuned(r,'live');
 assert.ok(r.latencySec<0.06,`live latency ${r.latencySec}`);
});

test('studio-quality live path is also in tune',async()=>{
 assertTuned(await runLive('studio'),'studio/live');
});

test('clip playback (offline pitch track) pulls the singer onto the notes',async()=>{
 const r=await runPlayback();assertTuned(r,'playback');
});
