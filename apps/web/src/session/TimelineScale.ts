import { createContext, useContext } from 'react';
export const TimelineScale = createContext(40);
export function useTimelineScale() { const pxPerSec=useContext(TimelineScale); return {pxPerSec,secToPx:(sec:number)=>sec*pxPerSec}; }
