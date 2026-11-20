// Eye closure is a visual cue. The time window is an app heuristic, not a clinical threshold.
const windowMs = 8000;
const maxSampleGap = 850;

export function observeEyes(eyes, previous, at) {
  if (!eyes) return null;
  const { blink, ratio } = eyes;
  const baseline = previous?.baseline;
  const confirmedOpen = blink < 0.30 && ratio >= 0.17;
  const openRatio = confirmedOpen ? (baseline === undefined ? ratio : 0.92 * baseline + 0.08 * ratio) : baseline;
  const closed = blink >= 0.67 && ratio <= (baseline === undefined ? 0.15 : baseline * 0.69);
  const gap = previous ? at - previous.at : 0;

  const contiguous = gap > 0 && gap <= maxSampleGap;
  const closedSince = closed ? (contiguous && previous.closed ? previous.closedSince : at) : null;
  const intervals = contiguous ? previous.intervals.filter(({ end }) => end > at - windowMs) : [];
  if (contiguous) intervals.push({ start: previous.at, end: at, closed: closed && previous.closed });

  let observed = 0;
  let closedTime = 0;
  for (const sample of intervals) {
    const duration = sample.end - Math.max(sample.start, at - windowMs);
    observed += duration;
    if (sample.closed) closedTime += duration;
  }
  const sustained = closedSince !== null && at - closedSince >= 1450;
  const frequent = closedTime >= 2000 && closedTime >= observed * 0.41;
  const tired = observed >= 3900 && (sustained || frequent);
  return { at, baseline: openRatio, closed, closedSince, intervals, tired };
}
