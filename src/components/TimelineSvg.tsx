import {
  addDays,
  addHours,
  addMonths,
  addYears,
  differenceInMilliseconds,
  format,
  min,
  startOfDay,
  startOfHour,
  startOfMonth,
  startOfYear,
} from "date-fns";
import { type PointerEvent, useMemo, useRef, useState } from "react";

import { parseDateTime } from "../domain/datetime";
import { filterItemsByTags, getItemColor } from "../domain/filtering";
import { getItemEnd, getItemStart } from "../domain/items";
import type { TimelineItem, TimelineScale } from "../domain/types";
import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";

const laneHeight = 72;
const headerHeight = 56;
const leftGutter = 140;
const width = 1180;

export function TimelineSvg() {
  const { document, selectedItemId } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{
    itemId: string;
    startClientX: number;
    startClientY: number;
    laneId: string;
  } | null>(null);

  const visibleItems = useMemo(
    () => filterItemsByTags(document.items, document.view.visibleTagIds),
    [document.items, document.view.visibleTagIds],
  );
  const tagsById = useMemo(
    () => new Map(document.tags.map((tag) => [tag.id, tag])),
    [document.tags],
  );
  const sortedLanes = useMemo(
    () => [...document.lanes].sort((a, b) => a.order - b.order),
    [document.lanes],
  );
  const itemIds = new Set(visibleItems.map((item) => item.id));
  const visibleDependencies = document.dependencies.filter(
    (dependency) =>
      itemIds.has(dependency.fromId) && itemIds.has(dependency.toId),
  );

  const range = useMemo(
    () => createRange(visibleItems, document.view.scale),
    [visibleItems, document.view.scale],
  );
  const height = headerHeight + sortedLanes.length * laneHeight + 32;
  const plotWidth = width - leftGutter - 32;
  const totalMs = Math.max(1, range.end.getTime() - range.start.getTime());
  const itemById = new Map(visibleItems.map((item) => [item.id, item]));
  const laneIndexById = new Map(
    sortedLanes.map((lane, index) => [lane.id, index]),
  );

  function xForDate(date: Date) {
    return (
      leftGutter +
      (differenceInMilliseconds(date, range.start) / totalMs) * plotWidth
    );
  }

  function xForItemStart(item: TimelineItem) {
    return xForDate(parseDateTime(getItemStart(item)));
  }

  function xForItemEnd(item: TimelineItem) {
    return xForDate(parseDateTime(getItemEnd(item)));
  }

  function yForLane(laneId: string) {
    return headerHeight + (laneIndexById.get(laneId) ?? 0) * laneHeight;
  }

  function laneIdForClientY(clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) {
      return drag?.laneId;
    }
    const y = clientY - rect.top;
    const index = Math.max(
      0,
      Math.min(
        sortedLanes.length - 1,
        Math.floor((y - headerHeight) / laneHeight),
      ),
    );
    return sortedLanes[index]?.id;
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (!drag) {
      return;
    }

    const rect = svgRef.current?.getBoundingClientRect();
    const item = document.items.find(
      (candidate) => candidate.id === drag.itemId,
    );
    if (!rect || !item) {
      setDrag(null);
      return;
    }

    const deltaPx = event.clientX - drag.startClientX;
    const deltaSeconds = Math.round((deltaPx / plotWidth) * (totalMs / 1000));
    const laneId = laneIdForClientY(event.clientY) ?? drag.laneId;

    if (deltaSeconds !== 0 || laneId !== drag.laneId) {
      dispatch({ type: "moveItem", itemId: item.id, deltaSeconds, laneId });
    }
    setDrag(null);
  }

  return (
    <div className="timelineShell">
      <svg
        ref={svgRef}
        data-timeline-svg="true"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="タイムライン"
        onPointerMove={(event) => {
          if (drag) {
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerUp={handlePointerUp}
      >
        <rect width={width} height={height} fill="#ffffff" />
        <TimelineTicks
          scale={document.view.scale}
          rangeStart={range.start}
          rangeEnd={range.end}
          xForDate={xForDate}
          plotWidth={plotWidth}
          height={height}
        />
        {sortedLanes.map((lane) => {
          const y = yForLane(lane.id);
          return (
            <g key={lane.id}>
              <rect
                x={0}
                y={y}
                width={width}
                height={laneHeight}
                fill="#f8fafc"
              />
              <line x1={0} x2={width} y1={y} y2={y} stroke="#e2e8f0" />
              <text x={20} y={y + 42} className="laneLabel">
                {lane.name}
              </text>
            </g>
          );
        })}
        {document.view.itemDisplay.showDependencyLines &&
          visibleDependencies.map((dependency) => {
            const from = itemById.get(dependency.fromId);
            const to = itemById.get(dependency.toId);
            if (!from || !to) {
              return null;
            }
            const fromX = xForItemEnd(from);
            const toX = xForItemStart(to);
            const fromY = yForLane(from.laneId) + laneHeight / 2;
            const toY = yForLane(to.laneId) + laneHeight / 2;
            const midX = fromX + Math.max(24, (toX - fromX) / 2);
            return (
              <path
                key={dependency.id}
                d={`M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`}
                fill="none"
                stroke="#64748b"
                strokeWidth={2}
                markerEnd="url(#arrow)"
              />
            );
          })}
        <defs>
          <marker
            id="arrow"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 8 3 L 0 6 z" fill="#64748b" />
          </marker>
        </defs>
        {visibleItems.map((item) => {
          const y = yForLane(item.laneId) + 20;
          const color = getItemColor(item, tagsById);
          const isSelected = item.id === selectedItemId;
          if (item.type === "instant") {
            const x = xForItemStart(item);
            return (
              <g
                key={item.id}
                className="timelineItem"
                onPointerDown={(event) => {
                  dispatch({ type: "selectItem", itemId: item.id });
                  setDrag({
                    itemId: item.id,
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    laneId: item.laneId,
                  });
                }}
              >
                <path
                  d={`M ${x} ${y} L ${x + 12} ${y + 12} L ${x} ${y + 24} L ${x - 12} ${y + 12} Z`}
                  fill={color}
                  stroke={isSelected ? "#0f172a" : "#ffffff"}
                  strokeWidth={isSelected ? 3 : 2}
                />
                {document.view.itemDisplay.showLabels && (
                  <text x={x + 16} y={y + 17} className="itemLabel">
                    {item.title}
                  </text>
                )}
              </g>
            );
          }

          const x = xForItemStart(item);
          const itemWidth = Math.max(16, xForItemEnd(item) - x);
          return (
            <g
              key={item.id}
              className="timelineItem"
              onPointerDown={(event) => {
                dispatch({ type: "selectItem", itemId: item.id });
                setDrag({
                  itemId: item.id,
                  startClientX: event.clientX,
                  startClientY: event.clientY,
                  laneId: item.laneId,
                });
              }}
            >
              <rect
                x={x}
                y={y}
                width={itemWidth}
                height={28}
                rx={6}
                fill={color}
                stroke={isSelected ? "#0f172a" : "#ffffff"}
                strokeWidth={isSelected ? 3 : 2}
              />
              {document.view.itemDisplay.showLabels && (
                <text x={x + 10} y={y + 19} className="itemLabel inBar">
                  {item.title}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function TimelineTicks({
  scale,
  rangeStart,
  rangeEnd,
  xForDate,
  plotWidth,
  height,
}: {
  scale: TimelineScale;
  rangeStart: Date;
  rangeEnd: Date;
  xForDate: (date: Date) => number;
  plotWidth: number;
  height: number;
}) {
  const ticks = createTicks(scale, rangeStart, rangeEnd);
  return (
    <g>
      <rect
        x={leftGutter}
        y={0}
        width={plotWidth}
        height={headerHeight}
        fill="#f1f5f9"
      />
      <line
        x1={leftGutter}
        x2={leftGutter}
        y1={0}
        y2={height}
        stroke="#cbd5e1"
      />
      {ticks.map((tick) => {
        const x = xForDate(tick);
        return (
          <g key={tick.toISOString()}>
            <line x1={x} x2={x} y1={0} y2={height} stroke="#e2e8f0" />
            <text x={x + 6} y={28} className="tickLabel">
              {formatTick(scale, tick)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function createRange(items: TimelineItem[], scale: TimelineScale) {
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

function createTicks(scale: TimelineScale, start: Date, end: Date) {
  const ticks: Date[] = [];
  let current = start;

  while (current <= end && ticks.length < 80) {
    ticks.push(current);
    if (scale === "year") {
      current = addYears(current, 1);
    } else if (scale === "month") {
      current = addMonths(current, 1);
    } else if (scale === "day") {
      current = addDays(current, 1);
    } else {
      current = addHours(current, 1);
    }
  }

  return ticks;
}

function formatTick(scale: TimelineScale, date: Date) {
  if (scale === "year") {
    return format(date, "yyyy");
  }
  if (scale === "month") {
    return format(date, "yyyy-MM");
  }
  if (scale === "day") {
    return format(date, "MM-dd");
  }
  return format(date, "HH:mm");
}
