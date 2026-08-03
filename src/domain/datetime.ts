import {
  addDays,
  addHours,
  addMonths,
  addSeconds,
  addYears,
  differenceInDays,
  differenceInHours,
  differenceInMonths,
  differenceInSeconds,
  differenceInYears,
  format,
  isValid,
  parse,
  startOfDay,
  startOfHour,
  startOfMonth,
  startOfYear,
} from "date-fns";

import type {
  DateTimeString,
  TimelineGranularity,
  TimelineScale,
} from "./types";

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

export function toGranularityInput(
  value: DateTimeString,
  granularity: TimelineGranularity,
): string {
  if (granularity === "year") return value.slice(0, 4);
  if (granularity === "month") return value.slice(0, 7);
  if (granularity === "day") return value.slice(0, 10);
  return value.slice(0, 16);
}

export function fromGranularityInput(
  value: string,
  granularity: TimelineGranularity,
): DateTimeString | null {
  const dateTime =
    granularity === "year"
      ? `${value}-01-01T00:00:00`
      : granularity === "month"
        ? `${value}-01T00:00:00`
        : granularity === "day"
          ? `${value}T00:00:00`
          : `${value}:00`;
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

export function addTimelineUnits(
  value: DateTimeString,
  units: number,
  granularity: TimelineGranularity,
): DateTimeString {
  const date = parseDateTime(value);
  if (granularity === "year") return formatDateTime(addYears(date, units));
  if (granularity === "month") return formatDateTime(addMonths(date, units));
  if (granularity === "day") return formatDateTime(addDays(date, units));
  return formatDateTime(addHours(date, units));
}

export function timelineUnitsBetween(
  from: DateTimeString,
  to: DateTimeString,
  granularity: TimelineGranularity,
): number {
  const start = parseDateTime(from);
  const end = parseDateTime(to);
  if (granularity === "year") return differenceInYears(end, start);
  if (granularity === "month") return differenceInMonths(end, start);
  if (granularity === "day") return differenceInDays(end, start);
  return differenceInHours(end, start);
}

export function isAlignedToGranularity(
  value: DateTimeString,
  granularity: TimelineGranularity,
): boolean {
  return snapDateTimeToScale(value, granularity) === value;
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
