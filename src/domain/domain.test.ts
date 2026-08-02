import { describe, expect, it } from "vitest";

import { sampleTimeline } from "../data/sampleTimeline";
import { type TimelineState, timelineReducer } from "../state/timelineReducer";
import {
  fromDateTimeLocalMinute,
  snapDateTimeToScale,
  toDateTimeLocalMinute,
} from "./datetime";
import { filterItemsByTags } from "./filtering";
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

describe("タイムラインスキーマ", () => {
  it("サンプルドキュメントを受理する", () => {
    const result = parseTimelineDocument(sampleTimeline);
    expect(result.ok).toBe(true);
  });

  it("互換ドキュメントで不足した表示設定を既定値にする", () => {
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

  it("過去の themePreset を受理するが保持しない", () => {
    const document = structuredClone(sampleTimeline) as TimelineDocument & {
      view: TimelineDocument["view"] & { themePreset: "dark" };
    };
    document.view.themePreset = "dark";

    const result = parseTimelineDocument(document);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect("themePreset" in result.document.view).toBe(false);
    }
  });

  it("終了が開始より後でない表示範囲を拒否する", () => {
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

  it("不正な日時を拒否する", () => {
    const document = structuredClone(sampleTimeline);
    const item = document.items[0];
    if (item?.type !== "duration") {
      throw new Error("Expected duration item");
    }
    item.start = "2026-07-13";

    const result = parseTimelineDocument(document);
    expect(result.ok).toBe(false);
  });

  it("終了が開始より後でない期間アイテムを拒否する", () => {
    const document = structuredClone(sampleTimeline);
    const item = document.items[0];
    if (item?.type !== "duration") {
      throw new Error("Expected duration item");
    }
    item.end = item.start;

    const result = parseTimelineDocument(document);
    expect(result.ok).toBe(false);
  });

  it("存在しないアイテム参照を拒否する", () => {
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

  it("循環する依存関係を拒否する", () => {
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

describe("日時入力の形式変換", () => {
  it("タイムライン日時を datetime-local の分精度値へ変換する", () => {
    expect(toDateTimeLocalMinute("2026-07-13T09:30:45")).toBe(
      "2026-07-13T09:30",
    );
  });

  it("datetime-local の分精度値をタイムライン日時へ変換する", () => {
    expect(fromDateTimeLocalMinute("2026-07-13T09:30")).toBe(
      "2026-07-13T09:30:00",
    );
  });

  it("不正な datetime-local の分精度値を拒否する", () => {
    expect(fromDateTimeLocalMinute("2026-02-30T09:30")).toBeNull();
    expect(fromDateTimeLocalMinute("")).toBeNull();
  });
});

describe("タイムラインのドラッグスナップ", () => {
  it.each([
    ["year", "2026-07-02T12:00:00", "2027-01-01T00:00:00"],
    ["month", "2026-07-16T12:00:00", "2026-08-01T00:00:00"],
    ["day", "2026-07-13T12:00:00", "2026-07-14T00:00:00"],
    ["hour", "2026-07-13T09:30:00", "2026-07-13T10:00:00"],
  ] as const)("%s 表示では最も近い暦境界へスナップする", (scale, value, expected) => {
    expect(snapDateTimeToScale(value, scale)).toBe(expected);
  });

  it("ちょうど中間の場合は後の境界を選ぶ", () => {
    expect(snapDateTimeToScale("2026-07-13T12:00:00", "day")).toBe(
      "2026-07-14T00:00:00",
    );
  });

  it("月のスナップでは実際の暦日数を使う", () => {
    expect(snapDateTimeToScale("2026-02-14T12:00:00", "month")).toBe(
      "2026-02-01T00:00:00",
    );
    expect(snapDateTimeToScale("2026-02-15T00:00:00", "month")).toBe(
      "2026-03-01T00:00:00",
    );
  });
});

describe("Mermaid Gantt 出力", () => {
  it("依存関係とタグを含めずに全アイテムをレーン・日時順で出力する", () => {
    const mermaid = createMermaidGantt(sampleTimeline);

    expect(mermaid).toBe(`gantt
    title Timeweaver Sample
    dateFormat YYYY-MM-DD HH:mm:ss
    axisFormat %Y-%m-%d
    todayMarker off
    section 計画
    設計 : task_1, 2026-07-13 09:00:00, 2026-07-15 18:00:00
    section 実装
    ドキュメント : task_2, 2026-07-16 09:00:00, 2026-07-18 18:00:00
    実装 : task_3, 2026-07-16 09:00:00, 2026-07-20 18:00:00
    section リリース
    検証 : task_4, 2026-07-20 00:00:00, 2026-07-21 09:00:00
    リリース : milestone, task_5, 2026-07-22 09:00:00, 0d
`);
    expect(mermaid).not.toContain("dep-");
    expect(mermaid).not.toContain("Planning");
  });

  it("空レーンを省略し制御文字を正規化する", () => {
    const document = structuredClone(sampleTimeline);
    document.timeline.title = "予定\n表";
    document.lanes[0].name = "計画\nレーン";
    document.items[0].title = "設計\tA";
    document.lanes.push({ id: "lane-empty", name: "空", order: 3 });

    const mermaid = createMermaidGantt(document);

    expect(mermaid).toContain("    title 予定 表");
    expect(mermaid).toContain("    section 計画 レーン");
    expect(mermaid).toContain("    設計 A : task_1");
    expect(mermaid).not.toContain("section 空");
  });

  it("空ドキュメントを有効な Gantt ヘッダーとして出力する", () => {
    const document = structuredClone(sampleTimeline);
    document.timeline.title = "";
    document.items = [];

    expect(createMermaidGantt(document)).toBe(`gantt
    dateFormat YYYY-MM-DD HH:mm:ss
    axisFormat %Y-%m-%d
    todayMarker off
`);
  });
});

describe("タイムライン範囲の操作", () => {
  it("表示範囲の中心を基準にズームする", () => {
    const fullRange = createTimelineRange(sampleTimeline.items, "day");
    const range = resolveVisibleRange(null, fullRange);
    const visibleRange = zoomTimelineRange({
      range,
      fullRange,
      factor: 0.5,
    });

    expect(visibleRange).not.toBeNull();
    expect(visibleRange?.start).toBe("2026-07-15T12:00:00");
    expect(visibleRange?.end).toBe("2026-07-20T12:00:00");
  });

  it("表示範囲の長さを変えずにパンする", () => {
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

describe("依存関係の振る舞い", () => {
  it("タイムラインメタデータを更新し空のタイトルを除外する", () => {
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

  it("表示範囲を更新する", () => {
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

  it("依存関係と依存先アイテムを選択する", () => {
    const state = timelineReducer(stateFor(), {
      type: "selectDependency",
      dependencyId: "dep-qa-release",
    });

    expect(state.selectedDependencyId).toBe("dep-qa-release");
    expect(state.selectedItemId).toBe("item-release");
  });

  it("アイテムを選択すると依存関係の選択を解除する", () => {
    const selected = timelineReducer(stateFor(), {
      type: "selectDependency",
      dependencyId: "dep-qa-release",
    });

    const state = timelineReducer(selected, {
      type: "selectItem",
      itemId: "item-design",
    });

    expect(state.selectedDependencyId).toBeNull();
    expect(state.selectedItemId).toBe("item-design");
  });

  it("後続アイテムを同じ差分だけ移動する", () => {
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
      expect(release.at).toBe("2026-07-23T09:00:00");
    }
  });

  it("後続アイテムを手動移動すると入力側のラグを再計算する", () => {
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

  it("編集した依存関係ラグに合わせて依存先アイテムを移動する", () => {
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
      expect(release.at).toBe("2026-07-22T18:00:00");
    }
    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-design-build",
      )?.lagSeconds,
    ).toBe(172_800);
    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-build-qa",
      )?.lagSeconds,
    ).toBe(-151_200);
  });

  it("編集した依存関係ラグで依存先アイテムを前方へ移動できる", () => {
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
      expect(release.at).toBe("2026-07-22T09:00:00");
    }
    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-design-build",
      )?.lagSeconds,
    ).toBe(0);
    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-build-qa",
      )?.lagSeconds,
    ).toBe(-10_800);
  });

  it("編集した依存関係ラグを他の入力側依存より優先する", () => {
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

  it("先行アイテムの終了変更で後続アイテムを移動する", () => {
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
      expect(release.at).toBe("2026-07-23T09:00:00");
    }

    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-design-build",
      )?.lagSeconds,
    ).toBe(54_000);
  });

  it("伝播を無効にした場合は後続アイテムを維持する", () => {
    const document = structuredClone(sampleTimeline);
    const design = document.items.find((item) => item.id === "item-design");
    if (design?.type !== "duration") {
      throw new Error("Expected duration item");
    }

    const state = timelineReducer(stateFor(document), {
      type: "updateItem",
      item: { ...design, end: "2026-07-16T18:00:00" },
      propagate: false,
    });
    const build = state.document.items.find((item) => item.id === "item-build");

    expect(build?.type).toBe("duration");
    if (build?.type === "duration") {
      expect(build.start).toBe("2026-07-16T09:00:00");
      expect(build.end).toBe("2026-07-20T18:00:00");
    }
  });

  it("先行アイテムの開始のみが変わっても後続アイテムを移動しない", () => {
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

  it("時点の先行アイテム変更でも後続アイテムを同じ差分だけ移動する", () => {
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
      expect(followup.at).toBe("2026-07-22T11:00:00");
    }
  });

  it("先行アイテムの終了を前方へ移動すると後続アイテムも前方へ移動する", () => {
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
      expect(build.start).toBe("2026-07-15T09:00:00");
      expect(build.end).toBe("2026-07-19T18:00:00");
    }
  });

  it("別の先行アイテムが未変更でも後続アイテムを移動する", () => {
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
      expect(build.start).toBe("2026-07-17T03:00:00");
      expect(build.end).toBe("2026-07-21T12:00:00");
    }
    expect(
      state.document.dependencies.find(
        (dependency) => dependency.id === "dep-design-build",
      )?.lagSeconds,
    ).toBe(54_000);
  });

  it("後続アイテムを後ろへ押し出すと全入力側ラグを再計算する", () => {
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

  it("合流する依存関係でも各後続アイテムを一度だけ移動する", () => {
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
      expect(merge.at).toBe("2026-07-22T10:00:00");
    }
  });

  it("循環を作る依存関係の追加を拒否する", () => {
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

    expect(state.document.dependencies).toHaveLength(
      sampleTimeline.dependencies.length,
    );
    expect(state.importIssues[0]?.message).toContain("循環");
  });
});

describe("テーマスキーマ", () => {
  it("単独のテーマドキュメントを受理する", () => {
    const result = parseTimelineThemeDocument({
      schemaVersion: themeSchemaVersion,
      tokens: getThemeTokens(timelineThemes.dark),
    });

    expect(result.ok).toBe(true);
  });

  it("不完全または不正なテーマトークンを拒否する", () => {
    const tokens = getThemeTokens(timelineThemes.light);
    const result = parseTimelineThemeDocument({
      schemaVersion: themeSchemaVersion,
      tokens: { ...tokens, laneBorder: "blue" },
    });

    expect(result.ok).toBe(false);
  });
});

describe("タグフィルタリング", () => {
  it("選択タグに OR フィルタを使う", () => {
    const filtered = filterItemsByTags(sampleTimeline.items, [
      "planning",
      "release",
    ]);
    expect(filtered.map((item) => item.id)).toEqual([
      "item-design",
      "item-qa",
      "item-release",
    ]);
  });

  it("タグフィルタが有効な間はタグなしアイテムを隠す", () => {
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

describe("タグとレーンの管理", () => {
  it("タグ名と色を更新する", () => {
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

  it("空のタグ名とレーン名を無視する", () => {
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

  it("レーン名を更新する", () => {
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

  it("削除したタグをアイテムと有効なフィルタから除去する", () => {
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

  it("色タグを削除した場合に colorTagId を解除する", () => {
    const document = structuredClone(sampleTimeline);
    document.items[0].colorTagId = "planning";

    const state = timelineReducer(stateFor(document), {
      type: "deleteTag",
      tagId: "planning",
    });

    expect(state.document.items[0].colorTagId).toBeNull();
  });

  it("タグの並べ替え後に順序を正規化する", () => {
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

  it("レーンの並べ替え後に順序を正規化する", () => {
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

  it("アイテムを含むレーンの削除を拒否する", () => {
    const state = timelineReducer(stateFor(), {
      type: "deleteLane",
      laneId: "lane-planning",
    });

    expect(
      state.document.lanes.some((lane) => lane.id === "lane-planning"),
    ).toBe(true);
    expect(state.importIssues[0]?.message).toContain("削除できません");
  });

  it("空のレーンを削除する", () => {
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

describe("アイテムコピー", () => {
  it("選択アイテムを新しい ID とタイトルでコピーする", () => {
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

  it("アイテムとともに依存関係はコピーしない", () => {
    const state = timelineReducer(stateFor(), {
      type: "copyItem",
      itemId: "item-design",
    });

    expect(state.document.dependencies).toHaveLength(
      sampleTimeline.dependencies.length,
    );
  });
});
