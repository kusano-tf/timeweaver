import { describe, expect, it } from "vitest";

import { sampleTimeline } from "../data/sampleTimeline";
import { type TimelineState, timelineReducer } from "../state/timelineReducer";
import { fromDateTimeLocalMinute, toDateTimeLocalMinute } from "./datetime";
import { filterItemsByTags } from "./filtering";
import { parseTimelineDocument } from "./schema";
import {
  createTimelineRange,
  panTimelineRange,
  resolveVisibleRange,
  zoomTimelineRange,
} from "./timelineRange";
import type { TimelineDocument } from "./types";

function stateFor(document: TimelineDocument = sampleTimeline): TimelineState {
  return {
    document,
    selectedItemId: document.items[0]?.id ?? null,
    selectedDependencyId: null,
    importIssues: [],
    dirty: false,
  };
}

describe("timeline schema", () => {
  it("accepts the sample document", () => {
    const result = parseTimelineDocument(sampleTimeline);
    expect(result.ok).toBe(true);
  });

  it("defaults missing visibleRange to all items", () => {
    const document = structuredClone(sampleTimeline) as {
      view: Partial<TimelineDocument["view"]>;
    };
    delete document.view.visibleRange;

    const result = parseTimelineDocument(document);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.view.visibleRange).toBeNull();
    }
  });

  it("rejects visibleRange whose end is not after start", () => {
    const document = structuredClone(sampleTimeline);
    document.view.visibleRange = {
      start: "2026-07-14T00:00:00",
      end: "2026-07-14T00:00:00",
    };

    const result = parseTimelineDocument(document);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((issue) => issue.path.includes("visibleRange.end")),
      ).toBe(true);
    }
  });

  it("rejects invalid datetime values", () => {
    const document = structuredClone(sampleTimeline);
    const item = document.items[0];
    if (item?.type !== "duration") {
      throw new Error("Expected duration item");
    }
    item.start = "2026-07-13";

    const result = parseTimelineDocument(document);
    expect(result.ok).toBe(false);
  });

  it("rejects duration items whose end is not after start", () => {
    const document = structuredClone(sampleTimeline);
    const item = document.items[0];
    if (item?.type !== "duration") {
      throw new Error("Expected duration item");
    }
    item.end = item.start;

    const result = parseTimelineDocument(document);
    expect(result.ok).toBe(false);
  });

  it("rejects missing item references", () => {
    const document = structuredClone(sampleTimeline);
    document.dependencies[0].fromId = "missing";

    const result = parseTimelineDocument(document);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.path.includes("fromId"))).toBe(
        true,
      );
    }
  });

  it("rejects dependency cycles", () => {
    const document = structuredClone(sampleTimeline);
    document.dependencies.push({
      id: "dep-release-design",
      fromId: "item-release",
      toId: "item-design",
      type: "finish-to-start",
      lagSeconds: 0,
    });

    const result = parseTimelineDocument(document);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((issue) => issue.message.includes("循環")),
      ).toBe(true);
    }
  });
});

describe("datetime input formatting", () => {
  it("converts timeline datetimes to datetime-local minute values", () => {
    expect(toDateTimeLocalMinute("2026-07-13T09:30:45")).toBe(
      "2026-07-13T09:30",
    );
  });

  it("converts datetime-local minute values back to timeline datetimes", () => {
    expect(fromDateTimeLocalMinute("2026-07-13T09:30")).toBe(
      "2026-07-13T09:30:00",
    );
  });

  it("rejects invalid datetime-local minute values", () => {
    expect(fromDateTimeLocalMinute("2026-02-30T09:30")).toBeNull();
    expect(fromDateTimeLocalMinute("")).toBeNull();
  });
});

describe("timeline range controls", () => {
  it("zooms around the center of the visible range", () => {
    const fullRange = createTimelineRange(sampleTimeline.items, "day");
    const range = resolveVisibleRange(null, fullRange);
    const visibleRange = zoomTimelineRange({
      range,
      fullRange,
      factor: 0.5,
    });

    expect(visibleRange).not.toBeNull();
    expect(visibleRange?.start).toBe("2026-07-15T06:00:00");
    expect(visibleRange?.end).toBe("2026-07-19T18:00:00");
  });

  it("pans the visible range without changing its duration", () => {
    const fullRange = createTimelineRange(sampleTimeline.items, "day");
    const range = resolveVisibleRange(
      {
        start: "2026-07-15T00:00:00",
        end: "2026-07-19T12:00:00",
      },
      fullRange,
    );
    const visibleRange = panTimelineRange({
      range,
      fullRange,
      deltaRatio: 0.1,
    });

    expect(visibleRange).not.toBeNull();
    expect(visibleRange?.start).toBe("2026-07-15T10:48:00");
    expect(visibleRange?.end).toBe("2026-07-19T22:48:00");
  });
});

describe("dependency behavior", () => {
  it("updates timeline metadata and keeps empty titles out", () => {
    const renamed = timelineReducer(stateFor(), {
      type: "updateTimelineMeta",
      title: "  新しいタイムライン  ",
      description: "",
    });

    expect(renamed.dirty).toBe(true);
    expect(renamed.document.timeline.title).toBe("新しいタイムライン");
    expect(renamed.document.timeline.description).toBe("");

    const unchanged = timelineReducer(renamed, {
      type: "updateTimelineMeta",
      title: "   ",
    });

    expect(unchanged).toBe(renamed);
  });

  it("updates the visible timeline range", () => {
    const visibleRange = {
      start: "2026-07-13T00:00:00",
      end: "2026-07-14T00:00:00",
    };
    const state = timelineReducer(stateFor(), {
      type: "setVisibleRange",
      visibleRange,
    });

    expect(state.dirty).toBe(true);
    expect(state.document.view.visibleRange).toEqual(visibleRange);
  });

  it("selects a dependency and its dependent item", () => {
    const state = timelineReducer(stateFor(), {
      type: "selectDependency",
      dependencyId: "dep-build-release",
    });

    expect(state.selectedDependencyId).toBe("dep-build-release");
    expect(state.selectedItemId).toBe("item-release");
  });

  it("clears dependency selection when selecting an item", () => {
    const selected = timelineReducer(stateFor(), {
      type: "selectDependency",
      dependencyId: "dep-build-release",
    });

    const state = timelineReducer(selected, {
      type: "selectItem",
      itemId: "item-design",
    });

    expect(state.selectedDependencyId).toBeNull();
    expect(state.selectedItemId).toBe("item-design");
  });

  it("moves downstream items by the same delta", () => {
    const state = timelineReducer(stateFor(), {
      type: "moveItem",
      itemId: "item-design",
      deltaSeconds: 86_400,
    });

    const build = state.document.items.find((item) => item.id === "item-build");
    const release = state.document.items.find(
      (item) => item.id === "item-release",
    );

    expect(build?.type).toBe("duration");
    if (build?.type === "duration") {
      expect(build.start).toBe("2026-07-17T09:00:00");
      expect(build.end).toBe("2026-07-21T18:00:00");
    }

    expect(release?.type).toBe("instant");
    if (release?.type === "instant") {
      expect(release.at).toBe("2026-07-22T10:00:00");
    }
  });

  it("recalculates incoming lag when a downstream item is manually moved", () => {
    const state = timelineReducer(stateFor(), {
      type: "moveItem",
      itemId: "item-build",
      deltaSeconds: 86_400,
    });

    const dependency = state.document.dependencies.find(
      (candidate) => candidate.id === "dep-design-build",
    );

    expect(dependency?.lagSeconds).toBe(140_400);
  });

  it("moves the dependent item to match an edited dependency lag", () => {
    const state = timelineReducer(stateFor(), {
      type: "updateDependencyLag",
      dependencyId: "dep-design-build",
      lagSeconds: 172_800,
    });

    const build = state.document.items.find((item) => item.id === "item-build");
    const release = state.document.items.find(
      (item) => item.id === "item-release",
    );

    expect(build?.type).toBe("duration");
    if (build?.type === "duration") {
      expect(build.start).toBe("2026-07-17T18:00:00");
      expect(build.end).toBe("2026-07-22T03:00:00");
    }

    expect(release?.type).toBe("instant");
    if (release?.type === "instant") {
      expect(release.at).toBe("2026-07-22T19:00:00");
    }
    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-design-build",
      )?.lagSeconds,
    ).toBe(172_800);
    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-build-release",
      )?.lagSeconds,
    ).toBe(57_600);
  });

  it("allows edited dependency lag to move the dependent item backward", () => {
    const state = timelineReducer(stateFor(), {
      type: "updateDependencyLag",
      dependencyId: "dep-design-build",
      lagSeconds: 0,
    });

    const build = state.document.items.find((item) => item.id === "item-build");
    const release = state.document.items.find(
      (item) => item.id === "item-release",
    );

    expect(build?.type).toBe("duration");
    if (build?.type === "duration") {
      expect(build.start).toBe("2026-07-15T18:00:00");
      expect(build.end).toBe("2026-07-20T03:00:00");
    }

    expect(release?.type).toBe("instant");
    if (release?.type === "instant") {
      expect(release.at).toBe("2026-07-21T10:00:00");
    }
    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-design-build",
      )?.lagSeconds,
    ).toBe(0);
    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-build-release",
      )?.lagSeconds,
    ).toBe(111_600);
  });

  it("prioritizes the edited dependency lag over other incoming dependencies", () => {
    const document = structuredClone(sampleTimeline);
    document.items.push({
      id: "item-design-b",
      type: "duration",
      title: "設計B",
      description: "",
      laneId: "lane-planning",
      tagIds: ["planning"],
      colorTagId: null,
      color: null,
      start: "2026-07-13T09:00:00",
      end: "2026-07-16T09:00:00",
    });
    document.dependencies.push({
      id: "dep-design-b-build",
      fromId: "item-design-b",
      toId: "item-build",
      type: "finish-to-start",
      lagSeconds: 0,
    });

    const state = timelineReducer(stateFor(document), {
      type: "updateDependencyLag",
      dependencyId: "dep-design-build",
      lagSeconds: -86_400,
    });

    const build = state.document.items.find((item) => item.id === "item-build");

    expect(build?.type).toBe("duration");
    if (build?.type === "duration") {
      expect(build.start).toBe("2026-07-14T18:00:00");
      expect(build.end).toBe("2026-07-19T03:00:00");
    }
    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-design-build",
      )?.lagSeconds,
    ).toBe(-86_400);
    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-design-b-build",
      )?.lagSeconds,
    ).toBe(-140_400);
  });

  it("moves downstream items when a predecessor end changes", () => {
    const document = structuredClone(sampleTimeline);
    const design = document.items.find((item) => item.id === "item-design");
    if (design?.type !== "duration") {
      throw new Error("Expected duration item");
    }

    const state = timelineReducer(stateFor(document), {
      type: "updateItem",
      item: { ...design, end: "2026-07-16T18:00:00" },
    });

    const build = state.document.items.find((item) => item.id === "item-build");
    const release = state.document.items.find(
      (item) => item.id === "item-release",
    );

    expect(build?.type).toBe("duration");
    if (build?.type === "duration") {
      expect(build.start).toBe("2026-07-17T09:00:00");
      expect(build.end).toBe("2026-07-21T18:00:00");
    }

    expect(release?.type).toBe("instant");
    if (release?.type === "instant") {
      expect(release.at).toBe("2026-07-22T10:00:00");
    }

    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-design-build",
      )?.lagSeconds,
    ).toBe(54_000);
  });

  it("does not move downstream items when only a predecessor start changes", () => {
    const document = structuredClone(sampleTimeline);
    const design = document.items.find((item) => item.id === "item-design");
    if (design?.type !== "duration") {
      throw new Error("Expected duration item");
    }

    const state = timelineReducer(stateFor(document), {
      type: "updateItem",
      item: { ...design, start: "2026-07-12T09:00:00" },
    });

    const build = state.document.items.find((item) => item.id === "item-build");

    expect(build?.type).toBe("duration");
    if (build?.type === "duration") {
      expect(build.start).toBe("2026-07-16T09:00:00");
      expect(build.end).toBe("2026-07-20T18:00:00");
    }
  });

  it("moves downstream items when an instant predecessor changes", () => {
    const document = structuredClone(sampleTimeline);
    const release = document.items.find((item) => item.id === "item-release");
    if (release?.type !== "instant") {
      throw new Error("Expected instant item");
    }
    document.dependencies.push({
      id: "dep-release-followup",
      fromId: "item-release",
      toId: "item-followup",
      type: "finish-to-start",
      lagSeconds: 86_400,
    });
    document.items.push({
      id: "item-followup",
      type: "instant",
      title: "フォローアップ",
      description: "",
      laneId: "lane-release",
      tagIds: ["release"],
      colorTagId: null,
      color: null,
      at: "2026-07-22T10:00:00",
    });

    const state = timelineReducer(stateFor(document), {
      type: "updateItem",
      item: { ...release, at: "2026-07-22T10:00:00" },
    });

    const followup = state.document.items.find(
      (item) => item.id === "item-followup",
    );

    expect(followup?.type).toBe("instant");
    if (followup?.type === "instant") {
      expect(followup.at).toBe("2026-07-23T10:00:00");
    }
  });

  it("does not move downstream items backward when a predecessor end moves backward", () => {
    const document = structuredClone(sampleTimeline);
    const design = document.items.find((item) => item.id === "item-design");
    if (design?.type !== "duration") {
      throw new Error("Expected duration item");
    }

    const state = timelineReducer(stateFor(document), {
      type: "updateItem",
      item: { ...design, end: "2026-07-14T18:00:00" },
    });

    const build = state.document.items.find((item) => item.id === "item-build");

    expect(build?.type).toBe("duration");
    if (build?.type === "duration") {
      expect(build.start).toBe("2026-07-16T09:00:00");
      expect(build.end).toBe("2026-07-20T18:00:00");
    }
  });

  it("does not move downstream items when another predecessor still constrains them", () => {
    const document = structuredClone(sampleTimeline);
    const design = document.items.find((item) => item.id === "item-design");
    if (design?.type !== "duration") {
      throw new Error("Expected duration item");
    }
    document.items.push({
      id: "item-design-b",
      type: "duration",
      title: "設計B",
      description: "",
      laneId: "lane-planning",
      tagIds: ["planning"],
      colorTagId: null,
      color: null,
      start: "2026-07-13T09:00:00",
      end: "2026-07-16T09:00:00",
    });
    document.dependencies.push({
      id: "dep-design-b-build",
      fromId: "item-design-b",
      toId: "item-build",
      type: "finish-to-start",
      lagSeconds: 86_400,
    });

    const state = timelineReducer(stateFor(document), {
      type: "updateItem",
      item: { ...design, end: "2026-07-16T12:00:00" },
    });

    const build = state.document.items.find((item) => item.id === "item-build");

    expect(build?.type).toBe("duration");
    if (build?.type === "duration") {
      expect(build.start).toBe("2026-07-17T09:00:00");
      expect(build.end).toBe("2026-07-21T18:00:00");
    }
    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-design-build",
      )?.lagSeconds,
    ).toBe(75_600);
  });

  it("recalculates all incoming lag when a downstream item is pushed", () => {
    const document = structuredClone(sampleTimeline);
    const design = document.items.find((item) => item.id === "item-design");
    if (design?.type !== "duration") {
      throw new Error("Expected duration item");
    }
    document.items.push({
      id: "item-design-b",
      type: "duration",
      title: "設計B",
      description: "",
      laneId: "lane-planning",
      tagIds: ["planning"],
      colorTagId: null,
      color: null,
      start: "2026-07-13T09:00:00",
      end: "2026-07-16T09:00:00",
    });
    document.dependencies.push({
      id: "dep-design-b-build",
      fromId: "item-design-b",
      toId: "item-build",
      type: "finish-to-start",
      lagSeconds: 86_400,
    });

    const state = timelineReducer(stateFor(document), {
      type: "updateItem",
      item: { ...design, end: "2026-07-17T18:00:00" },
    });

    const build = state.document.items.find((item) => item.id === "item-build");

    expect(build?.type).toBe("duration");
    if (build?.type === "duration") {
      expect(build.start).toBe("2026-07-18T09:00:00");
      expect(build.end).toBe("2026-07-22T18:00:00");
    }
    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-design-build",
      )?.lagSeconds,
    ).toBe(54_000);
    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-design-b-build",
      )?.lagSeconds,
    ).toBe(172_800);
  });

  it("uses the latest incoming constraint through converging dependencies", () => {
    const document = structuredClone(sampleTimeline);
    const design = document.items.find((item) => item.id === "item-design");
    if (design?.type !== "duration") {
      throw new Error("Expected duration item");
    }
    document.items.push(
      {
        id: "item-review",
        type: "duration",
        title: "レビュー",
        description: "",
        laneId: "lane-build",
        tagIds: ["build"],
        colorTagId: null,
        color: null,
        start: "2026-07-16T09:00:00",
        end: "2026-07-17T09:00:00",
      },
      {
        id: "item-merge",
        type: "instant",
        title: "統合",
        description: "",
        laneId: "lane-release",
        tagIds: ["release"],
        colorTagId: null,
        color: null,
        at: "2026-07-21T10:00:00",
      },
    );
    document.dependencies.push(
      {
        id: "dep-design-review",
        fromId: "item-design",
        toId: "item-review",
        type: "finish-to-start",
        lagSeconds: 54_000,
      },
      {
        id: "dep-build-merge",
        fromId: "item-build",
        toId: "item-merge",
        type: "finish-to-start",
        lagSeconds: 57_600,
      },
      {
        id: "dep-review-merge",
        fromId: "item-review",
        toId: "item-merge",
        type: "finish-to-start",
        lagSeconds: 363_600,
      },
    );

    const state = timelineReducer(stateFor(document), {
      type: "updateItem",
      item: { ...design, end: "2026-07-16T18:00:00" },
    });

    const merge = state.document.items.find((item) => item.id === "item-merge");

    expect(merge?.type).toBe("instant");
    if (merge?.type === "instant") {
      expect(merge.at).toBe("2026-07-22T14:00:00");
    }
  });

  it("rejects dependency additions that would create a cycle", () => {
    const state = timelineReducer(stateFor(), {
      type: "addDependency",
      dependency: {
        id: "dep-release-design",
        fromId: "item-release",
        toId: "item-design",
        type: "finish-to-start",
        lagSeconds: 0,
      },
    });

    expect(state.document.dependencies).toHaveLength(2);
    expect(state.importIssues[0]?.message).toContain("循環");
  });
});

describe("tag filtering", () => {
  it("uses OR filtering for selected tags", () => {
    const filtered = filterItemsByTags(sampleTimeline.items, [
      "planning",
      "release",
    ]);
    expect(filtered.map((item) => item.id)).toEqual([
      "item-design",
      "item-release",
    ]);
  });

  it("hides untagged items while a tag filter is active", () => {
    const items = [
      ...sampleTimeline.items,
      {
        id: "item-untagged",
        type: "instant" as const,
        title: "未タグ",
        description: "",
        laneId: "lane-planning",
        tagIds: [],
        colorTagId: null,
        color: null,
        at: "2026-07-13T09:00:00",
      },
    ];

    const filtered = filterItemsByTags(items, ["planning"]);
    expect(filtered.map((item) => item.id)).toEqual(["item-design"]);
  });
});

describe("tag and lane management", () => {
  it("updates tag names and colors", () => {
    const state = timelineReducer(stateFor(), {
      type: "updateTag",
      tagId: "planning",
      name: "企画",
      color: "#16a34a",
    });

    const tag = state.document.tags.find(
      (candidate) => candidate.id === "planning",
    );

    expect(tag?.name).toBe("企画");
    expect(tag?.color).toBe("#16a34a");
    expect(state.dirty).toBe(true);
  });

  it("ignores empty tag and lane names", () => {
    const tagState = timelineReducer(stateFor(), {
      type: "updateTag",
      tagId: "planning",
      name: "   ",
    });
    const laneState = timelineReducer(stateFor(), {
      type: "updateLane",
      laneId: "lane-planning",
      name: "",
    });

    expect(
      tagState.document.tags.find((tag) => tag.id === "planning")?.name,
    ).toBe("Planning");
    expect(
      laneState.document.lanes.find((lane) => lane.id === "lane-planning")
        ?.name,
    ).toBe("計画");
  });

  it("updates lane names", () => {
    const state = timelineReducer(stateFor(), {
      type: "updateLane",
      laneId: "lane-planning",
      name: "構想",
    });

    expect(
      state.document.lanes.find((lane) => lane.id === "lane-planning")?.name,
    ).toBe("構想");
    expect(state.dirty).toBe(true);
  });

  it("removes deleted tags from items and the active filter", () => {
    const state = timelineReducer(
      {
        ...stateFor(),
        document: {
          ...sampleTimeline,
          view: {
            ...sampleTimeline.view,
            visibleTagIds: ["planning"],
          },
        },
      },
      { type: "deleteTag", tagId: "planning" },
    );

    expect(state.document.tags.some((tag) => tag.id === "planning")).toBe(
      false,
    );
    expect(state.document.view.visibleTagIds).toEqual([]);
    expect(
      state.document.items.some((item) => item.tagIds.includes("planning")),
    ).toBe(false);
  });

  it("clears colorTagId when its tag is deleted", () => {
    const document = structuredClone(sampleTimeline);
    document.items[0].colorTagId = "planning";

    const state = timelineReducer(stateFor(document), {
      type: "deleteTag",
      tagId: "planning",
    });

    expect(state.document.items[0].colorTagId).toBeNull();
  });

  it("normalizes tag order after reordering tags", () => {
    const state = timelineReducer(stateFor(), {
      type: "reorderTags",
      tagIds: ["release", "planning", "build"],
    });

    expect(state.document.tags.map((tag) => [tag.id, tag.order])).toEqual([
      ["release", 0],
      ["planning", 1],
      ["build", 2],
    ]);
  });

  it("normalizes lane order after reordering lanes", () => {
    const state = timelineReducer(stateFor(), {
      type: "reorderLanes",
      laneIds: ["lane-release", "lane-planning", "lane-build"],
    });

    expect(state.document.lanes.map((lane) => [lane.id, lane.order])).toEqual([
      ["lane-release", 0],
      ["lane-planning", 1],
      ["lane-build", 2],
    ]);
  });

  it("rejects deleting lanes that still contain items", () => {
    const state = timelineReducer(stateFor(), {
      type: "deleteLane",
      laneId: "lane-planning",
    });

    expect(
      state.document.lanes.some((lane) => lane.id === "lane-planning"),
    ).toBe(true);
    expect(state.importIssues[0]?.message).toContain("削除できません");
  });

  it("deletes empty lanes", () => {
    const state = timelineReducer(
      {
        ...stateFor(),
        document: {
          ...sampleTimeline,
          lanes: [
            ...sampleTimeline.lanes,
            { id: "lane-empty", name: "空レーン", order: 99 },
          ],
        },
      },
      { type: "deleteLane", laneId: "lane-empty" },
    );

    expect(state.document.lanes.some((lane) => lane.id === "lane-empty")).toBe(
      false,
    );
  });
});

describe("item copy", () => {
  it("copies the selected item with a new id and title", () => {
    const state = timelineReducer(stateFor(), {
      type: "copyItem",
      itemId: "item-design",
    });

    const copied = state.document.items.find(
      (item) => item.id === "item-design-copy",
    );

    expect(copied?.title).toBe("設計 のコピー");
    expect(copied?.type).toBe("duration");
    expect(state.selectedItemId).toBe("item-design-copy");
    expect(state.dirty).toBe(true);
  });

  it("does not copy dependencies with the item", () => {
    const state = timelineReducer(stateFor(), {
      type: "copyItem",
      itemId: "item-design",
    });

    expect(state.document.dependencies).toHaveLength(
      sampleTimeline.dependencies.length,
    );
  });
});
