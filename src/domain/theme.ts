export type TimelineThemePreset = "light" | "dark";

export type TimelineThemeDefinition = {
  timelineBackground: string;
  headerBackground: string;
  axisLine: string;
  axisLineWidth: number;
  laneBackground: string;
  laneBorder: string;
  laneBorderWidth: number;
  laneLabel: string;
  tickLabel: string;
  boundaryTickLabel: string;
  dependencyLine: string;
  dependencyLineWidth: number;
  dependencyLineStyle: "solid" | "dashed";
  itemHeightPercent: number;
  lanePaddingPercent: number;
  laneRowGapPercent: number;
  itemStroke: string;
  itemStrokeWidth: number;
  itemShape: "square" | "rounded" | "pill";
  instantItemShape: "diamond" | "circle" | "star";
  itemLabel: string;
  itemLabelOnColor: string;
};

export type TimelineTheme = TimelineThemeDefinition & {
  uiSelectionStroke: string;
};

export const timelineThemes: Record<TimelineThemePreset, TimelineTheme> = {
  light: {
    timelineBackground: "#ffffff",
    headerBackground: "#f8fafc",
    axisLine: "#e2e8f0",
    axisLineWidth: 1,
    laneBackground: "#f8fafc",
    laneBorder: "#e2e8f0",
    laneBorderWidth: 1,
    laneLabel: "#334155",
    tickLabel: "#475569",
    boundaryTickLabel: "#0f172a",
    dependencyLine: "#64748b",
    dependencyLineWidth: 2,
    dependencyLineStyle: "solid",
    itemHeightPercent: 100,
    lanePaddingPercent: 100,
    laneRowGapPercent: 100,
    itemStroke: "#ffffff",
    itemStrokeWidth: 2,
    itemShape: "rounded",
    instantItemShape: "diamond",
    itemLabel: "#0f172a",
    itemLabelOnColor: "#ffffff",
    uiSelectionStroke: "#0f172a",
  },
  dark: {
    timelineBackground: "#0f172a",
    headerBackground: "#111827",
    axisLine: "#334155",
    axisLineWidth: 1,
    laneBackground: "#1e293b",
    laneBorder: "#334155",
    laneBorderWidth: 1,
    laneLabel: "#e2e8f0",
    tickLabel: "#cbd5e1",
    boundaryTickLabel: "#f8fafc",
    dependencyLine: "#94a3b8",
    dependencyLineWidth: 2,
    dependencyLineStyle: "solid",
    itemHeightPercent: 100,
    lanePaddingPercent: 100,
    laneRowGapPercent: 100,
    itemStroke: "#0f172a",
    itemStrokeWidth: 2,
    itemShape: "rounded",
    instantItemShape: "diamond",
    itemLabel: "#e2e8f0",
    itemLabelOnColor: "#ffffff",
    uiSelectionStroke: "#38bdf8",
  },
};

export const timelineThemeLabels: Record<TimelineThemePreset, string> = {
  light: "ライト",
  dark: "ダーク",
};

export const timelineThemeEntries: {
  key: keyof TimelineThemeDefinition;
  label: string;
  type: "color" | "width" | "percent" | "select";
}[] = [
  { key: "timelineBackground", label: "背景", type: "color" },
  { key: "headerBackground", label: "ヘッダー背景", type: "color" },
  { key: "axisLine", label: "線・目盛り線", type: "color" },
  { key: "axisLineWidth", label: "線・目盛り線", type: "width" },
  { key: "laneBackground", label: "背景", type: "color" },
  { key: "laneBorder", label: "境界線", type: "color" },
  { key: "laneBorderWidth", label: "境界線", type: "width" },
  { key: "laneLabel", label: "ラベル", type: "color" },
  { key: "tickLabel", label: "目盛りラベル", type: "color" },
  { key: "boundaryTickLabel", label: "境界目盛りラベル", type: "color" },
  { key: "dependencyLine", label: "線", type: "color" },
  { key: "dependencyLineWidth", label: "線", type: "width" },
  { key: "dependencyLineStyle", label: "スタイル", type: "select" },
  { key: "itemHeightPercent", label: "アイテム高（%）", type: "percent" },
  { key: "lanePaddingPercent", label: "上下余白（%）", type: "percent" },
  { key: "laneRowGapPercent", label: "行間（%）", type: "percent" },
  { key: "itemStroke", label: "枠線", type: "color" },
  { key: "itemStrokeWidth", label: "枠線", type: "width" },
  { key: "itemShape", label: "期間アイテム形状", type: "select" },
  { key: "instantItemShape", label: "時点アイテム形状", type: "select" },
  { key: "itemLabel", label: "ラベル", type: "color" },
  { key: "itemLabelOnColor", label: "バー内ラベル", type: "color" },
];

export const timelineThemeTokenKeys = timelineThemeEntries.map(
  (entry) => entry.key,
) as (keyof TimelineThemeDefinition)[];

export const timelineThemeSections = [
  { label: "キャンバス", keys: ["timelineBackground"] },
  {
    label: "時間軸",
    keys: [
      "headerBackground",
      "axisLine",
      "axisLineWidth",
      "tickLabel",
      "boundaryTickLabel",
    ],
  },
  {
    label: "レーン",
    keys: [
      "laneBackground",
      "laneBorder",
      "laneBorderWidth",
      "lanePaddingPercent",
      "laneRowGapPercent",
      "laneLabel",
    ],
  },
  {
    label: "依存関係",
    keys: ["dependencyLine", "dependencyLineWidth", "dependencyLineStyle"],
  },
  {
    label: "アイテム",
    keys: [
      "itemHeightPercent",
      "itemStroke",
      "itemStrokeWidth",
      "itemShape",
      "instantItemShape",
      "itemLabel",
      "itemLabelOnColor",
    ],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  keys: readonly (keyof TimelineThemeDefinition)[];
}>;

export function createTimelineTheme(
  tokens: TimelineThemeDefinition,
  preset: TimelineThemePreset = "light",
): TimelineTheme {
  return {
    ...tokens,
    uiSelectionStroke: timelineThemes[preset].uiSelectionStroke,
  };
}

export function getThemeTokens(theme: TimelineTheme): TimelineThemeDefinition {
  const { uiSelectionStroke: _uiSelectionStroke, ...tokens } = theme;
  return tokens;
}
