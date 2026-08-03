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

import {
  addTimelineUnits,
  parseDateTime,
  snapDateTimeToScale,
  timelineUnitsBetween,
} from "../domain/datetime";
import { filterItemsByTags, getItemColor } from "../domain/filtering";
import { getItemExclusiveEnd, getItemStart } from "../domain/items";
import type { TimelineTheme } from "../domain/theme";
import {
  createTimelineRange,
  panTimelineRange,
  resolveVisibleRange,
  type TimelineDateRange,
  zoomTimelineRange,
} from "../domain/timelineRange";
import type { Lane, TimelineItem, TimelineScale } from "../domain/types";
import { useDebugEnabled, useDebugReporter } from "../state/DebugContext";
import { useTheme } from "../state/ThemeContext";
import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";
import { PropagationPrompt } from "./PropagationPrompt";

const minLaneHeight = 72;
const headerHeight = 56;
const laneHeaderWidth = 140;
const minTimelineWidth = 1180;
const itemTopOffset = 20;
const itemRowStep = 40;
const itemHeight = 28;
const itemGap = 8;
const dragModeRatio = 1.2;
const maxRenderedTicks = 80;

type DragMode = "time" | "lane";

type DragState = {
  itemId: string;
  startClientX: number;
  startClientY: number;
  currentClientX: number;
  currentClientY: number;
  laneId: string;
  mode: DragMode | null;
};

type PendingMove = {
  itemId: string;
  deltaUnits: number;
  deltaPx: number;
  descendantCount: number;
};

export function TimelineSvg() {
  const { document, selectedItemId, selectedDependencyId } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const { enabled: debugEnabled } = useDebugEnabled();
  const { reportTimeline } = useDebugReporter();
  const { theme } = useTheme();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [timelineWidth, setTimelineWidth] = useState(minTimelineWidth);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

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
    () =>
      createTimelineRange(
        tagFilteredItems,
        document.view.scale,
        document.timeline.granularity,
      ),
    [tagFilteredItems, document.view.scale, document.timeline.granularity],
  );
  const range = useMemo(
    () => resolveVisibleRange(document.view.visibleRange, fullRange),
    [document.view.visibleRange, fullRange],
  );
  const visibleItems = useMemo(
    () =>
      filterItemsByRange(
        tagFilteredItems,
        range,
        document.timeline.granularity,
      ),
    [tagFilteredItems, range, document.timeline.granularity],
  );
  const itemIds = new Set(visibleItems.map((item) => item.id));
  const visibleDependencies = document.dependencies.filter(
    (dependency) =>
      itemIds.has(dependency.fromId) && itemIds.has(dependency.toId),
  );

  const width = timelineWidth;
  const plotWidth = width - laneHeaderWidth;
  const totalMs = Math.max(1, range.end.getTime() - range.start.getTime());
  const itemById = new Map(visibleItems.map((item) => [item.id, item]));
  const itemLayout = createItemLayout(visibleItems, xForItemStart, xForItemEnd);
  const laneRowsById = countLaneRows(sortedLanes, itemLayout);
  const laneGeometry = createLaneGeometry(sortedLanes, laneRowsById);
  const activeDrag = drag ? resolveDragState(drag) : null;
  const previewLaneId =
    drag && activeDrag?.mode === "lane"
      ? (laneIdForClientY(drag.currentClientY) ?? drag.laneId)
      : null;
  const previewItems =
    drag && previewLaneId
      ? visibleItems.map((item) =>
          item.id === drag.itemId ? { ...item, laneId: previewLaneId } : item,
        )
      : visibleItems;
  const previewItemLayout =
    drag && activeDrag?.mode === "lane"
      ? createItemLayout(previewItems, xForItemStart, xForItemEnd)
      : itemLayout;
  const height = laneGeometry.totalHeight;
  const debugTickInfo = debugEnabled
    ? createTickDebugInfo(
        document.view.scale,
        range.start,
        range.end,
        xForDate,
        plotWidth,
      )
    : null;
  const selectedItem =
    debugEnabled && selectedItemId
      ? (document.items.find((item) => item.id === selectedItemId) ?? null)
      : null;
  const selectedVisibleItem =
    debugEnabled && selectedItemId
      ? (itemById.get(selectedItemId) ?? null)
      : null;
  const selectedLayout = selectedVisibleItem
    ? describeItemLayout(
        selectedVisibleItem,
        xForItemStart,
        xForItemEnd,
        yForItem,
      )
    : null;
  const debugInfo = debugTickInfo
    ? {
        view: {
          scale: document.view.scale,
          visibleRange: formatRange(range),
          baseRange: formatRange(fullRange),
          zoomRatio:
            (fullRange.end.getTime() - fullRange.start.getTime()) / totalMs,
          pixelsPerHour: (plotWidth / totalMs) * 3_600_000,
        },
        render: {
          svgSize: `${width} × ${height}px`,
          plotWidth,
          tickInterval: debugTickInfo.tickInterval,
          labelInterval: debugTickInfo.labelInterval,
          tickCount: debugTickInfo.tickCount,
          boundaryTickCount: debugTickInfo.boundaryTickCount,
          filteredItemCount: tagFilteredItems.length,
          visibleItemCount: visibleItems.length,
          visibleDependencyCount: visibleDependencies.length,
        },
        selection: {
          item: selectedItem ? describeItem(selectedItem) : null,
          dependency: selectedDependencyId ?? null,
          itemLayout: selectedLayout,
        },
        interaction: {
          drag: activeDrag
            ? `${activeDrag.itemId} / ${activeDrag.mode} / Δx ${Math.round(activeDrag.currentClientX - activeDrag.startClientX)}px / Δy ${Math.round(activeDrag.currentClientY - activeDrag.startClientY)}px`
            : null,
          filter:
            document.view.visibleTagIds.length > 0
              ? document.view.visibleTagIds.join(", ")
              : "なし",
        },
      }
    : null;

  useEffect(() => {
    if (debugInfo) {
      reportTimeline(debugInfo);
    }
  }, [debugInfo, reportTimeline]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  });

  useEffect(() => {
    if (!pendingMove) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPendingMove(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingMove]);

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
      laneHeaderWidth +
      (differenceInMilliseconds(date, range.start) / totalMs) * plotWidth
    );
  }

  function xForItemStart(item: TimelineItem) {
    return xForDate(parseDateTime(getItemStart(item)));
  }

  function xForItemEnd(item: TimelineItem) {
    return xForDate(
      parseDateTime(getItemExclusiveEnd(item, document.timeline.granularity)),
    );
  }

  function yForLane(laneId: string) {
    return laneGeometry.byId.get(laneId)?.top ?? headerHeight;
  }

  function heightForLane(laneId: string) {
    return laneGeometry.byId.get(laneId)?.height ?? minLaneHeight;
  }

  function yForItem(item: TimelineItem) {
    return yForLayoutItem(item, itemLayout);
  }

  function yForPreviewItem(item: TimelineItem) {
    return yForLayoutItem(item, previewItemLayout);
  }

  function yForLayoutItem(item: TimelineItem, layout: Map<string, ItemLayout>) {
    const laneTop = yForLane(item.laneId);
    const row = layout.get(item.id)?.row ?? 0;
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

    const nextDrag = resolveDragState({
      ...drag,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
    });
    const rawDeltaPx =
      nextDrag.mode === "time" ? event.clientX - drag.startClientX : 0;
    const rawDeltaSeconds = Math.round(
      (rawDeltaPx / plotWidth) * (totalMs / 1000),
    );
    const deltaUnits = snappedDragDeltaUnits(item, rawDeltaSeconds);
    const deltaPx =
      nextDrag.mode === "time"
        ? xForDate(
            parseDateTime(
              addTimelineUnits(
                getItemStart(item),
                deltaUnits,
                document.timeline.granularity,
              ),
            ),
          ) - xForItemStart(item)
        : 0;
    const laneId =
      nextDrag.mode === "lane"
        ? (laneIdForClientY(event.clientY) ?? drag.laneId)
        : drag.laneId;

    const descendantCount = countDescendants(item.id, document.dependencies);
    if (nextDrag.mode === "time" && deltaUnits !== 0 && descendantCount > 0) {
      setPendingMove({
        itemId: item.id,
        deltaUnits,
        deltaPx,
        descendantCount,
      });
    } else if (deltaUnits !== 0 || laneId !== drag.laneId) {
      dispatch({
        type: "moveItem",
        itemId: item.id,
        deltaUnits,
        laneId,
        propagate: nextDrag.mode === "time",
      });
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
    const ratio = Math.min(
      1,
      Math.max(0, (svgX - laneHeaderWidth) / plotWidth),
    );
    return new Date(range.start.getTime() + totalMs * ratio);
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!drag) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag((current) =>
      current
        ? resolveDragState({
            ...current,
            currentClientX: event.clientX,
            currentClientY: event.clientY,
          })
        : current,
    );
  }

  function beginDrag(item: TimelineItem, event: PointerEvent<SVGGElement>) {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dispatch({ type: "selectItem", itemId: item.id });
    setDrag({
      itemId: item.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      laneId: item.laneId,
      mode: null,
    });
  }

  function renderTimelineItem({
    item,
    x,
    y,
    opacity = 1,
    pointerEvents,
    keySuffix = "",
  }: {
    item: TimelineItem;
    x: number;
    y: number;
    opacity?: number;
    pointerEvents?: "none";
    keySuffix?: string;
  }) {
    const color = getItemColor(item, tagsById);
    const isSelected = item.id === selectedItemId;
    const key = `${item.id}${keySuffix}`;
    const commonProps = {
      className: "timelineItem",
      opacity,
      pointerEvents,
      onPointerDown: (event: PointerEvent<SVGGElement>) =>
        beginDrag(item, event),
    };

    if (item.type === "instant") {
      return (
        <g key={key} {...commonProps}>
          <path
            d={`M ${x} ${y} L ${x + 12} ${y + 12} L ${x} ${y + 24} L ${x - 12} ${y + 12} Z`}
            fill={color}
            stroke={isSelected ? theme.uiSelectionStroke : theme.itemStroke}
            strokeWidth={isSelected ? 3 : 2}
            data-selected-stroke={isSelected ? "true" : undefined}
          />
          {document.view.itemDisplay.showLabels && (
            <text
              x={x + 16}
              y={y + 17}
              className="itemLabel"
              fill={theme.itemLabel}
            >
              {item.title}
            </text>
          )}
        </g>
      );
    }

    const itemWidth = Math.max(16, xForItemEnd(item) - xForItemStart(item));
    return (
      <g key={key} {...commonProps}>
        <rect
          x={x}
          y={y}
          width={itemWidth}
          height={28}
          rx={6}
          fill={color}
          stroke={isSelected ? theme.uiSelectionStroke : theme.itemStroke}
          strokeWidth={isSelected ? 3 : 2}
          data-selected-stroke={isSelected ? "true" : undefined}
        />
        {document.view.itemDisplay.showLabels && (
          <text
            x={x + 10}
            y={y + 19}
            className="itemLabel inBar"
            fill={theme.itemLabelOnColor}
          >
            {item.title}
          </text>
        )}
      </g>
    );
  }

  function renderDragPreview() {
    if (pendingMove) {
      const item = visibleItems.find(
        (candidate) => candidate.id === pendingMove.itemId,
      );
      if (!item) {
        return null;
      }
      return renderTimelineItem({
        item,
        x: xForItemStart(item) + pendingMove.deltaPx,
        y: yForItem(item),
        pointerEvents: "none",
        keySuffix: "-pending-preview",
      });
    }

    if (!drag || !activeDrag) {
      return null;
    }

    const item =
      activeDrag.mode === "lane" && previewLaneId
        ? previewItems.find((candidate) => candidate.id === drag.itemId)
        : visibleItems.find((candidate) => candidate.id === drag.itemId);
    if (!item) {
      return null;
    }

    const rawDeltaPx =
      activeDrag.mode === "time" ? drag.currentClientX - drag.startClientX : 0;
    const rawDeltaSeconds = Math.round(
      (rawDeltaPx / plotWidth) * (totalMs / 1000),
    );
    const deltaUnits = snappedDragDeltaUnits(item, rawDeltaSeconds);
    const deltaX =
      activeDrag.mode === "time"
        ? xForDate(
            parseDateTime(
              addTimelineUnits(
                getItemStart(item),
                deltaUnits,
                document.timeline.granularity,
              ),
            ),
          ) - xForItemStart(item)
        : 0;
    return renderTimelineItem({
      item,
      x: xForItemStart(item) + deltaX,
      y: activeDrag.mode === "lane" ? yForPreviewItem(item) : yForItem(item),
      pointerEvents: "none",
      keySuffix: "-preview",
    });
  }

  return (
    <div className="timelineShell" ref={shellRef}>
      <svg
        ref={svgRef}
        data-timeline-svg="true"
        style={{ backgroundColor: theme.timelineBackground }}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="タイムライン"
        onPointerDown={() => {
          if (pendingMove) {
            setPendingMove(null);
            return;
          }
          dispatch({ type: "selectItem", itemId: null });
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <rect width={width} height={height} fill={theme.timelineBackground} />
        <TimelineTicks
          scale={document.view.scale}
          rangeStart={range.start}
          rangeEnd={range.end}
          xForDate={xForDate}
          plotWidth={plotWidth}
          height={height}
          theme={theme}
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
                fill={theme.laneBackground}
              />
              <line x1={0} x2={width} y1={y} y2={y} stroke={theme.laneBorder} />
              <text
                x={20}
                y={y + 42}
                className="laneLabel"
                fill={theme.laneLabel}
              >
                {lane.name}
              </text>
            </g>
          );
        })}
        <defs>
          <clipPath id="timeline-plot-clip">
            <rect
              x={laneHeaderWidth}
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
            <path d="M 0 0 L 8 3 L 0 6 z" fill={theme.dependencyLine} />
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
            <path d="M 0 0 L 8 3 L 0 6 z" fill={theme.uiSelectionStroke} />
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
                  stroke={
                    isSelected ? theme.uiSelectionStroke : theme.dependencyLine
                  }
                  opacity={isSelected ? 1 : 0.55}
                  strokeWidth={isSelected ? 3 : 2}
                  className="dependencyLine"
                  data-selected-dependency={isSelected ? "true" : undefined}
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
          {visibleItems.map((item) =>
            renderTimelineItem({
              item,
              x: xForItemStart(item),
              y: yForItem(item),
              opacity:
                drag?.itemId === item.id || pendingMove?.itemId === item.id
                  ? 0.28
                  : 1,
            }),
          )}
          {renderDragPreview()}
        </g>
      </svg>
      {pendingMove && (
        <PropagationPrompt
          descendantCount={pendingMove.descendantCount}
          onPropagate={() => {
            dispatch({
              type: "moveItem",
              itemId: pendingMove.itemId,
              deltaUnits: pendingMove.deltaUnits,
              propagate: true,
            });
            setPendingMove(null);
          }}
          onKeepLocal={() => {
            dispatch({
              type: "moveItem",
              itemId: pendingMove.itemId,
              deltaUnits: pendingMove.deltaUnits,
              propagate: false,
            });
            setPendingMove(null);
          }}
          onCancel={() => setPendingMove(null)}
        />
      )}
    </div>
  );

  function snappedDragDeltaUnits(item: TimelineItem, rawDeltaSeconds: number) {
    if (rawDeltaSeconds === 0) {
      return 0;
    }
    const start = getItemStart(item);
    const movedStart = new Date(
      parseDateTime(start).getTime() + rawDeltaSeconds * 1000,
    );
    const snappedStart = snapDateTimeToScale(
      `${format(movedStart, "yyyy-MM-dd'T'HH:mm:ss")}`,
      document.timeline.granularity,
    );
    return timelineUnitsBetween(
      start,
      snappedStart,
      document.timeline.granularity,
    );
  }
}

function createTickDebugInfo(
  scale: TimelineScale,
  rangeStart: Date,
  rangeEnd: Date,
  xForDate: (date: Date) => number,
  plotWidth: number,
) {
  const yearTickInterval =
    scale === "year"
      ? createYearTickInterval(rangeStart, rangeEnd, plotWidth)
      : 1;
  const tickInterval = createTickInterval(
    scale,
    rangeStart,
    rangeEnd,
    xForDate,
  );
  const labelInterval = createLabelInterval(scale, rangeStart, xForDate);
  const ticks = createTicks(
    scale,
    rangeStart,
    rangeEnd,
    yearTickInterval,
    tickInterval,
  );
  const boundaryTicks = createBoundaryTicks(
    scale,
    rangeStart,
    rangeEnd,
    yearTickInterval,
  );

  return {
    tickInterval:
      scale === "year"
        ? `${yearTickInterval}年`
        : `${tickInterval}${tickUnit(scale)}`,
    labelInterval:
      scale === "year"
        ? `${yearTickInterval}年`
        : `${labelInterval}${tickUnit(scale)}`,
    tickCount: ticks.length,
    boundaryTickCount: boundaryTicks.length,
  };
}

function tickUnit(scale: TimelineScale) {
  if (scale === "hour") {
    return "時間";
  }
  if (scale === "day") {
    return "日";
  }
  return "か月";
}

function formatRange(range: TimelineDateRange) {
  return `${format(range.start, "MM-dd HH:mm")} → ${format(range.end, "MM-dd HH:mm")}`;
}

function describeItem(item: TimelineItem) {
  const timing =
    item.type === "duration" ? `${item.start} → ${item.end}` : item.at;
  return `${item.id} / ${item.type} / ${item.laneId} / ${timing}`;
}

function describeItemLayout(
  item: TimelineItem,
  xForStart: (item: TimelineItem) => number,
  xForEnd: (item: TimelineItem) => number,
  yForItem: (item: TimelineItem) => number,
) {
  const width =
    item.type === "duration"
      ? Math.max(16, xForEnd(item) - xForStart(item))
      : 24;
  return `x ${Math.round(xForStart(item))}, y ${Math.round(yForItem(item))}, ${Math.round(width)} × ${itemHeight}`;
}

function countDescendants(
  itemId: string,
  dependencies: { fromId: string; toId: string }[],
) {
  const outgoing = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const next = outgoing.get(dependency.fromId) ?? [];
    next.push(dependency.toId);
    outgoing.set(dependency.fromId, next);
  }

  const descendants = new Set<string>();
  const queue = [itemId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    for (const next of outgoing.get(current) ?? []) {
      if (!descendants.has(next)) {
        descendants.add(next);
        queue.push(next);
      }
    }
  }
  return descendants.size;
}

function resolveDragState(drag: DragState): DragState & { mode: DragMode } {
  const deltaX = Math.abs(drag.currentClientX - drag.startClientX);
  const deltaY = Math.abs(drag.currentClientY - drag.startClientY);
  let mode = drag.mode ?? "time";

  if (deltaX > deltaY * dragModeRatio) {
    mode = "time";
  } else if (deltaY > deltaX * dragModeRatio) {
    mode = "lane";
  }

  return { ...drag, mode };
}

function TimelineTicks({
  scale,
  rangeStart,
  rangeEnd,
  xForDate,
  plotWidth,
  height,
  theme,
}: {
  scale: TimelineScale;
  rangeStart: Date;
  rangeEnd: Date;
  xForDate: (date: Date) => number;
  plotWidth: number;
  height: number;
  theme: TimelineTheme;
}) {
  const yearTickInterval =
    scale === "year"
      ? createYearTickInterval(rangeStart, rangeEnd, plotWidth)
      : 1;
  const tickInterval = createTickInterval(
    scale,
    rangeStart,
    rangeEnd,
    xForDate,
  );
  const labelInterval = createLabelInterval(scale, rangeStart, xForDate);
  const ticks = createTicks(
    scale,
    rangeStart,
    rangeEnd,
    yearTickInterval,
    tickInterval,
  );
  const boundaryTicks = createBoundaryTicks(
    scale,
    rangeStart,
    rangeEnd,
    yearTickInterval,
  );
  const boundaryTimes = new Set(boundaryTicks.map((tick) => tick.getTime()));
  return (
    <g>
      <rect
        x={laneHeaderWidth}
        y={0}
        width={plotWidth}
        height={headerHeight}
        fill={theme.headerBackground}
      />
      <line
        x1={laneHeaderWidth}
        x2={laneHeaderWidth}
        y1={0}
        y2={height}
        stroke={theme.laneBorder}
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
              stroke={theme.laneBorder}
              strokeWidth={isBoundary ? 1.5 : 1}
            />
            {shouldShowTickLabel(scale, tick, labelInterval, isBoundary) && (
              <text
                x={x + 6}
                y={34}
                className="tickLabel"
                fill={theme.tickLabel}
              >
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
              stroke={theme.tickLabel}
              strokeWidth={2}
            />
            <text
              x={x + 6}
              y={18}
              className="boundaryTickLabel"
              fill={theme.boundaryTickLabel}
            >
              {formatBoundaryTick(scale, tick)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function createTicks(
  scale: TimelineScale,
  start: Date,
  end: Date,
  yearTickInterval = 1,
  tickInterval = 1,
) {
  const ticks: Date[] = [];
  let current =
    scale === "year"
      ? startOfYearInterval(start, yearTickInterval)
      : startOfScale(scale, start, tickInterval);

  while (current <= end && ticks.length < maxRenderedTicks) {
    ticks.push(current);
    if (scale === "year") {
      current = addYears(current, yearTickInterval);
    } else if (scale === "month") {
      current = addMonths(current, tickInterval);
    } else if (scale === "day") {
      current = addDays(current, tickInterval);
    } else {
      current = addHours(current, tickInterval);
    }
  }

  return ticks;
}

function startOfScale(scale: TimelineScale, date: Date, interval = 1) {
  if (scale === "year") {
    return startOfYear(date);
  }
  if (scale === "month") {
    return startOfMonth(date);
  }
  if (scale === "day") {
    return addDays(startOfDay(date), -((date.getDate() - 1) % interval));
  }
  return addHours(startOfHour(date), -(date.getHours() % interval));
}

function filterItemsByRange(
  items: TimelineItem[],
  range: TimelineDateRange,
  granularity: TimelineScale,
): TimelineItem[] {
  return items.filter((item) => itemOverlapsRange(item, range, granularity));
}

function itemOverlapsRange(
  item: TimelineItem,
  range: TimelineDateRange,
  granularity: TimelineScale,
) {
  const start = parseDateTime(getItemStart(item)).getTime();
  const end = parseDateTime(getItemExclusiveEnd(item, granularity)).getTime();
  const rangeStart = range.start.getTime();
  const rangeEnd = range.end.getTime();

  if (item.type === "instant") {
    return start >= rangeStart && start <= rangeEnd;
  }

  return start <= rangeEnd && end >= rangeStart;
}

function createBoundaryTicks(
  scale: TimelineScale,
  start: Date,
  end: Date,
  yearTickInterval = 1,
) {
  if (scale === "year") {
    const boundaryInterval = createYearBoundaryInterval(yearTickInterval);
    if (!boundaryInterval) {
      return [];
    }

    const ticks: Date[] = [];
    let current = startOfYearInterval(start, boundaryInterval);
    while (current <= end && ticks.length < maxRenderedTicks) {
      if (current >= start) {
        ticks.push(current);
      }
      current = addYears(current, boundaryInterval);
    }
    return ticks;
  }

  if (scale !== "hour" && scale !== "day") {
    return [];
  }

  const ticks: Date[] = [];
  let current = scale === "hour" ? startOfDay(start) : startOfMonth(start);
  const addNext = scale === "hour" ? addDays : addMonths;

  while (current <= end && ticks.length < maxRenderedTicks) {
    if (current >= start) {
      ticks.push(current);
    }
    current = addNext(current, 1);
  }

  return ticks;
}

function createTickInterval(
  scale: TimelineScale,
  start: Date,
  end: Date,
  xForDate: (date: Date) => number,
) {
  if (scale === "year") {
    return 1;
  }

  const minTickSpacing = scale === "hour" ? 14 : 64;
  const current = startOfScale(scale, start);
  const next =
    scale === "month"
      ? addMonths(current, 1)
      : scale === "day"
        ? addDays(current, 1)
        : addHours(current, 1);
  const tickSpacing = Math.abs(xForDate(next) - xForDate(current));
  if (tickSpacing <= 0) {
    return 1;
  }

  if (scale === "hour") {
    const visibleHours = Math.max(
      1,
      (end.getTime() - current.getTime()) / 3_600_000,
    );
    return nearestInterval(
      Math.max(
        Math.ceil(minTickSpacing / tickSpacing),
        Math.ceil(visibleHours / maxRenderedTicks),
      ),
      [1, 3, 6, 12, 24, 48, 72, 168, 336, 720],
    );
  }
  if (scale === "day") {
    return nearestInterval(
      Math.ceil(minTickSpacing / tickSpacing),
      [1, 2, 7, 14, 28, 56],
    );
  }
  return 1;
}

function createLabelInterval(
  scale: TimelineScale,
  start: Date,
  xForDate: (date: Date) => number,
) {
  if (scale === "year" || scale === "month") {
    return 1;
  }

  const current = startOfScale(scale, start);
  const next = scale === "day" ? addDays(current, 1) : addHours(current, 1);
  const tickSpacing = Math.abs(xForDate(next) - xForDate(current));
  if (tickSpacing <= 0) {
    return 1;
  }

  if (scale === "hour") {
    return nearestInterval(
      Math.ceil(56 / tickSpacing),
      [1, 3, 6, 12, 24, 48, 72, 168, 336, 720],
    );
  }

  return nearestInterval(Math.ceil(64 / tickSpacing), [1, 2, 7, 14, 28, 56]);
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
  if (scale === "hour") {
    return tick.getHours() % labelInterval === 0;
  }
  if (scale === "day") {
    return (tick.getDate() - 1) % labelInterval === 0;
  }
  return true;
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
    return formatYearLabel(date);
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
  if (scale === "year") {
    return formatYearLabel(date);
  }
  if (scale === "hour") {
    return format(date, "MM-dd");
  }
  if (scale === "day") {
    return format(date, "yyyy-MM");
  }
  return formatTick(scale, date);
}

function createYearTickInterval(start: Date, end: Date, plotWidth: number) {
  const minTickSpacing = 48;
  const yearSpan = Math.max(1, end.getFullYear() - start.getFullYear() + 1);
  const minInterval = Math.ceil((yearSpan * minTickSpacing) / plotWidth);
  return nearestInterval(minInterval, [1, 5, 10, 25, 50, 100, 250, 500, 1000]);
}

function createYearBoundaryInterval(yearTickInterval: number) {
  const boundaryInterval = nearestInterval(
    yearTickInterval * 10,
    [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  );
  return boundaryInterval > yearTickInterval ? boundaryInterval : null;
}

function startOfYearInterval(date: Date, interval: number) {
  const year = date.getFullYear();
  const alignedYear = Math.ceil(year / interval) * interval;
  const aligned = new Date(date);
  aligned.setFullYear(alignedYear, 0, 1);
  aligned.setHours(0, 0, 0, 0);
  return aligned;
}

function formatYearLabel(date: Date) {
  const year = date.getFullYear();
  return String(year);
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
