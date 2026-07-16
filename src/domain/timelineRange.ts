import {
  addDays,
  addHours,
  addMonths,
  addYears,
  min,
  startOfDay,
  startOfHour,
  startOfMonth,
  startOfYear,
} from "date-fns";

import { formatDateTime, parseDateTime } from "./datetime";
import { getItemEnd, getItemStart } from "./items";
import type {
  DateTimeString,
  TimelineItem,
  TimelineScale,
  TimelineView,
} from "./types";

const minVisibleDurationMs = 60 * 60 * 1000;
const maxVisibleDurationFactor = 4;

export type TimelineDateRange = {
  start: Date;
  end: Date;
};

export function createTimelineRange(
  items: TimelineItem[],
  scale: TimelineScale,
): TimelineDateRange {
  if (items.length === 0) {
    const start = startOfDay(new Date());
    return { start, end: addDays(start, 7) };
  }

  const starts = items.map((item) => parseDateTime(getItemStart(item)));
  const ends = items.map((item) => parseDateTime(getItemEnd(item)));
  const start = min(starts);
  const end = new Date(Math.max(...ends.map((date) => date.getTime())));

  if (scale === "year") {
    return { start: startOfYear(start), end: addYears(startOfYear(end), 1) };
  }
  if (scale === "month") {
    return { start: startOfMonth(start), end: addMonths(startOfMonth(end), 1) };
  }
  if (scale === "day") {
    return { start: startOfDay(start), end: addDays(startOfDay(end), 1) };
  }
  return { start: startOfHour(start), end: addHours(startOfHour(end), 1) };
}

export function resolveVisibleRange(
  visibleRange: TimelineView["visibleRange"],
  fallbackRange: TimelineDateRange,
): TimelineDateRange {
  if (!visibleRange) {
    return fallbackRange;
  }

  return {
    start: parseDateTime(visibleRange.start),
    end: parseDateTime(visibleRange.end),
  };
}

export function zoomTimelineRange({
  range,
  fullRange,
  factor,
  anchor,
}: {
  range: TimelineDateRange;
  fullRange: TimelineDateRange;
  factor: number;
  anchor?: Date;
}): TimelineView["visibleRange"] {
  const currentDuration = durationMs(range);
  const nextDuration = clampDuration(currentDuration * factor, fullRange);
  const anchorTime = anchor?.getTime() ?? centerMs(range);
  const anchorRatio = clamp(
    (anchorTime - range.start.getTime()) / currentDuration,
    0,
    1,
  );
  const start = new Date(anchorTime - nextDuration * anchorRatio);
  const end = new Date(start.getTime() + nextDuration);

  return dateRangeToVisibleRange(
    clampRangeToEnvelope({ start, end }, fullRange),
  );
}

export function panTimelineRange({
  range,
  fullRange,
  deltaRatio,
}: {
  range: TimelineDateRange;
  fullRange: TimelineDateRange;
  deltaRatio: number;
}): TimelineView["visibleRange"] {
  const deltaMs = durationMs(range) * deltaRatio;
  const start = new Date(range.start.getTime() + deltaMs);
  const end = new Date(range.end.getTime() + deltaMs);

  return dateRangeToVisibleRange(
    clampRangeToEnvelope({ start, end }, fullRange),
  );
}

export function dateRangeToVisibleRange(
  range: TimelineDateRange,
): Exclude<TimelineView["visibleRange"], null> {
  return {
    start: formatDateTime(range.start) as DateTimeString,
    end: formatDateTime(range.end) as DateTimeString,
  };
}

function clampRangeToEnvelope(
  range: TimelineDateRange,
  fullRange: TimelineDateRange,
): TimelineDateRange {
  const envelopeDuration = maxDurationMs(fullRange);
  const rangeDuration = Math.min(durationMs(range), envelopeDuration);
  const fullCenter = centerMs(fullRange);
  const envelopeStart = fullCenter - envelopeDuration / 2;
  const envelopeEnd = fullCenter + envelopeDuration / 2;
  let start = range.start.getTime();
  let end = start + rangeDuration;

  if (start < envelopeStart) {
    start = envelopeStart;
    end = start + rangeDuration;
  }
  if (end > envelopeEnd) {
    end = envelopeEnd;
    start = end - rangeDuration;
  }

  return { start: new Date(start), end: new Date(end) };
}

function clampDuration(duration: number, fullRange: TimelineDateRange) {
  return clamp(duration, minVisibleDurationMs, maxDurationMs(fullRange));
}

function maxDurationMs(fullRange: TimelineDateRange) {
  return Math.max(
    minVisibleDurationMs,
    durationMs(fullRange) * maxVisibleDurationFactor,
  );
}

function durationMs(range: TimelineDateRange) {
  return Math.max(1, range.end.getTime() - range.start.getTime());
}

function centerMs(range: TimelineDateRange) {
  return range.start.getTime() + durationMs(range) / 2;
}

function clamp(value: number, minValue: number, maxValue: number) {
  return Math.min(maxValue, Math.max(minValue, value));
}
