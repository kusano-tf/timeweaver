export type TimelineThemePreset = "light" | "dark";

export type TimelineThemeDefinition = {
  timelineBackground: string;
  headerBackground: string;
  laneBackground: string;
  laneBorder: string;
  laneLabel: string;
  tickLabel: string;
  boundaryTickLabel: string;
  dependencyLine: string;
  itemStroke: string;
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
    laneBackground: "#f8fafc",
    laneBorder: "#e2e8f0",
    laneLabel: "#334155",
    tickLabel: "#475569",
    boundaryTickLabel: "#0f172a",
    dependencyLine: "#64748b",
    itemStroke: "#ffffff",
    itemLabel: "#0f172a",
    itemLabelOnColor: "#ffffff",
    uiSelectionStroke: "#0f172a",
  },
  dark: {
    timelineBackground: "#0f172a",
    headerBackground: "#111827",
    laneBackground: "#1e293b",
    laneBorder: "#334155",
    laneLabel: "#e2e8f0",
    tickLabel: "#cbd5e1",
    boundaryTickLabel: "#f8fafc",
    dependencyLine: "#94a3b8",
    itemStroke: "#0f172a",
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
}[] = [
  { key: "timelineBackground", label: "背景" },
  { key: "headerBackground", label: "ヘッダー背景" },
  { key: "laneBackground", label: "レーン背景" },
  { key: "laneBorder", label: "レーン境界線" },
  { key: "laneLabel", label: "レーンラベル" },
  { key: "tickLabel", label: "目盛りラベル" },
  { key: "boundaryTickLabel", label: "境界目盛りラベル" },
  { key: "dependencyLine", label: "依存線" },
  { key: "itemStroke", label: "アイテム枠線" },
  { key: "itemLabel", label: "アイテムラベル" },
  { key: "itemLabelOnColor", label: "バー内ラベル" },
];

export const timelineThemeTokenKeys = timelineThemeEntries.map(
  (entry) => entry.key,
) as (keyof TimelineThemeDefinition)[];

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
