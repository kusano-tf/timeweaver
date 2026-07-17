import {
  addSecondsToDateTime,
  compareDateTime,
  secondsBetween,
} from "./datetime";
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
  _deltaSeconds: number,
): { document: TimelineDocument; changedItemIds: string[] } {
  const itemsById = new Map(document.items.map((item) => [item.id, item]));
  const changedItems = new Map<string, TimelineItem>();
  const outgoing = new Map<string, Dependency[]>();
  const incoming = new Map<string, Dependency[]>();

  for (const dependency of document.dependencies) {
    const next = outgoing.get(dependency.fromId) ?? [];
    next.push(dependency);
    outgoing.set(dependency.fromId, next);

    const previous = incoming.get(dependency.toId) ?? [];
    previous.push(dependency);
    incoming.set(dependency.toId, previous);
  }

  const moveQueue = [movedItemId];

  while (moveQueue.length > 0) {
    const fromId = moveQueue.shift();
    if (!fromId) {
      continue;
    }

    for (const dependency of outgoing.get(fromId) ?? []) {
      const current =
        changedItems.get(dependency.toId) ?? itemsById.get(dependency.toId);
      if (!current) {
        continue;
      }

      const constrainedStart = maxIncomingConstraintStart(
        dependency.toId,
        incoming,
        itemsById,
        changedItems,
      );
      if (
        !constrainedStart ||
        compareDateTime(getItemStart(current), constrainedStart) >= 0
      ) {
        continue;
      }

      const deltaSeconds = secondsBetween(
        getItemStart(current),
        constrainedStart,
      );
      changedItems.set(
        dependency.toId,
        moveItemBySeconds(current, deltaSeconds),
      );

      moveQueue.push(dependency.toId);
    }
  }

  if (changedItems.size === 0) {
    return { document, changedItemIds: [] };
  }

  return {
    document: {
      ...document,
      items: document.items.map((item) => changedItems.get(item.id) ?? item),
    },
    changedItemIds: [...changedItems.keys()],
  };
}

function maxIncomingConstraintStart(
  itemId: string,
  incoming: Map<string, Dependency[]>,
  itemsById: Map<string, TimelineItem>,
  changedItems: Map<string, TimelineItem>,
) {
  const dependencies = incoming.get(itemId) ?? [];
  let constrainedStart: string | null = null;

  for (const dependency of dependencies) {
    const fromItem =
      changedItems.get(dependency.fromId) ?? itemsById.get(dependency.fromId);
    if (!fromItem) {
      continue;
    }

    const candidate = addSecondsToDateTime(
      getItemEnd(fromItem),
      dependency.lagSeconds,
    );
    if (!constrainedStart || compareDateTime(candidate, constrainedStart) > 0) {
      constrainedStart = candidate;
    }
  }

  return constrainedStart;
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

export function recalculateConnectedLagSeconds(
  document: TimelineDocument,
  changedItemIds: string[],
): TimelineDocument {
  const changed = new Set(changedItemIds);
  if (changed.size === 0) {
    return document;
  }

  const itemsById = new Map(document.items.map((item) => [item.id, item]));

  return {
    ...document,
    dependencies: document.dependencies.map((dependency) => {
      if (!changed.has(dependency.fromId) && !changed.has(dependency.toId)) {
        return dependency;
      }

      const fromItem = itemsById.get(dependency.fromId);
      const toItem = itemsById.get(dependency.toId);
      if (!fromItem || !toItem) {
        return dependency;
      }

      return {
        ...dependency,
        lagSeconds: secondsBetween(getItemEnd(fromItem), getItemStart(toItem)),
      };
    }),
  };
}

export function sortItemsByStart(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) =>
    compareDateTime(getItemStart(a), getItemStart(b)),
  );
}
