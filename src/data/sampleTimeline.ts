import type { TimelineDocument } from "../domain/types";

export const sampleTimeline: TimelineDocument = {
  schemaVersion: "1.0.0",
  timeline: {
    title: "Timeweaver Sample",
    description: "初期表示用のサンプルタイムライン",
  },
  lanes: [
    { id: "lane-planning", name: "計画", order: 0 },
    { id: "lane-build", name: "実装", order: 1 },
    { id: "lane-release", name: "リリース", order: 2 },
  ],
  tags: [
    { id: "planning", name: "Planning", color: "#2563eb", order: 0 },
    { id: "build", name: "Build", color: "#059669", order: 1 },
    { id: "release", name: "Release", color: "#dc2626", order: 2 },
  ],
  items: [
    {
      id: "item-design",
      type: "duration",
      title: "設計",
      description: "基本設計を固める",
      laneId: "lane-planning",
      tagIds: ["planning"],
      colorTagId: null,
      color: null,
      start: "2026-07-13T09:00:00",
      end: "2026-07-15T18:00:00",
    },
    {
      id: "item-build",
      type: "duration",
      title: "実装",
      description: "初期版の主要機能を実装する",
      laneId: "lane-build",
      tagIds: ["build"],
      colorTagId: null,
      color: null,
      start: "2026-07-16T09:00:00",
      end: "2026-07-20T18:00:00",
    },
    {
      id: "item-release",
      type: "instant",
      title: "リリース",
      description: "初期版を公開する",
      laneId: "lane-release",
      tagIds: ["release"],
      colorTagId: null,
      color: null,
      at: "2026-07-21T10:00:00",
    },
  ],
  dependencies: [
    {
      id: "dep-design-build",
      fromId: "item-design",
      toId: "item-build",
      type: "finish-to-start",
      lagSeconds: 54000,
    },
    {
      id: "dep-build-release",
      fromId: "item-build",
      toId: "item-release",
      type: "finish-to-start",
      lagSeconds: 57600,
    },
  ],
  view: {
    scale: "day",
    visibleRange: null,
    visibleTagIds: [],
    tagFilterMode: "any",
    laneMode: "manual",
    itemDisplay: {
      showLabels: true,
      showDependencyLines: true,
    },
  },
};
