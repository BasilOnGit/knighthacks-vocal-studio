import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {newSnippet} from '../apps/web/src/session/snippets.ts';
import {clipTimelineStartSec,clipTimelineEndSec} from '../apps/web/src/session/clip.ts';
const source=fs.readFileSync(new URL('../apps/web/src/engine/SessionEngine.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^import .*;\n/gm,'').replace('export class SessionEngine','class SessionEngine');
function setup(){
 const players=[];const chains=[];const params=[];
 class Param{constructor(value){this.value=value;params.push(this);}rampTo(value){this.value=value;}cancelScheduledValues(){}}
 class Node{constructor(value=1){this.gain=new Param(value);this.pan=new Param(value);}connect(){return this;}dispose(){this.disposed=true;}toDestination(){return this;}}
 class Player extends Node{constructor(){super();players.push(this);this.buffer={set:buffer=>{this.audio=buffer;}};}sync(){return this;}unsync(){return this;}start(at,offset,duration){this.scheduled={at,offset,duration};return this;}}
 class Delay extends Node{constructor(){super();this.delayTime=new Param(0);}}
 class Chain extends Node{constructor(){super();chains.push(this);this.input=new Node();this.output=new Node();this.updates=[];this.latencySec=0;}setChain(preset){this.preset=preset;}setEnabled(id,on){this.updates.push({id,on});}updateParam(id,key,value){this.updates.push({id,key,value});}onLatencyChange(listener){this.latencyListener=listener;}setAutotuneSource(){}tickAutotune(){}resetAutotuneSmoothing(){}}
 const transport={seconds:0,stop(){},start(){this.started=true;},clear(){},scheduleOnce(callback,at){this.end=at;return 1;},scheduleRepeat(){return 2;}};
 const tone={Gain:Node,Limiter:Node,Panner:Node,Delay,Player,dbToGain:db=>10**(db/20),getTransport:()=>transport,now:()=>0,start:async()=>{}};
 const preload=async()=>{};
 const Engine=new Function('Tone','VocalChain','clipTimelineStartSec','clipTimelineEndSec','preloadNoiseGateWorklet','preloadFormantAutotuneWorklet',code+'\nreturn SessionEngine;')(tone,Chain,clipTimelineStartSec,clipTimelineEndSec,preload,preload);
 return {engine:new Engine(()=>{}),players,chains,tone,transport};
}
const buffer={duration:5};
test('all overlapping snippets schedule concurrently, including trimmed source offsets',async()=>{
 const {engine,players}=setup();const a=newSnippet(buffer,'A','vocal',0,'a');const b=newSnippet(buffer,'B','vocal',1,'b');b.trim={start:2,end:5};b.clipStartSec=-1;
 engine.sync([a,b]);assert.equal(await engine.play(0),true);
 assert.deepEqual(players[0].scheduled,{at:0,offset:0,duration:5});assert.deepEqual(players[1].scheduled,{at:1,offset:2,duration:3});
});
test('per-snippet chains are independent and removed clips release resources',()=>{
 const {engine,players,chains}=setup();const a=newSnippet(buffer,'A','vocal',0,'a');const b=newSnippet(buffer,'B','vocal',0,'b');a.preset.chain=[{id:'reverb-a',type:'reverb',enabled:true,params:{mix:.2}}];
 engine.sync([a,b]);assert.equal(chains[0].preset.chain.length,1);assert.equal(chains[1].preset,undefined);
 const changed={...a,preset:{...a.preset,chain:[{...a.preset.chain[0],params:{mix:.4}}]}};engine.sync([changed,b]);assert.deepEqual(chains[0].updates,[{id:'reverb-a',key:'mix',value:.4}]);assert.equal(chains[1].updates.length,0);
 engine.sync([b]);assert.equal(players[0].disposed,true);assert.equal(chains[0].disposed,true);assert.equal(players[1].disposed,undefined);
});
test('clip volume, pan, track mute and solo use separate audio nodes',()=>{
 const {engine}=setup();const a=newSnippet(buffer,'A','vocal',0,'a');a.volumeDb=-6;a.pan=-.5;const b=newSnippet(buffer,'B','beat',0,'b');engine.sync([a,b]);
 engine.setMixes({vocal:{db:-3,muted:false,solo:true}},['vocal','beat']);
 const slot=engine.slots.get('a');assert.ok(Math.abs(slot.gain.gain.value-10**(-6/20))<1e-8);assert.equal(slot.pan.pan.value,-.5);assert.ok(Math.abs(slot.trackGain.gain.value-10**(-3/20))<1e-8);assert.equal(engine.slots.get('b').trackGain.gain.value,0);
});
test('stopping during audio-context startup cancels playback',async()=>{
 const {engine,tone,transport}=setup();engine.sync([newSnippet(buffer,'A','vocal',0,'a')]);let resolve;tone.start=()=>new Promise(r=>{resolve=r;});const pending=engine.play(0);engine.stop();resolve();assert.equal(await pending,false);assert.equal(transport.started,undefined);
});
test('tracks are delayed to line up with the chain that has the most latency',async()=>{
 const {engine,chains,transport}=setup();const vocal=newSnippet(buffer,'V','vocal',0,'v');const beat=newSnippet(buffer,'B','beat',0,'b');
 engine.sync([vocal,beat]);
 // the vocal's autotune finishes measuring itself ~90 ms of latency
 chains[0].latencySec=.09;chains[0].latencyListener();
 const v=engine.slots.get('v'),b=engine.slots.get('b');
 assert.ok(Math.abs(v.wetComp.delayTime.value-0)<1e-9,'the slow chain needs no extra delay');
 assert.ok(Math.abs(b.wetComp.delayTime.value-.09)<1e-9,'the beat is held back to match');
 assert.ok(Math.abs(v.dryComp.delayTime.value-.09)<1e-9&&Math.abs(b.dryComp.delayTime.value-.09)<1e-9,'bypass path matches the wet path, so A/B stays aligned');
 assert.equal(await engine.play(1),true);
 assert.ok(Math.abs(transport.end-(5+.05+.09))<1e-9,'playback ends after the delayed audio has finished');
 transport.seconds=1.5;assert.ok(Math.abs(engine.getSeconds()-1.41)<1e-9,'reported position follows the audio that is heard');
 transport.seconds=1.02;assert.equal(engine.getSeconds(),1,'position never reports before where playback started');
});
test('no latency anywhere means no compensation delay',()=>{
 const {engine}=setup();engine.sync([newSnippet(buffer,'A','vocal',0,'a'),newSnippet(buffer,'B','beat',0,'b')]);
 for(const slot of engine.slots.values()){assert.equal(slot.dryComp.delayTime.value,0);assert.equal(slot.wetComp.delayTime.value,0);}
});
