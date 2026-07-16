import { CalendarPlus, ClockPlus } from "lucide-react";

import type { TimelineItem, TimelineScale } from "../domain/types";
import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";

const scales: { value: TimelineScale; label: string }[] = [
  { value: "year", label: "年" },
  { value: "month", label: "月" },
  { value: "day", label: "日" },
  { value: "hour", label: "時" },
];

export function TimelineControls() {
  const { document } = useTimelineState();
  const dispatch = useTimelineDispatch();

  function addDurationItem() {
    const firstLane = sortByOrder(document.lanes)[0];
    if (!firstLane) {
      return;
    }

    const id = createId("item");
    const item: TimelineItem = {
      id,
      type: "duration",
      title: "新しい期間",
      description: "",
      laneId: firstLane.id,
      tagIds: [],
      colorTagId: null,
      color: null,
      start: "2026-07-13T09:00:00",
      end: "2026-07-14T09:00:00",
    };
    dispatch({ type: "addItem", item });
  }

  function addInstantItem() {
    const firstLane = sortByOrder(document.lanes)[0];
    if (!firstLane) {
      return;
    }

    const id = createId("item");
    const item: TimelineItem = {
      id,
      type: "instant",
      title: "新しい時点",
      description: "",
      laneId: firstLane.id,
      tagIds: [],
      colorTagId: null,
      color: null,
      at: "2026-07-13T09:00:00",
    };
    dispatch({ type: "addItem", item });
  }

  return (
    <div className="timelineControls">
      <div className="toolbarGroup">
        {scales.map((scale) => (
          <button
            type="button"
            className={document.view.scale === scale.value ? "active" : ""}
            key={scale.value}
            onClick={() => dispatch({ type: "setScale", scale: scale.value })}
          >
            {scale.label}
          </button>
        ))}
      </div>
      <div className="toolbarGroup timelineEditActions">
        <button
          type="button"
          className="iconButton"
          aria-label="期間追加"
          title="期間追加"
          onClick={addDurationItem}
        >
          <CalendarPlus aria-hidden="true" size={16} />
        </button>
        <button
          type="button"
          className="iconButton"
          aria-label="時点追加"
          title="時点追加"
          onClick={addInstantItem}
        >
          <ClockPlus aria-hidden="true" size={16} />
        </button>
      </div>
    </div>
  );
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`;
}

function sortByOrder<T extends { order: number }>(values: T[]): T[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value.order - b.value.order || a.index - b.index)
    .map(({ value }) => value);
}
