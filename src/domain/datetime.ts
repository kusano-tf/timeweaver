import {
  addDays,
  addHours,
  addMonths,
  addSeconds,
  addYears,
  differenceInSeconds,
  format,
  isValid,
  parse,
  startOfDay,
  startOfHour,
  startOfMonth,
  startOfYear,
} from "date-fns";

import type { DateTimeString, TimelineScale } from "./types";

const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const dateTimeLocalMinutePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const dateTimeFormat = "yyyy-MM-dd'T'HH:mm:ss";

export function isDateTimeString(value: string): value is DateTimeString {
  if (!dateTimePattern.test(value)) {
    return false;
  }

  const parsed = parseDateTime(value);
  if (!isValid(parsed)) {
    return false;
  }

  return formatDateTime(parsed) === value;
}

export function parseDateTime(value: DateTimeString): Date {
  return parse(value, dateTimeFormat, new Date(0));
}

export function formatDateTime(value: Date): DateTimeString {
  return format(value, dateTimeFormat);
}

export function compareDateTime(a: DateTimeString, b: DateTimeString): number {
  return parseDateTime(a).getTime() - parseDateTime(b).getTime();
}

export function toDateTimeLocalMinute(value: DateTimeString): string {
  return value.slice(0, 16);
}

export function fromDateTimeLocalMinute(value: string): DateTimeString | null {
  if (!dateTimeLocalMinutePattern.test(value)) {
    return null;
  }

  const dateTime = `${value}:00`;
  return isDateTimeString(dateTime) ? dateTime : null;
}

export function addSecondsToDateTime(
  value: DateTimeString,
  seconds: number,
): DateTimeString {
  return formatDateTime(addSeconds(parseDateTime(value), seconds));
}

export function secondsBetween(
  from: DateTimeString,
  to: DateTimeString,
): number {
  return differenceInSeconds(parseDateTime(to), parseDateTime(from));
}

/**
 * Snaps a local, second-precise datetime to the closest calendar boundary for
 * a timeline scale. Exact midpoints deliberately choose the later boundary.
 */
export function snapDateTimeToScale(
  value: DateTimeString,
  scale: TimelineScale,
): DateTimeString {
  const date = parseDateTime(value);
  const previous = startOfTimelineScale(scale, date);
  const next = nextTimelineScaleBoundary(scale, previous);
  const previousDistance = date.getTime() - previous.getTime();
  const nextDistance = next.getTime() - date.getTime();

  return formatDateTime(nextDistance <= previousDistance ? next : previous);
}

function startOfTimelineScale(scale: TimelineScale, date: Date): Date {
  if (scale === "year") {
    return startOfYear(date);
  }
  if (scale === "month") {
    return startOfMonth(date);
  }
  if (scale === "day") {
    return startOfDay(date);
  }
  return startOfHour(date);
}

function nextTimelineScaleBoundary(scale: TimelineScale, date: Date): Date {
  if (scale === "year") {
    return addYears(date, 1);
  }
  if (scale === "month") {
    return addMonths(date, 1);
  }
  if (scale === "day") {
    return addDays(date, 1);
  }
  return addHours(date, 1);
}

export function assertValidDateTime(value: string): DateTimeString {
  if (!isDateTimeString(value) || !isValid(parseDateTime(value))) {
    throw new Error(`Invalid timeline datetime: ${value}`);
  }

  return value;
}
