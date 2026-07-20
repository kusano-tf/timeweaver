import {
  addDays,
  addHours,
  addMonths,
  addYears,
  differenceInMilliseconds,
  format,
  startOfDay,
  startOfHour,
  startOfMonth,
  startOfYear,
} from "date-fns";
import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";

import { parseDateTime } from "../domain/datetime";
import { filterItemsByTags, getItemColor } from "../domain/filtering";
import { getItemEnd, getItemStart } from "../domain/items";
import {
  createTimelineRange,
  panTimelineRange,
  resolveVisibleRange,
  type TimelineDateRange,
  zoomTimelineRange,
} from "../domain/timelineRange";
import type { Lane, TimelineItem, TimelineScale } from "../domain/types";
import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";

const minLaneHeight = 72;
const headerHeight = 56;
const leftGutter = 140;
const minTimelineWidth = 1180;
const itemTopOffset = 20;
const itemRowStep = 40;
const itemHeight = 28;
const itemGap = 8;

export function TimelineSvg() {
  const { document, selectedItemId, selectedDependencyId } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [timelineWidth, setTimelineWidth] = useState(minTimelineWidth);
  const [drag, setDrag] = useState<{
    itemId: string;
    startClientX: number;
    startClientY: number;
    laneId: string;
  } | null>(null);

  const tagFilteredItems = useMemo(
    () => filterItemsByTags(document.items, document.view.visibleTagIds),
    [document.items, document.view.visibleTagIds],
  );
  const tagsById = useMemo(
    () => new Map(document.tags.map((tag) => [tag.id, tag])),
    [document.tags],
  );
  const sortedLanes = useMemo(
    () => sortByOrder(document.lanes),
    [document.lanes],
  );
  const fullRange = useMemo(
    () => createTimelineRange(tagFilteredItems, document.view.scale),
    [tagFilteredItems, document.view.scale],
  );
  const range = useMemo(
    () => resolveVisibleRange(document.view.visibleRange, fullRange),
    [document.view.visibleRange, fullRange],
  );
  const visibleItems = useMemo(
    () => filterItemsByRange(tagFilteredItems, range),
    [tagFilteredItems, range],
  );
  const itemIds = new Set(visibleItems.map((item) => item.id));
  const visibleDependencies = document.dependencies.filter(
    (dependency) =>
      itemIds.has(dependency.fromId) && itemIds.has(dependency.toId),
  );

  const width = timelineWidth;
  const plotWidth = width - leftGutter - 32;
  const totalMs = Math.max(1, range.end.getTime() - range.start.getTime());
  const itemById = new Map(visibleItems.map((item) => [item.id, item]));
  const itemLayout = createItemLayout(visibleItems, xForItemStart, xForItemEnd);
  const laneRowsById = countLaneRows(sortedLanes, itemLayout);
  const laneGeometry = createLaneGeometry(sortedLanes, laneRowsById);
  const height = laneGeometry.totalHeight + 32;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  });

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }
      setTimelineWidth(
        Math.max(minTimelineWidth, Math.floor(entry.contentRect.width)),
      );
    });

    resizeObserver.observe(shell);
    return () => resizeObserver.disconnect();
  }, []);

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
    return laneGeometry.byId.get(laneId)?.top ?? headerHeight;
  }

  function heightForLane(laneId: string) {
    return laneGeometry.byId.get(laneId)?.height ?? minLaneHeight;
  }

  function yForItem(item: TimelineItem) {
    const laneTop = yForLane(item.laneId);
    const row = itemLayout.get(item.id)?.row ?? 0;
    return laneTop + itemTopOffset + row * itemRowStep;
  }

  function laneIdForClientY(clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) {
      return drag?.laneId;
    }
    const y = clientY - rect.top;
    return (
      sortedLanes.find((lane) => {
        const geometry = laneGeometry.byId.get(lane.id);
        if (!geometry) {
          return false;
        }
        return y >= geometry.top && y < geometry.top + geometry.height;
      })?.id ?? sortedLanes.at(-1)?.id
    );
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

  function handleWheel(event: WheelEvent) {
    if (!event.ctrlKey && !event.shiftKey) {
      return;
    }

    event.preventDefault();

    if (event.ctrlKey) {
      const anchor = dateForClientX(event.clientX);
      dispatch({
        type: "setVisibleRange",
        visibleRange: zoomTimelineRange({
          range,
          fullRange,
          factor: event.deltaY > 0 ? 2 : 0.5,
          anchor,
        }),
      });
      return;
    }

    const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
    dispatch({
      type: "setVisibleRange",
      visibleRange: panTimelineRange({
        range,
        fullRange,
        deltaRatio: delta > 0 ? 0.1 : -0.1,
      }),
    });
  }

  function dateForClientX(clientX: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) {
      return new Date(range.start.getTime() + totalMs / 2);
    }

    const svgX = ((clientX - rect.left) / rect.width) * width;
    const ratio = Math.min(1, Math.max(0, (svgX - leftGutter) / plotWidth));
    return new Date(range.start.getTime() + totalMs * ratio);
  }

  return (
    <div className="timelineShell" ref={shellRef}>
      <svg
        ref={svgRef}
        data-timeline-svg="true"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="タイムライン"
        onPointerDown={() => dispatch({ type: "selectItem", itemId: null })}
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
          const laneHeight = heightForLane(lane.id);
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
        <defs>
          <clipPath id="timeline-plot-clip">
            <rect
              x={leftGutter}
              y={headerHeight}
              width={plotWidth}
              height={Math.max(0, height - headerHeight)}
            />
          </clipPath>
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
          <marker
            id="selected-arrow"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 8 3 L 0 6 z" fill="#0f172a" />
          </marker>
        </defs>
        <g clipPath="url(#timeline-plot-clip)">
          {document.view.itemDisplay.showDependencyLines &&
            visibleDependencies.map((dependency) => {
              const from = itemById.get(dependency.fromId);
              const to = itemById.get(dependency.toId);
              if (!from || !to) {
                return null;
              }
              const fromX = xForItemEnd(from);
              const toX = xForItemStart(to);
              const fromY = yForItem(from) + itemHeight / 2;
              const toY = yForItem(to) + itemHeight / 2;
              const isSelected = dependency.id === selectedDependencyId;
              return (
                <path
                  key={dependency.id}
                  d={createDependencyPath({ fromX, fromY, toX, toY })}
                  fill="none"
                  stroke={isSelected ? "#0f172a" : "#64748b"}
                  strokeWidth={isSelected ? 3 : 2}
                  className="dependencyLine"
                  markerEnd={
                    isSelected ? "url(#selected-arrow)" : "url(#arrow)"
                  }
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    dispatch({
                      type: "selectDependency",
                      dependencyId: dependency.id,
                    });
                  }}
                />
              );
            })}
          {visibleItems.map((item) => {
            const y = yForItem(item);
            const color = getItemColor(item, tagsById);
            const isSelected = item.id === selectedItemId;
            if (item.type === "instant") {
              const x = xForItemStart(item);
              return (
                <g
                  key={item.id}
                  className="timelineItem"
                  onPointerDown={(event) => {
                    event.stopPropagation();
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
                  event.stopPropagation();
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
        </g>
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
  const boundaryTicks = createBoundaryTicks(scale, rangeStart, rangeEnd);
  const labelInterval = createLabelInterval(scale, ticks, xForDate);
  const boundaryTimes = new Set(boundaryTicks.map((tick) => tick.getTime()));
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
        const isBoundary = boundaryTimes.has(tick.getTime());
        return (
          <g key={tick.toISOString()}>
            <line
              x1={x}
              x2={x}
              y1={0}
              y2={height}
              stroke={isBoundary ? "#cbd5e1" : "#e2e8f0"}
              strokeWidth={isBoundary ? 1.5 : 1}
            />
            {shouldShowTickLabel(scale, tick, labelInterval, isBoundary) && (
              <text x={x + 6} y={34} className="tickLabel">
                {formatTick(scale, tick)}
              </text>
            )}
          </g>
        );
      })}
      {boundaryTicks.map((tick) => {
        const x = xForDate(tick);
        return (
          <g key={`boundary-${tick.toISOString()}`}>
            <line
              x1={x}
              x2={x}
              y1={0}
              y2={height}
              stroke="#94a3b8"
              strokeWidth={2}
            />
            <text x={x + 6} y={18} className="boundaryTickLabel">
              {formatBoundaryTick(scale, tick)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function createTicks(scale: TimelineScale, start: Date, end: Date) {
  const ticks: Date[] = [];
  let current = startOfScale(scale, start);

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

function startOfScale(scale: TimelineScale, date: Date) {
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

function filterItemsByRange(
  items: TimelineItem[],
  range: TimelineDateRange,
): TimelineItem[] {
  return items.filter((item) => itemOverlapsRange(item, range));
}

function itemOverlapsRange(item: TimelineItem, range: TimelineDateRange) {
  const start = parseDateTime(getItemStart(item)).getTime();
  const end = parseDateTime(getItemEnd(item)).getTime();
  const rangeStart = range.start.getTime();
  const rangeEnd = range.end.getTime();

  if (item.type === "instant") {
    return start >= rangeStart && start <= rangeEnd;
  }

  return start <= rangeEnd && end >= rangeStart;
}

function createBoundaryTicks(scale: TimelineScale, start: Date, end: Date) {
  if (scale !== "hour" && scale !== "day") {
    return [];
  }

  const ticks: Date[] = [];
  let current = scale === "hour" ? startOfDay(start) : startOfMonth(start);
  const addNext = scale === "hour" ? addDays : addMonths;

  while (current <= end && ticks.length < 80) {
    if (current >= start) {
      ticks.push(current);
    }
    current = addNext(current, 1);
  }

  return ticks;
}

function createLabelInterval(
  scale: TimelineScale,
  ticks: Date[],
  xForDate: (date: Date) => number,
) {
  if (ticks.length < 2) {
    return 1;
  }

  const tickSpacing = Math.abs(xForDate(ticks[1]) - xForDate(ticks[0]));
  if (tickSpacing <= 0) {
    return 1;
  }

  if (scale === "hour") {
    return nearestInterval(Math.ceil(56 / tickSpacing), [1, 3, 6, 12, 24]);
  }
  if (scale === "day") {
    return nearestInterval(Math.ceil(64 / tickSpacing), [1, 2, 7, 14]);
  }
  return 1;
}

function shouldShowTickLabel(
  scale: TimelineScale,
  tick: Date,
  labelInterval: number,
  isBoundary: boolean,
) {
  if (isBoundary) {
    return false;
  }
  if (scale !== "hour" && scale !== "day") {
    return true;
  }

  if (scale === "hour") {
    return tick.getHours() % labelInterval === 0;
  }

  return (tick.getDate() - 1) % labelInterval === 0;
}

function nearestInterval(minInterval: number, intervals: number[]) {
  return (
    intervals.find((interval) => interval >= minInterval) ??
    intervals[intervals.length - 1] ??
    1
  );
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
  return format(date, "HH");
}

function formatBoundaryTick(scale: TimelineScale, date: Date) {
  if (scale === "hour") {
    return format(date, "MM-dd");
  }
  if (scale === "day") {
    return format(date, "yyyy-MM");
  }
  return formatTick(scale, date);
}

type ItemLayout = {
  laneId: string;
  row: number;
  xStart: number;
  xEnd: number;
};

function createItemLayout(
  items: TimelineItem[],
  xForItemStart: (item: TimelineItem) => number,
  xForItemEnd: (item: TimelineItem) => number,
): Map<string, ItemLayout> {
  const layout = new Map<string, ItemLayout>();
  const rowsByLane = new Map<string, number[]>();
  const sortedItems = [...items].sort((a, b) => {
    const startDiff = xForItemStart(a) - xForItemStart(b);
    if (startDiff !== 0) {
      return startDiff;
    }
    return xForItemEnd(a) - xForItemEnd(b);
  });

  for (const item of sortedItems) {
    const xStart = xForItemStart(item);
    const xEnd = visualEndForItem(item, xStart, xForItemEnd(item));
    const rows = rowsByLane.get(item.laneId) ?? [];
    const row = firstAvailableRow(rows, xStart);

    rows[row] = xEnd + itemGap;
    rowsByLane.set(item.laneId, rows);
    layout.set(item.id, { laneId: item.laneId, row, xStart, xEnd });
  }

  return layout;
}

function visualEndForItem(item: TimelineItem, xStart: number, xEnd: number) {
  if (item.type === "instant") {
    return xStart + Math.max(64, item.title.length * 9 + 32);
  }

  return xStart + Math.max(48, xEnd - xStart, item.title.length * 8 + 24);
}

function firstAvailableRow(rowEnds: number[], xStart: number) {
  const row = rowEnds.findIndex((rowEnd) => rowEnd <= xStart);
  return row === -1 ? rowEnds.length : row;
}

function createDependencyPath({
  fromX,
  fromY,
  toX,
  toY,
}: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}) {
  const minForwardGap = 56;
  const elbowPadding = 28;
  const bypassPadding = 44;
  const rowBypass = 28;
  const sameRowTolerance = 0.5;

  if (Math.abs(fromY - toY) <= sameRowTolerance && toX >= fromX) {
    return `M ${fromX} ${fromY} H ${toX}`;
  }

  if (toX - fromX >= minForwardGap) {
    const elbowX = fromX + Math.max(elbowPadding, (toX - fromX) / 2);
    return `M ${fromX} ${fromY} H ${elbowX} V ${toY} H ${toX}`;
  }

  const escapeX = Math.max(fromX + bypassPadding, toX + bypassPadding);
  const approachX = toX - elbowPadding;
  const bypassY = fromY === toY ? fromY - rowBypass : fromY + (toY - fromY) / 2;

  return `M ${fromX} ${fromY} H ${escapeX} V ${bypassY} H ${approachX} V ${toY} H ${toX}`;
}

function countLaneRows(
  lanes: Lane[],
  itemLayout: Map<string, ItemLayout>,
): Map<string, number> {
  const rowsByLane = new Map(lanes.map((lane) => [lane.id, 1]));

  for (const layout of itemLayout.values()) {
    const current = rowsByLane.get(layout.laneId) ?? 1;
    rowsByLane.set(layout.laneId, Math.max(current, layout.row + 1));
  }

  return rowsByLane;
}

function createLaneGeometry(lanes: Lane[], laneRowsById: Map<string, number>) {
  const byId = new Map<string, { top: number; height: number }>();
  let top = headerHeight;

  for (const lane of lanes) {
    const rows = laneRowsById.get(lane.id) ?? 1;
    const height = Math.max(
      minLaneHeight,
      itemTopOffset + rows * itemRowStep + itemHeight / 2,
    );
    byId.set(lane.id, { top, height });
    top += height;
  }

  return { byId, totalHeight: top };
}

function sortByOrder<T extends { order: number }>(values: T[]): T[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value.order - b.value.order || a.index - b.index)
    .map(({ value }) => value);
}
