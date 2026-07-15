import { describe, expect, it } from "vitest";

import { sampleTimeline } from "../data/sampleTimeline";
import { type TimelineState, timelineReducer } from "../state/timelineReducer";
import { fromDateTimeLocalMinute, toDateTimeLocalMinute } from "./datetime";
import { filterItemsByTags } from "./filtering";
import { parseTimelineDocument } from "./schema";
import type { TimelineDocument } from "./types";

function stateFor(document: TimelineDocument = sampleTimeline): TimelineState {
  return {
    document,
    selectedItemId: document.items[0]?.id ?? null,
    importIssues: [],
    dirty: false,
  };
}

describe("timeline schema", () => {
  it("accepts the sample document", () => {
    const result = parseTimelineDocument(sampleTimeline);
    expect(result.ok).toBe(true);
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

describe("dependency behavior", () => {
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
