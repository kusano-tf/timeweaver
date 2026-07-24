import type { TimelineDocument, TimelineItem } from "./types";

// biome-ignore lint/suspicious/noControlCharactersInRegex: Mermaid text is line-oriented.
const controlCharacterPattern = /[\u0000-\u001F\u007F]/g;

export function createMermaidGantt(document: TimelineDocument): string {
  const lines = [
    "gantt",
    ...(document.timeline.title
      ? [`    title ${normalizeMermaidText(document.timeline.title)}`]
      : []),
    "    dateFormat YYYY-MM-DD HH:mm:ss",
    "    axisFormat %Y-%m-%d",
    "    todayMarker off",
  ];
  let taskNumber = 1;

  for (const lane of [...document.lanes].sort(compareByOrderAndId)) {
    const items = document.items
      .filter((item) => item.laneId === lane.id)
      .sort(compareItems);
    if (items.length === 0) {
      continue;
    }

    lines.push(`    section ${normalizeMermaidText(lane.name)}`);
    for (const item of items) {
      const taskId = `task_${taskNumber}`;
      taskNumber += 1;
      lines.push(`    ${formatItem(item, taskId)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatItem(item: TimelineItem, taskId: string): string {
  const title = normalizeMermaidText(item.title);
  if (item.type === "instant") {
    return `${title} : milestone, ${taskId}, ${formatMermaidDate(item.at)}, 0d`;
  }

  return `${title} : ${taskId}, ${formatMermaidDate(item.start)}, ${formatMermaidDate(item.end)}`;
}

function compareByOrderAndId(
  a: TimelineDocument["lanes"][number],
  b: TimelineDocument["lanes"][number],
): number {
  return a.order - b.order || a.id.localeCompare(b.id);
}

function compareItems(a: TimelineItem, b: TimelineItem): number {
  const startComparison = getItemStart(a).localeCompare(getItemStart(b));
  if (startComparison !== 0) {
    return startComparison;
  }

  const endComparison = getItemEnd(a).localeCompare(getItemEnd(b));
  return endComparison || a.id.localeCompare(b.id);
}

function getItemStart(item: TimelineItem): string {
  return item.type === "instant" ? item.at : item.start;
}

function getItemEnd(item: TimelineItem): string {
  return item.type === "instant" ? item.at : item.end;
}

function formatMermaidDate(value: string): string {
  return value.replace("T", " ");
}

function normalizeMermaidText(value: string): string {
  return value.replace(controlCharacterPattern, " ").trim() || "untitled";
}
