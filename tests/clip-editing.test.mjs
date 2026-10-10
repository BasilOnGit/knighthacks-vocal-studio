import test from 'node:test';
import assert from 'node:assert/strict';
import {anchorForTimelineStart,resizedTrim} from '../apps/web/src/audio/clipEditing.ts';
import {timelineClipStartSec} from '../apps/web/src/audio/sliceBuffer.ts';
test('a left-trimmed clip moves to timeline zero without changing its source trim',()=>{
 const trim={start:3,end:8};const anchor=anchorForTimelineStart(0,trim);
 assert.equal(anchor,-3);assert.equal(timelineClipStartSec(anchor,trim),0);
});
test('extension restores original source samples on either edge',()=>{
 assert.deepEqual(resizedTrim({start:3,end:8},'start',-2,10,5),{start:1,end:8});
 assert.deepEqual(resizedTrim({start:3,end:8},'end',2,10,5),{start:3,end:10});
});
test('left extension respects timeline zero and right extension respects source end',()=>{
 assert.deepEqual(resizedTrim({start:3,end:8},'start',-10,10,1),{start:2,end:8});
 assert.deepEqual(resizedTrim({start:3,end:8},'end',10,10,1),{start:3,end:10});
});
test('trim edges cannot cross',()=>{
 assert.equal(resizedTrim({start:3,end:8},'start',20,10,5).start,7.95);
 assert.equal(resizedTrim({start:3,end:8},'end',-20,10,5).end,3.05);
});
