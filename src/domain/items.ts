import { addSecondsToDateTime } from "./datetime";
import type { DateTimeString, TimelineItem } from "./types";

export function getItemStart(item: TimelineItem): DateTimeString {
  return item.type === "duration" ? item.start : item.at;
}

export function getItemEnd(item: TimelineItem): DateTimeString {
  return item.type === "duration" ? item.end : item.at;
}

export function moveItemBySeconds(
  item: TimelineItem,
  seconds: number,
): TimelineItem {
  if (item.type === "instant") {
    return {
      ...item,
      at: addSecondsToDateTime(item.at, seconds),
    };
  }

  return {
    ...item,
    start: addSecondsToDateTime(item.start, seconds),
    end: addSecondsToDateTime(item.end, seconds),
  };
}
