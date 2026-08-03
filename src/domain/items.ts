import { addTimelineUnits } from "./datetime";
import type {
  DateTimeString,
  TimelineGranularity,
  TimelineItem,
} from "./types";

export function getItemStart(item: TimelineItem): DateTimeString {
  return item.type === "duration" ? item.start : item.at;
}

export function getItemEnd(item: TimelineItem): DateTimeString {
  return item.type === "duration" ? item.end : item.at;
}

export function getItemExclusiveEnd(
  item: TimelineItem,
  granularity: TimelineGranularity,
): DateTimeString {
  return item.type === "duration"
    ? addTimelineUnits(item.end, 1, granularity)
    : item.at;
}

export function moveItemByUnits(
  item: TimelineItem,
  units: number,
  granularity: TimelineGranularity,
): TimelineItem {
  if (item.type === "instant") {
    return {
      ...item,
      at: addTimelineUnits(item.at, units, granularity),
    };
  }

  return {
    ...item,
    start: addTimelineUnits(item.start, units, granularity),
    end: addTimelineUnits(item.end, units, granularity),
  };
}
