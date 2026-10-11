import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const publicDir=path.resolve(here,'../../apps/web/public');
export const QUANTUM=128;

/** The wasm is copied into public/ at build time; fall back to the package copy before that. */
export function readWasm(){
 const built=path.join(publicDir,'rubberband.wasm');
 const packaged=path.resolve(here,'../../node_modules/rubberband-wasm/dist/rubberband.wasm');
 return fs.readFileSync(fs.existsSync(built)?built:packaged);
}

/** ArrayBuffer of the wasm exactly as the main thread hands it to the worklet. */
export function wasmBinary(){
 const bytes=readWasm();
 return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
}

/** Run an AudioWorklet script under Node and return its registered processor classes. */
/** Audio clock seen by worklets as the global `currentTime` (seconds). */
export const clock={t:0};
Object.defineProperty(globalThis,'currentTime',{get:()=>clock.t,configurable:true});

export function loadWorklet(file,{sampleRate=48000}={}){
 const code=fs.readFileSync(path.join(publicDir,file),'utf8');
 const registry=new Map();
 class AudioWorkletProcessor{constructor(){this.posted=[];this.port={postMessage:(m)=>this.posted.push(m),onmessage:null};}}
 const env={AudioWorkletProcessor,registerProcessor:(name,cls)=>registry.set(name,cls),sampleRate};
 const names=Object.keys(env);
 new Function(...names,code)(...names.map(n=>env[n]));
 return registry;
}

export async function createProcessor(file,name,options={},{sampleRate=48000}={}){
 const registry=loadWorklet(file,{sampleRate});
 const Processor=registry.get(name);
 if(!Processor)throw new Error(`processor ${name} not registered`);
 const processor=new Processor({processorOptions:options});
 // wasm init is async: let microtasks settle
 for(let i=0;i<50;i++)await new Promise(r=>setImmediate(r));
 // calibration runs a few quanta per process() call; drive silence until the node reports ready
 const zeros=new Float32Array(QUANTUM),sink=new Float32Array(QUANTUM);
 if('ready' in processor)for(let i=0;i<2000&&!processor.ready&&!processor.initError;i++)processor.process([[zeros]],[[sink]],{mix:new Float32Array([0]),pitchSemitones:new Float32Array([0])});
 return processor;
}

/** Drive a processor with a mono signal in 128-sample quanta. params: (quantumIndex)=>({mix,pitchSemitones}). */
export function run(processor,input,params,{sampleRate=48000}={}){
 const out=new Float32Array(input.length);
 const inBuf=new Float32Array(QUANTUM);
 const outBuf=new Float32Array(QUANTUM);
 for(let q=0;q*QUANTUM+QUANTUM<=input.length;q++){
  clock.t=q*QUANTUM/sampleRate;
  inBuf.set(input.subarray(q*QUANTUM,q*QUANTUM+QUANTUM));
  outBuf.fill(0);
  const p=params?params(q):{mix:0,pitchSemitones:0};
  processor.process([[inBuf]],[[outBuf]],{mix:new Float32Array([p.mix]),pitchSemitones:new Float32Array([p.pitchSemitones])});
  out.set(outBuf,q*QUANTUM);
 }
 return out;
}

/** Voice-like harmonic signal: f0(t) in Hz, harmonics with a gentle formant bump. */
export function voice(seconds,sampleRate,f0At,{harmonics=18,amp=0.3}={}){
 const n=Math.floor(seconds*sampleRate);
 const out=new Float32Array(n);
 let phase=0;
 for(let i=0;i<n;i++){
  const f0=f0At(i/sampleRate);
  phase+=2*Math.PI*f0/sampleRate;
  let s=0;
  for(let k=1;k<=harmonics;k++){
   const f=k*f0;
   if(f>sampleRate*0.45)break;
   const formant=1+2*Math.exp(-Math.pow((f-700)/250,2))+1.2*Math.exp(-Math.pow((f-1800)/400,2));
   s+=formant*Math.sin(k*phase)/k;
  }
  out[i]=amp*s;
 }
 return out;
}

export function rms(buf,start=0,end=buf.length){
 let s=0;for(let i=start;i<end;i++)s+=buf[i]*buf[i];
 return Math.sqrt(s/Math.max(1,end-start));
}

/** Lag (samples) at which `b` best matches `a` (b delayed relative to a). */
export function bestLag(a,b,maxLag,start,end){
 let best=0,bestC=-Infinity;
 for(let lag=0;lag<=maxLag;lag++){
  let c=0;for(let i=start;i<end;i++)c+=a[i]*b[i+lag];
  if(c>bestC){bestC=c;best=lag;}
 }
 return best;
}

/** Fundamental via normalised autocorrelation with parabolic interpolation. */
export function estimateF0(buf,sampleRate,start,end,minHz=80,maxHz=600){
 const minLag=Math.floor(sampleRate/maxHz),maxLag=Math.floor(sampleRate/minHz);
 const corr=new Float64Array(maxLag+2);
 for(let lag=minLag-1;lag<=maxLag+1;lag++){
  let c=0,e1=0,e2=0;
  for(let i=start;i+lag<end;i++){c+=buf[i]*buf[i+lag];e1+=buf[i]*buf[i];e2+=buf[i+lag]*buf[i+lag];}
  corr[lag]=c/Math.sqrt(e1*e2||1);
 }
 let best=minLag;
 for(let lag=minLag;lag<=maxLag;lag++)if(corr[lag]>corr[best])best=lag;
 // prefer the shortest lag that is nearly as good (avoid sub-octave picks)
 for(let lag=minLag;lag<best;lag++)if(corr[lag]>0.95*corr[best]&&corr[lag]>=corr[lag-1]&&corr[lag]>=corr[lag+1]){best=lag;break;}
 const a=corr[best-1],b=corr[best],c=corr[best+1];
 const denom=a-2*b+c;
 const shift=denom!==0?0.5*(a-c)/denom:0;
 return sampleRate/(best+shift);
}

export const centsBetween=(measured,expected)=>1200*Math.log2(measured/expected);
