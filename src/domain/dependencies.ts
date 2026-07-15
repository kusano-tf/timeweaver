import { compareDateTime, secondsBetween } from "./datetime";
import { getItemEnd, getItemStart, moveItemBySeconds } from "./items";
import type { Dependency, TimelineDocument, TimelineItem } from "./types";

export function detectDependencyCycles(dependencies: Dependency[]): string[][] {
  const outgoing = new Map<string, string[]>();
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  for (const dependency of dependencies) {
    const next = outgoing.get(dependency.fromId) ?? [];
    next.push(dependency.toId);
    outgoing.set(dependency.fromId, next);
  }

  function visit(itemId: string) {
    if (visiting.has(itemId)) {
      const cycleStart = stack.indexOf(itemId);
      cycles.push([...stack.slice(cycleStart), itemId]);
      return;
    }

    if (visited.has(itemId)) {
      return;
    }

    visiting.add(itemId);
    stack.push(itemId);

    for (const next of outgoing.get(itemId) ?? []) {
      visit(next);
    }

    stack.pop();
    visiting.delete(itemId);
    visited.add(itemId);
  }

  for (const itemId of outgoing.keys()) {
    visit(itemId);
  }

  return cycles;
}

export function propagateMove(
  document: TimelineDocument,
  movedItemId: string,
  deltaSeconds: number,
): TimelineDocument {
  const itemsById = new Map(document.items.map((item) => [item.id, item]));
  const changedItems = new Map<string, TimelineItem>();
  const outgoing = new Map<string, Dependency[]>();

  for (const dependency of document.dependencies) {
    const next = outgoing.get(dependency.fromId) ?? [];
    next.push(dependency);
    outgoing.set(dependency.fromId, next);
  }

  const moveQueue = [movedItemId];
  const seen = new Set<string>();
  const queued = new Set<string>([movedItemId]);

  while (moveQueue.length > 0) {
    const fromId = moveQueue.shift();
    if (!fromId || seen.has(fromId)) {
      continue;
    }
    seen.add(fromId);

    for (const dependency of outgoing.get(fromId) ?? []) {
      const current =
        changedItems.get(dependency.toId) ?? itemsById.get(dependency.toId);
      if (!current) {
        continue;
      }

      if (!changedItems.has(dependency.toId)) {
        changedItems.set(
          dependency.toId,
          moveItemBySeconds(current, deltaSeconds),
        );
      }

      if (!queued.has(dependency.toId)) {
        queued.add(dependency.toId);
        moveQueue.push(dependency.toId);
      }
    }
  }

  if (changedItems.size === 0) {
    return document;
  }

  return {
    ...document,
    items: document.items.map((item) => changedItems.get(item.id) ?? item),
  };
}

export function recalculateIncomingLagSeconds(
  document: TimelineDocument,
  movedItemId: string,
): TimelineDocument {
  const itemsById = new Map(document.items.map((item) => [item.id, item]));
  const movedItem = itemsById.get(movedItemId);

  if (!movedItem) {
    return document;
  }

  return {
    ...document,
    dependencies: document.dependencies.map((dependency) => {
      if (dependency.toId !== movedItemId) {
        return dependency;
      }

      const fromItem = itemsById.get(dependency.fromId);
      if (!fromItem) {
        return dependency;
      }

      return {
        ...dependency,
        lagSeconds: secondsBetween(
          getItemEnd(fromItem),
          getItemStart(movedItem),
        ),
      };
    }),
  };
}

export function sortItemsByStart(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) =>
    compareDateTime(getItemStart(a), getItemStart(b)),
  );
}
