import { describe, expect, it } from "vitest";

import { sampleTimeline } from "../data/sampleTimeline";
import {
  type TimelineAction,
  type TimelineState,
  timelineReducer,
} from "../state/timelineReducer";
import {
  addTimelineUnits,
  fromGranularityInput,
  isAlignedToGranularity,
  timelineUnitsBetween,
  toGranularityInput,
} from "./datetime";
import { filterItemsByTags, getItemColor } from "./filtering";
import { createMermaidGantt } from "./mermaid";
import { parseTimelineDocument } from "./schema";
import { getThemeTokens, timelineThemes } from "./theme";
import { parseTimelineThemeDocument, themeSchemaVersion } from "./themeSchema";
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

describe("時間粒度のスキーマ", () => {
  it("サンプルの粒度に揃った閉区間を受理する", () => {
    expect(parseTimelineDocument(sampleTimeline).ok).toBe(true);
  });

  it("粒度境界に揃っていない日時を拒否する", () => {
    const document = structuredClone(sampleTimeline);
    const item = document.items[0];
    if (item?.type === "duration") item.start = "2026-07-13T08:00:00";
    const result = parseTimelineDocument(document);
    expect(result.ok).toBe(false);
  });

  it("同じ開始・終了の期間を最小単位1つとして受理する", () => {
    const document = structuredClone(sampleTimeline);
    const item = document.items[0];
    if (item?.type === "duration") item.end = item.start;
    expect(parseTimelineDocument(document).ok).toBe(true);
  });

  it("改行を含むレーン名を受理する", () => {
    const document = structuredClone(sampleTimeline);
    document.lanes[0].name = "設計\nレビュー";

    expect(parseTimelineDocument(document).ok).toBe(true);
  });

  it("終了が開始より前の期間を拒否する", () => {
    const document = structuredClone(sampleTimeline);
    const item = document.items[0];
    if (item?.type === "duration") item.end = "2026-07-12T00:00:00";
    expect(parseTimelineDocument(document).ok).toBe(false);
  });
});

describe("粒度の日時計算", () => {
  it("月の加算は暦月を保つ", () => {
    expect(addTimelineUnits("2026-01-01T00:00:00", 1, "month")).toBe(
      "2026-02-01T00:00:00",
    );
    expect(
      timelineUnitsBetween(
        "2026-01-01T00:00:00",
        "2026-03-01T00:00:00",
        "month",
      ),
    ).toBe(2);
  });

  it("粒度別の入力値を完全な日時へ正規化する", () => {
    expect(toGranularityInput("2026-07-13T00:00:00", "day")).toBe("2026-07-13");
    expect(fromGranularityInput("2026-07", "month")).toBe(
      "2026-07-01T00:00:00",
    );
    expect(fromGranularityInput("2026", "year")).toBe("2026-01-01T00:00:00");
    expect(isAlignedToGranularity("2026-07-13T00:00:00", "day")).toBe(true);
  });
});

describe("粒度変更と依存", () => {
  it("依存がある場合は時間粒度の変更を拒否する", () => {
    const state = timelineReducer(stateFor(), {
      type: "setGranularity",
      granularity: "month",
    });
    expect(state.document.timeline.granularity).toBe("day");
    expect(state.importIssues[0]?.message).toContain("依存関係");
  });

  it("依存がなく全アイテムが整列していれば粒度を変更できる", () => {
    const document = structuredClone(sampleTimeline);
    document.dependencies = [];
    document.items = document.items.map((item) =>
      item.type === "duration"
        ? { ...item, start: "2026-01-01T00:00:00", end: "2026-01-01T00:00:00" }
        : { ...item, at: "2026-01-01T00:00:00" },
    );
    const state = timelineReducer(stateFor(document), {
      type: "setGranularity",
      granularity: "year",
    });
    expect(state.document.timeline.granularity).toBe("year");
  });

  it("閉区間のゼロ遅延は次の最小単位へ後続を配置する", () => {
    const document = structuredClone(sampleTimeline);
    const state = timelineReducer(stateFor(document), {
      type: "updateDependencyLag",
      dependencyId: "dep-design-build",
      lag: 0,
    });
    const build = state.document.items.find((item) => item.id === "item-build");
    expect(build?.type === "duration" && build.start).toBe(
      "2026-07-16T00:00:00",
    );
  });

  it("ドラッグは粒度単位で期間全体を移動する", () => {
    const state = timelineReducer(stateFor(), {
      type: "moveItem",
      itemId: "item-design",
      deltaUnits: 1,
      propagate: false,
    });
    const design = state.document.items.find(
      (item) => item.id === "item-design",
    );
    expect(design?.type === "duration" && [design.start, design.end]).toEqual([
      "2026-07-14T00:00:00",
      "2026-07-16T00:00:00",
    ]);
  });
});

describe("Mermaid", () => {
  it("閉区間の終了を次の粒度境界へ変換する", () => {
    const mermaid = createMermaidGantt(sampleTimeline);
    expect(mermaid).toContain(
      "設計 : task_1, 2026-07-13 00:00:00, 2026-07-16 00:00:00",
    );
  });

  it("レーン名の改行を空白へ正規化する", () => {
    const document = structuredClone(sampleTimeline);
    document.lanes[0].name = "設計\nレビュー";

    expect(createMermaidGantt(document)).toContain("section 設計 レビュー");
  });
});

describe("スキーマの整合性", () => {
  it.each([
    [
      "存在しないレーン",
      (document: TimelineDocument) => {
        document.items[0].laneId = "missing";
      },
    ],
    [
      "存在しないタグ",
      (document: TimelineDocument) => {
        document.items[0].tagIds = ["missing"];
      },
    ],
    [
      "存在しない依存先",
      (document: TimelineDocument) => {
        document.dependencies[0].toId = "missing";
      },
    ],
    [
      "重複アイテムID",
      (document: TimelineDocument) => {
        document.items[1].id = document.items[0].id;
      },
    ],
  ])("%sを拒否する", (_label, mutate) => {
    const document = structuredClone(sampleTimeline);
    mutate(document);
    expect(parseTimelineDocument(document).ok).toBe(false);
  });

  it("循環依存を拒否する", () => {
    const document = structuredClone(sampleTimeline);
    document.dependencies.push({
      id: "cycle",
      fromId: "item-release",
      toId: "item-design",
      type: "finish-to-start",
      lag: 0,
    });
    expect(parseTimelineDocument(document).ok).toBe(false);
  });

  it("表示範囲の不正な終端を拒否する", () => {
    const document = structuredClone(sampleTimeline);
    document.view.visibleRange = {
      start: "2026-07-14T00:00:00",
      end: "2026-07-14T00:00:00",
    };
    expect(parseTimelineDocument(document).ok).toBe(false);
  });
});

describe("粒度別の入力・境界", () => {
  it.each([
    ["year", "2026", "2026-01-01T00:00:00"],
    ["month", "2026-07", "2026-07-01T00:00:00"],
    ["day", "2026-07-13", "2026-07-13T00:00:00"],
    ["hour", "2026-07-13T09:00", "2026-07-13T09:00:00"],
  ] as const)("%s入力を正規化する", (granularity, input, expected) => {
    expect(fromGranularityInput(input, granularity)).toBe(expected);
    expect(isAlignedToGranularity(expected, granularity)).toBe(true);
  });

  it.each([
    ["year", "2026-01-01T00:00:00", "2027-01-01T00:00:00"],
    ["month", "2026-01-01T00:00:00", "2026-02-01T00:00:00"],
    ["day", "2026-01-01T00:00:00", "2026-01-02T00:00:00"],
    ["hour", "2026-01-01T00:00:00", "2026-01-01T01:00:00"],
  ] as const)("%sの1単位を加算する", (granularity, start, end) => {
    expect(addTimelineUnits(start, 1, granularity)).toBe(end);
    expect(timelineUnitsBetween(start, end, granularity)).toBe(1);
  });

  it.each([
    ["year", "2026-02-01T00:00:00"],
    ["month", "2026-07-02T00:00:00"],
    ["day", "2026-07-13T01:00:00"],
    ["hour", "2026-07-13T09:01:00"],
  ] as const)("%s粒度で未整列日時を拒否する", (granularity, value) => {
    const document = structuredClone(sampleTimeline);
    document.timeline.granularity = granularity;
    const item = document.items[0];
    if (item?.type === "duration") item.start = value;
    expect(parseTimelineDocument(document).ok).toBe(false);
  });
});

describe("依存伝播", () => {
  it("終了変更を後続へ同じ日数で伝播する", () => {
    const document = structuredClone(sampleTimeline);
    const design = document.items.find((item) => item.id === "item-design");
    if (design?.type !== "duration") throw new Error("設計がありません。");
    const state = timelineReducer(stateFor(document), {
      type: "updateItem",
      item: { ...design, end: "2026-07-16T00:00:00" },
      propagate: true,
    });
    const build = state.document.items.find((item) => item.id === "item-build");
    expect(build?.type === "duration" && build.start).toBe(
      "2026-07-17T00:00:00",
    );
  });

  it("非伝播の終了変更はlagを再計算する", () => {
    const document = structuredClone(sampleTimeline);
    const design = document.items.find((item) => item.id === "item-design");
    if (design?.type !== "duration") throw new Error("設計がありません。");
    const state = timelineReducer(stateFor(document), {
      type: "updateItem",
      item: { ...design, end: "2026-07-16T00:00:00" },
      propagate: false,
    });
    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-design-build",
      )?.lag,
    ).toBe(-1);
  });

  it.each([-2, -1, 0, 1, 3])("lag %i に依存先を配置する", (lag) => {
    const state = timelineReducer(stateFor(), {
      type: "updateDependencyLag",
      dependencyId: "dep-design-build",
      lag,
    });
    const build = state.document.items.find((item) => item.id === "item-build");
    expect(build?.type === "duration" && build.start).toBe(
      addTimelineUnits("2026-07-15T00:00:00", lag + 1, "day"),
    );
  });

  it("時点アイテムを先行としても次の単位から開始する", () => {
    const document = structuredClone(sampleTimeline);
    document.dependencies = [
      {
        id: "instant",
        fromId: "item-release",
        toId: "item-design",
        type: "finish-to-start",
        lag: 0,
      },
    ];
    const state = timelineReducer(stateFor(document), {
      type: "updateDependencyLag",
      dependencyId: "instant",
      lag: 0,
    });
    const design = state.document.items.find(
      (item) => item.id === "item-design",
    );
    expect(design?.type === "duration" && design.start).toBe(
      "2026-07-23T00:00:00",
    );
  });
});

describe("表示範囲・派生出力", () => {
  it("ズームとパンで有効な表示範囲を返す", () => {
    const fullRange = createTimelineRange(sampleTimeline.items, "day", "day");
    const range = resolveVisibleRange(null, fullRange);
    const zoomed = zoomTimelineRange({ range, fullRange, factor: 0.5 });
    expect(zoomed).not.toBeNull();
    const panned = panTimelineRange({
      range: resolveVisibleRange(zoomed, fullRange),
      fullRange,
      deltaRatio: 0.2,
    });
    expect(panned).not.toBeNull();
  });

  it("タグORフィルタと色の優先順位を守る", () => {
    expect(filterItemsByTags(sampleTimeline.items, ["build"])).toHaveLength(2);
    const item = { ...sampleTimeline.items[0], color: "#123456" };
    expect(
      getItemColor(
        item,
        new Map(sampleTimeline.tags.map((tag) => [tag.id, tag])),
      ),
    ).toBe("#123456");
  });

  it.each([
    ["タグ色", { color: null, colorTagId: null }, "#4f46e5"],
    ["色タグ", { color: null, colorTagId: "planning" }, "#4f46e5"],
  ] as const)("%sを色に使う", (_label, override, expected) => {
    const item = { ...sampleTimeline.items[0], ...override };
    expect(
      getItemColor(
        item,
        new Map(sampleTimeline.tags.map((tag) => [tag.id, tag])),
      ),
    ).toBe(expected);
  });

  it("テーマ形式を検証する", () => {
    expect(
      parseTimelineThemeDocument({
        schemaVersion: themeSchemaVersion,
        tokens: getThemeTokens(timelineThemes.light),
      }).ok,
    ).toBe(true);
    expect(
      parseTimelineThemeDocument({
        schemaVersion: themeSchemaVersion,
        tokens: {},
      }).ok,
    ).toBe(false);
    expect(
      parseTimelineThemeDocument({
        schemaVersion: themeSchemaVersion,
        tokens: {
          ...getThemeTokens(timelineThemes.light),
          itemStrokeWidth: 1.2,
        },
      }).ok,
    ).toBe(false);
  });
});

describe("管理操作", () => {
  it("タイトル、タグ、レーンを更新できる", () => {
    let state = timelineReducer(stateFor(), {
      type: "updateTimelineMeta",
      title: "  新しい予定  ",
    });
    state = timelineReducer(state, {
      type: "updateTag",
      tagId: "planning",
      name: "計画",
    });
    state = timelineReducer(state, {
      type: "updateLane",
      laneId: "lane-planning",
      name: "準備\nレビュー",
    });
    expect(state.document.timeline.title).toBe("新しい予定");
    expect(state.document.tags[0].name).toBe("計画");
    expect(state.document.lanes[0].name).toBe("準備\nレビュー");
  });

  it("アイテムを含むレーンの削除を拒否する", () => {
    const state = timelineReducer(stateFor(), {
      type: "deleteLane",
      laneId: "lane-planning",
    });
    expect(state.importIssues[0]?.message).toContain("削除できません");
  });

  it("タグ削除時にアイテム参照とフィルタを掃除する", () => {
    const state = timelineReducer(stateFor(), {
      type: "deleteTag",
      tagId: "planning",
    });
    expect(state.document.items[0].tagIds).not.toContain("planning");
  });

  it("コピーは依存を増やさない", () => {
    const state = timelineReducer(stateFor(), {
      type: "copyItem",
      itemId: "item-design",
    });
    expect(state.document.items).toHaveLength(sampleTimeline.items.length + 1);
    expect(state.document.dependencies).toHaveLength(
      sampleTimeline.dependencies.length,
    );
  });

  it("選択中の依存を削除すると選択を解除する", () => {
    const selected = timelineReducer(stateFor(), {
      type: "selectDependency",
      dependencyId: "dep-design-build",
    });
    const state = timelineReducer(selected, {
      type: "deleteDependency",
      dependencyId: "dep-design-build",
    });
    expect(state.selectedDependencyId).toBeNull();
  });

  it.each([
    ["selectItem", { type: "selectItem", itemId: "item-build" }],
    [
      "selectDependency",
      { type: "selectDependency", dependencyId: "dep-design-build" },
    ],
    [
      "deleteDependency",
      { type: "deleteDependency", dependencyId: "dep-design-build" },
    ],
    [
      "reorderTags",
      { type: "reorderTags", tagIds: ["release", "build", "planning"] },
    ],
    [
      "reorderLanes",
      {
        type: "reorderLanes",
        laneIds: ["lane-release", "lane-build", "lane-planning"],
      },
    ],
  ] as const)("%s 操作を安全に処理する", (_label, action) => {
    expect(() =>
      timelineReducer(stateFor(), action as TimelineAction),
    ).not.toThrow();
  });

  it.each([
    "year",
    "month",
    "day",
    "hour",
  ] as const)("%s粒度で整列済みの新規期間を受理する", (granularity) => {
    const document = structuredClone(sampleTimeline);
    document.timeline.granularity = granularity;
    const value = addTimelineUnits("2026-01-01T00:00:00", 0, granularity);
    document.items = document.items.map((item) =>
      item.type === "duration"
        ? { ...item, start: value, end: value }
        : { ...item, at: value },
    );
    expect(parseTimelineDocument(document).ok).toBe(true);
  });
});
