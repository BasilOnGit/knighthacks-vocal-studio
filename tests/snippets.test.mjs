import test from 'node:test';
import assert from 'node:assert/strict';
import {newSnippet,overlapRows,deleteSnippet,restoreDeletedClip,ignoresDeleteShortcut} from '../apps/web/src/session/snippets.ts';
const buffer={duration:5};
test('new recording appends independent clips on the same track',()=>{
 const first=newSnippet(buffer,'Take 1','track',0,'first');const second=newSnippet(buffer,'Take 2','track',2,'second');
 const clips=[first,second];assert.equal(clips.length,2);assert.notEqual(first.id,second.id);assert.equal(second.trackId,'track');
});
test('overlaps occupy separate rows without changing source or time',()=>{
 const a=newSnippet(buffer,'A','vocal',0,'a');const b=newSnippet(buffer,'B','vocal',2,'b');const c=newSnippet(buffer,'C','vocal',5,'c');
 const layout=overlapRows([a,b,c]);assert.equal(layout.rowCount,2);assert.deepEqual(layout.clips.map(c=>c.row),[0,1,0]);assert.equal(b.clipStartSec,2);
});
test('deleting a selected snippet preserves the others',()=>{
 const a=newSnippet(buffer,'A','vocal',0,'a');const b=newSnippet(buffer,'B','vocal',1,'b');
 assert.deepEqual(deleteSnippet([a,b],'a').map(c=>c.id),['b']);assert.equal(deleteSnippet([a,b],'missing').length,2);
});
test('restoreDeletedClip brings back a removed snippet',()=>{
 const a=newSnippet(buffer,'A','vocal',0,'a');const b=newSnippet(buffer,'B','vocal',1,'b');
 const afterDelete=deleteSnippet([a,b],'a');
 assert.deepEqual(restoreDeletedClip(afterDelete,a).map(c=>c.id),['b','a']);
 assert.equal(restoreDeletedClip([a,b],a).length,2);
});
test('clip sound options do not change another snippet',()=>{
 const a=newSnippet(buffer,'A','vocal',0,'a');const b=newSnippet(buffer,'B','beat',0,'b');
 a.volumeDb=-12;
 assert.equal(b.volumeDb,0);
});
test('typing in editable controls suppresses the delete shortcut',()=>{
 assert.equal(ignoresDeleteShortcut({closest:()=>({})}),true);assert.equal(ignoresDeleteShortcut({closest:()=>null}),false);assert.equal(ignoresDeleteShortcut(null),false);
});
test('moving a clip to another track updates trackId only',()=>{
 const a=newSnippet(buffer,'A','vocal',0,'a');const b=newSnippet(buffer,'B','beat',2,'b');
 const moved={...a,trackId:'beat'};
 assert.equal(moved.trackId,'beat');assert.equal(moved.clipStartSec,0);
 const destLayout=overlapRows([b,moved]);
 assert.equal(destLayout.clips.length,2);
});
