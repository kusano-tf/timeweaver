import type { TimelineItem } from "./types";

export function filterItemsByTags(
  items: TimelineItem[],
  visibleTagIds: string[],
): TimelineItem[] {
  if (visibleTagIds.length === 0) {
    return items;
  }

  const visible = new Set(visibleTagIds);
  return items.filter((item) =>
    item.tagIds.some((tagId) => visible.has(tagId)),
  );
}

export function getItemColor(
  item: TimelineItem,
  tagsById: Map<string, { color: string }>,
): string {
  if (item.color) {
    return item.color;
  }

  if (item.colorTagId) {
    return tagsById.get(item.colorTagId)?.color ?? "#64748b";
  }

  const firstTag = item.tagIds[0];
  if (firstTag) {
    return tagsById.get(firstTag)?.color ?? "#64748b";
  }

  return "#64748b";
}
