import test from 'node:test';
import assert from 'node:assert/strict';
import {PitchCorrector} from '../apps/web/src/audio/pitchCorrector.ts';
import {chooseNote,nearestScaleNote,snapSemitones,retuneTimeConstant} from '../apps/web/src/audio/autotuneSnap.ts';
import {cleanPitchTrack,pitchHzAtTime} from '../apps/web/src/audio/pitchTrack.ts';

const midiHz=(m)=>440*2**((m-69)/12);
const cents=(a,b)=>1200*Math.log2(a/b);
const C_MAJOR={key:0,scaleMajor:1,snap:1,retuneSpeed:0.75};

/** Feed a constant pitch (MIDI) for `seconds`; returns the final correction. */
function hold(corrector,midi,seconds,params=C_MAJOR,dt=0.01){
 let out=corrector.correction;for(let t=0;t<seconds;t+=dt)out=corrector.step(midi>0?midiHz(midi):0,dt,params);return out;
}
const track=(hzList,step=0.01)=>hzList.map((pitchHz,i)=>({timeSec:i*step,pitchHz}));

// ---- scale logic ----
test('snaps to the nearest note in the key',()=>{
 assert.equal(nearestScaleNote(60.4,0,1),60);
 assert.equal(nearestScaleNote(60.9,0,1),60,'C# is out of key; 60.9 is nearer C than D');
 assert.equal(nearestScaleNote(61.2,0,1),62,'61.2 is nearer D than C');
 assert.equal(nearestScaleNote(61.2,9,0),62,'A minor has the same notes as C major');
 assert.equal(nearestScaleNote(63.2,9,0),64,'63.2 is nearer E than D in A minor');
});

test('snap strength scales the correction; unvoiced and zero snap do nothing',()=>{
 assert.ok(Math.abs(snapSemitones(midiHz(60.3),0,1,1)-(-0.3))<1e-9);
 assert.ok(Math.abs(snapSemitones(midiHz(60.3),0,1,0.5)-(-0.15))<1e-9);
 assert.equal(snapSemitones(midiHz(60.3),0,1,0),0);
 assert.equal(snapSemitones(0,0,1,1),0);
});

test('note choice has hysteresis: it stays on a note until another is clearly nearer',()=>{
 assert.equal(chooseNote(61.05,0,1,60),60,'barely past the midpoint: stay');
 assert.equal(chooseNote(61.4,0,1,60),62,'clearly nearer D: switch');
 assert.equal(chooseNote(61.05,0,1,null),62,'no history: just pick the nearest');
 assert.equal(chooseNote(61.05,0,1,61),62,'a current note that left the scale is dropped');
});

test('faster retune speed means a shorter time constant',()=>{
 assert.ok(Math.abs(retuneTimeConstant(1)-0.008)<1e-9);
 assert.ok(retuneTimeConstant(0)>retuneTimeConstant(0.5)&&retuneTimeConstant(0.5)>retuneTimeConstant(1));
});

// ---- the corrector ----
test('pulls a flat note onto pitch',()=>{
 const flat30=60-0.3;
 assert.ok(Math.abs(hold(new PitchCorrector(),flat30,0.6)-0.3)<0.02);
 assert.ok(Math.abs(hold(new PitchCorrector(),flat30,0.6,{...C_MAJOR,snap:0.5})-0.15)<0.02,'snap 0.5 corrects half way');
});

test('a faster retune speed converges sooner',()=>{
 const timeTo90=(retuneSpeed)=>{const c=new PitchCorrector();for(let i=1;i<=300;i++){if(c.step(midiHz(59.7),0.01,{...C_MAJOR,retuneSpeed})>0.27)return i*0.01;}return Infinity;};
 assert.ok(timeTo90(1)<timeTo90(0.75)&&timeTo90(0.75)<timeTo90(0.2));
});

test('a note near a scale boundary does not flip-flop while it wobbles',()=>{
 const c=new PitchCorrector();
 hold(c,60,0.3);
 // glide up to just past the C/D midpoint (61.0), then wobble +-0.1 around it
 for(let t=0;t<0.5;t+=0.01)c.step(midiHz(60+1.05*(t/0.5)),0.01,C_MAJOR);
 let max=-Infinity;
 for(let t=0;t<1;t+=0.01){const v=c.step(midiHz(61.05+0.1*Math.sin(2*Math.PI*8*t)),0.01,C_MAJOR);max=Math.max(max,v);}
 assert.ok(max<-0.8,`correction should stay on the C side (negative), got max ${max}`);
});

test('the correction is released over silence, not held and applied to the next note',()=>{
 const c=new PitchCorrector();
 assert.ok(Math.abs(hold(c,59.7,0.6)-0.3)<0.02);
 for(let i=0;i<3;i++)c.step(0,0.01,C_MAJOR); // 30 ms: still inside the hold window
 assert.ok(Math.abs(c.correction-0.3)<0.02,'brief unvoiced dips keep the correction');
 hold(c,0,1.0);
 assert.ok(Math.abs(c.correction)<0.01,'long silence releases it');
 const first=c.step(midiHz(62),0.01,C_MAJOR);
 assert.ok(Math.abs(first)<0.05,`an in-tune note after silence must not start with a stale correction (got ${first})`);
});

test('a jump to a new note is corrected for the new note',()=>{
 const c=new PitchCorrector();
 hold(c,59.7,0.5);
 assert.ok(Math.abs(hold(c,64.2,0.6)-(-0.2))<0.03);
});

test('a single glitched frame is rejected when a median is used',()=>{
 const c=new PitchCorrector({medianSize:3});
 hold(c,60,0.3);
 let worst=0;
 for(let i=0;i<10;i++){const v=c.step(midiHz(i===5?66:60),0.01,C_MAJOR);worst=Math.max(worst,Math.abs(v));}
 assert.ok(worst<0.05,`glitch leaked through: ${worst}`);
});

test('garbage input never produces NaN',()=>{
 const c=new PitchCorrector();
 for(const hz of [NaN,Infinity,-5,0])assert.ok(Number.isFinite(c.step(hz,0.01,C_MAJOR)));
 assert.ok(Number.isFinite(c.step(220,NaN,C_MAJOR)));
 assert.ok(Number.isFinite(c.step(220,-1,C_MAJOR)));
});

// ---- offline pitch track clean-up ----
test('octave errors are folded back onto the melody',()=>{
 const out=cleanPitchTrack(track([220,220,220,440,220,220,220]));
 assert.ok(Math.abs(cents(out[3].pitchHz,220))<5,`got ${out[3].pitchHz}`);
});

test('isolated outliers and one-frame dropouts are repaired',()=>{
 const outlier=cleanPitchTrack(track([220,220,220,330,220,220,220]));
 assert.ok(Math.abs(cents(outlier[3].pitchHz,220))<5,'a stray non-octave jump is not treated as singing');
 const dropout=cleanPitchTrack(track([220,220,0,220,220]));
 assert.ok(dropout[2].pitchHz>0&&Math.abs(cents(dropout[2].pitchHz,220))<5,'a 1-frame detector dropout is bridged');
});

test('real silence stays unvoiced and real note changes are preserved',()=>{
 const silent=cleanPitchTrack(track([220,220,220,0,0,0,0,0,220,220,220]));
 assert.deepEqual(silent.slice(3,8).map(f=>f.pitchHz),[0,0,0,0,0]);
 const up=cleanPitchTrack(track([...Array(10).fill(220),...Array(10).fill(246.94)]));
 assert.ok(up.slice(0,7).every(f=>Math.abs(cents(f.pitchHz,220))<10),'before the change');
 assert.ok(up.slice(13).every(f=>Math.abs(cents(f.pitchHz,246.94))<10),'after the change');
});

test('time lookup interpolates in pitch, but steps across note changes',()=>{
 assert.equal(pitchHzAtTime([],1),0);
 const slide=[{timeSec:0,pitchHz:220},{timeSec:1,pitchHz:midiHz(69-12+1)*1}];
 const geo=Math.sqrt(slide[0].pitchHz*slide[1].pitchHz);
 assert.ok(Math.abs(pitchHzAtTime(slide,0.5)-geo)<0.05,'halfway is the geometric mean (log interpolation)');
 const jump=[{timeSec:0,pitchHz:220},{timeSec:1,pitchHz:440}];
 assert.equal(pitchHzAtTime(jump,0.4),220);
 assert.equal(pitchHzAtTime(jump,0.6),440,'no invented in-between notes');
 const edge=[{timeSec:0,pitchHz:220},{timeSec:1,pitchHz:0}];
 assert.equal(pitchHzAtTime(edge,0.25),220);
 assert.equal(pitchHzAtTime(edge,0.75),0,'unvoiced side wins when nearer, so the corrector can release');
 assert.equal(pitchHzAtTime(jump,-1),220);
 assert.equal(pitchHzAtTime(jump,9),440);
});
