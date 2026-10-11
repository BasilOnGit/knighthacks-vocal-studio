/**
 * Harmonic purity: fraction of energy NOT explained by harmonics of f0 (Hann-windowed projection,
 * short windows so slow amplitude/phase drift is tolerated). Lower is cleaner; ~0 for a clean tone.
 */
export function harmonicResidual(buf,sampleRate,f0,start,end,{harmonics=14,windowSec=0.04}={}){
 const N=Math.floor(windowSec*sampleRate);
 let total=0,explained=0;
 for(let s=start;s+N<=end;s+=Math.floor(N/2)){
  let energy=0,hann=0;
  const win=new Float64Array(N);
  for(let i=0;i<N;i++){win[i]=0.5-0.5*Math.cos(2*Math.PI*i/(N-1));energy+=(buf[s+i]*win[i])**2;hann+=win[i]*win[i];}
  let expl=0;
  for(let k=1;k<=harmonics;k++){
   const w=2*Math.PI*k*f0/sampleRate;if(k*f0>sampleRate*0.45)break;
   let c=0,sn=0,cc=0,ss=0;
   for(let i=0;i<N;i++){const x=buf[s+i]*win[i];const cw=Math.cos(w*(s+i))*win[i],sw=Math.sin(w*(s+i))*win[i];c+=x*cw;sn+=x*sw;cc+=cw*cw;ss+=sw*sw;}
   expl+=(c*c)/cc+(sn*sn)/ss;
  }
  total+=energy;explained+=Math.min(expl,energy);
 }
 return total>0?1-explained/total:1;
}

/** Largest sample-to-sample discontinuity relative to the signal's typical slope (click detector). */
export function clickScore(buf,start,end){
 let max=0,sum=0,n=0;
 for(let i=start+2;i<end;i++){
  const d=Math.abs(buf[i]-2*buf[i-1]+buf[i-2]);
  if(d>max)max=d;sum+=d;n++;
 }
 return max/(sum/n||1);
}

export function envelopeFlutter(buf,sampleRate,start,end,windowSec=0.01){
 const win=Math.floor(sampleRate*windowSec);const env=[];
 for(let i=start;i+win<end;i+=win){let s=0;for(let j=0;j<win;j++)s+=buf[i+j]*buf[i+j];env.push(Math.sqrt(s/win));}
 const mean=env.reduce((a,b)=>a+b,0)/env.length;
 const sd=Math.sqrt(env.reduce((a,b)=>a+(b-mean)**2,0)/env.length);
 return sd/mean;
}
