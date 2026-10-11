/** Map a pointer X coordinate to timeline seconds inside the arrangement scroller. */
export function timelineSecFromClientX(
  clientX: number,
  scrollEl: HTMLElement,
  durationSec: number,
  pxPerSec: number,
): number {
  const scrollRect = scrollEl.getBoundingClientRect();
  const header =
    parseFloat(getComputedStyle(scrollEl).getPropertyValue('--lane-header-width')) || 190;
  const x = clientX - scrollRect.left + scrollEl.scrollLeft - header;
  const sec = x / pxPerSec;
  return clampTimelineSec(sec, durationSec);
}

export function clampTimelineSec(sec: number, durationSec: number): number {
  const max = Math.max(0, durationSec);
  return Math.min(max, Math.max(0, sec));
}
