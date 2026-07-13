import {
  addSeconds,
  differenceInSeconds,
  format,
  isValid,
  parse,
} from "date-fns";

import type { DateTimeString } from "./types";

const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const dateTimeFormat = "yyyy-MM-dd'T'HH:mm:ss";

export function isDateTimeString(value: string): value is DateTimeString {
  if (!dateTimePattern.test(value)) {
    return false;
  }

  const parsed = parseDateTime(value);
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

export function assertValidDateTime(value: string): DateTimeString {
  if (!isDateTimeString(value) || !isValid(parseDateTime(value))) {
    throw new Error(`Invalid timeline datetime: ${value}`);
  }

  return value;
}
