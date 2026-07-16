import { secondsBetween } from "../domain/datetime";
import {
  detectDependencyCycles,
  propagateMove,
  recalculateIncomingLagSeconds,
} from "../domain/dependencies";
import { getItemEnd, moveItemBySeconds } from "../domain/items";
import type {
  DateTimeString,
  Dependency,
  Lane,
  Tag,
  TimelineDocument,
  TimelineItem,
  TimelineScale,
  ValidationIssue,
} from "../domain/types";

export type TimelineState = {
  document: TimelineDocument;
  selectedItemId: string | null;
  importIssues: ValidationIssue[];
  dirty: boolean;
};

export type TimelineAction =
  | { type: "replaceDocument"; document: TimelineDocument }
  | { type: "selectItem"; itemId: string | null }
  | { type: "setImportIssues"; issues: ValidationIssue[] }
  | { type: "updateTimelineMeta"; title?: string; description?: string }
  | { type: "setScale"; scale: TimelineScale }
  | { type: "toggleTag"; tagId: string }
  | { type: "updateItem"; item: TimelineItem }
  | { type: "moveItem"; itemId: string; deltaSeconds: number; laneId?: string }
  | { type: "addItem"; item: TimelineItem }
  | { type: "copyItem"; itemId: string }
  | { type: "deleteItem"; itemId: string }
  | { type: "addDependency"; dependency: Dependency }
  | { type: "deleteDependency"; dependencyId: string }
  | { type: "addTag"; tag: Tag }
  | { type: "updateTag"; tagId: string; name?: string; color?: string }
  | { type: "deleteTag"; tagId: string }
  | { type: "reorderTags"; tagIds: string[] }
  | { type: "addLane"; lane: Lane }
  | { type: "updateLane"; laneId: string; name: string }
  | { type: "deleteLane"; laneId: string }
  | { type: "reorderLanes"; laneIds: string[] }
  | { type: "markExported" };

export function timelineReducer(
  state: TimelineState,
  action: TimelineAction,
): TimelineState {
  switch (action.type) {
    case "replaceDocument":
      return {
        document: action.document,
        selectedItemId: action.document.items[0]?.id ?? null,
        importIssues: [],
        dirty: false,
      };

    case "selectItem":
      return { ...state, selectedItemId: action.itemId };

    case "setImportIssues":
      return { ...state, importIssues: action.issues };

    case "updateTimelineMeta": {
      const title = action.title?.trim();
      if (title === "") {
        return state;
      }

      return {
        ...state,
        dirty: true,
        document: {
          ...state.document,
          timeline: {
            ...state.document.timeline,
            ...(title !== undefined ? { title } : {}),
            ...(action.description !== undefined
              ? { description: action.description }
              : {}),
          },
        },
      };
    }

    case "setScale":
      return {
        ...state,
        dirty: true,
        document: {
          ...state.document,
          view: { ...state.document.view, scale: action.scale },
        },
      };

    case "toggleTag": {
      const current = state.document.view.visibleTagIds;
      const next = current.includes(action.tagId)
        ? current.filter((tagId) => tagId !== action.tagId)
        : [...current, action.tagId];

      return {
        ...state,
        dirty: true,
        document: {
          ...state.document,
          view: { ...state.document.view, visibleTagIds: next },
        },
      };
    }

    case "updateItem": {
      const nextItem = normalizeItemColorTag(action.item);
      const currentItem = state.document.items.find(
        (item) => item.id === nextItem.id,
      );
      const endDeltaSeconds = currentItem
        ? secondsBetween(getItemEnd(currentItem), getItemEnd(nextItem))
        : 0;
      const updatedDocument = {
        ...state.document,
        items: state.document.items.map((item) =>
          item.id === nextItem.id ? nextItem : item,
        ),
      };
      const propagatedDocument =
        endDeltaSeconds === 0
          ? updatedDocument
          : propagateMove(updatedDocument, nextItem.id, endDeltaSeconds);

      return {
        ...state,
        dirty: true,
        document: recalculateIncomingLagSeconds(
          propagatedDocument,
          nextItem.id,
        ),
      };
    }

    case "moveItem": {
      const movedDocument = {
        ...state.document,
        items: state.document.items.map((item) => {
          if (item.id !== action.itemId) {
            return item;
          }
          return {
            ...moveItemBySeconds(item, action.deltaSeconds),
            laneId: action.laneId ?? item.laneId,
          } as TimelineItem;
        }),
      };

      const propagated = propagateMove(
        movedDocument,
        action.itemId,
        action.deltaSeconds,
      );

      return {
        ...state,
        dirty: true,
        document: recalculateIncomingLagSeconds(propagated, action.itemId),
      };
    }

    case "addItem":
      return {
        ...state,
        selectedItemId: action.item.id,
        dirty: true,
        document: {
          ...state.document,
          items: [...state.document.items, action.item],
        },
      };

    case "copyItem": {
      const source = state.document.items.find(
        (item) => item.id === action.itemId,
      );
      if (!source) {
        return state;
      }

      const copiedItem = copyTimelineItem(
        source,
        state.document.items.map((item) => item.id),
      );

      return {
        ...state,
        selectedItemId: copiedItem.id,
        dirty: true,
        document: {
          ...state.document,
          items: [...state.document.items, copiedItem],
        },
      };
    }

    case "deleteItem":
      return {
        ...state,
        selectedItemId:
          state.selectedItemId === action.itemId ? null : state.selectedItemId,
        dirty: true,
        document: {
          ...state.document,
          items: state.document.items.filter(
            (item) => item.id !== action.itemId,
          ),
          dependencies: state.document.dependencies.filter(
            (dependency) =>
              dependency.fromId !== action.itemId &&
              dependency.toId !== action.itemId,
          ),
        },
      };

    case "addDependency":
      if (
        detectDependencyCycles([
          ...state.document.dependencies,
          action.dependency,
        ]).length > 0
      ) {
        return {
          ...state,
          importIssues: [
            {
              path: "dependencies",
              message: "循環する依存関係は追加できません。",
            },
          ],
        };
      }

      return {
        ...state,
        importIssues: [],
        dirty: true,
        document: {
          ...state.document,
          dependencies: [...state.document.dependencies, action.dependency],
        },
      };

    case "deleteDependency":
      return {
        ...state,
        dirty: true,
        document: {
          ...state.document,
          dependencies: state.document.dependencies.filter(
            (dependency) => dependency.id !== action.dependencyId,
          ),
        },
      };

    case "addTag":
      return {
        ...state,
        dirty: true,
        document: {
          ...state.document,
          tags: [...state.document.tags, action.tag],
        },
      };

    case "updateTag": {
      const name = action.name?.trim();
      const color = action.color?.trim();
      if (name === "" || color === "") {
        return state;
      }

      return {
        ...state,
        dirty: true,
        document: {
          ...state.document,
          tags: state.document.tags.map((tag) =>
            tag.id === action.tagId
              ? {
                  ...tag,
                  ...(name !== undefined ? { name } : {}),
                  ...(color !== undefined ? { color } : {}),
                }
              : tag,
          ),
        },
      };
    }

    case "deleteTag":
      return {
        ...state,
        dirty: true,
        document: {
          ...state.document,
          tags: state.document.tags.filter((tag) => tag.id !== action.tagId),
          items: state.document.items.map((item) => ({
            ...item,
            tagIds: item.tagIds.filter((tagId) => tagId !== action.tagId),
            colorTagId:
              item.colorTagId === action.tagId ? null : item.colorTagId,
          })),
          view: {
            ...state.document.view,
            visibleTagIds: state.document.view.visibleTagIds.filter(
              (tagId) => tagId !== action.tagId,
            ),
          },
        },
      };

    case "reorderTags":
      return {
        ...state,
        dirty: true,
        document: {
          ...state.document,
          tags: reorderByIds(state.document.tags, action.tagIds),
        },
      };

    case "addLane":
      return {
        ...state,
        dirty: true,
        document: {
          ...state.document,
          lanes: [...state.document.lanes, action.lane],
        },
      };

    case "updateLane": {
      const name = action.name.trim();
      if (!name) {
        return state;
      }

      return {
        ...state,
        dirty: true,
        document: {
          ...state.document,
          lanes: state.document.lanes.map((lane) =>
            lane.id === action.laneId ? { ...lane, name } : lane,
          ),
        },
      };
    }

    case "deleteLane":
      if (state.document.items.some((item) => item.laneId === action.laneId)) {
        return {
          ...state,
          importIssues: [
            {
              path: "lanes",
              message: "アイテムが配置されているレーンは削除できません。",
            },
          ],
        };
      }

      return {
        ...state,
        importIssues: [],
        dirty: true,
        document: {
          ...state.document,
          lanes: state.document.lanes.filter(
            (lane) => lane.id !== action.laneId,
          ),
        },
      };

    case "reorderLanes":
      return {
        ...state,
        dirty: true,
        document: {
          ...state.document,
          lanes: reorderByIds(state.document.lanes, action.laneIds),
        },
      };

    case "markExported":
      return { ...state, dirty: false };
  }
}

export function moveItemToStart(
  item: TimelineItem,
  nextStart: DateTimeString,
): number {
  const currentStart = item.type === "duration" ? item.start : item.at;
  return secondsBetween(currentStart, nextStart);
}

function copyTimelineItem(
  item: TimelineItem,
  existingItemIds: string[],
): TimelineItem {
  return {
    ...item,
    id: createCopyId(item.id, existingItemIds),
    title: createCopyTitle(item.title),
  };
}

function createCopyId(sourceId: string, existingItemIds: string[]) {
  const existing = new Set(existingItemIds);
  const baseId = `${sourceId}-copy`;
  let candidate = baseId;
  let index = 2;

  while (existing.has(candidate)) {
    candidate = `${baseId}-${index}`;
    index += 1;
  }

  return candidate;
}

function normalizeItemColorTag(item: TimelineItem): TimelineItem {
  if (item.colorTagId === null || item.tagIds.includes(item.colorTagId)) {
    return item;
  }

  return { ...item, colorTagId: null };
}

function reorderByIds<T extends { id: string; order: number }>(
  values: T[],
  orderedIds: string[],
): T[] {
  const valuesById = new Map(values.map((value) => [value.id, value]));
  const ordered = orderedIds.flatMap((id) => {
    const value = valuesById.get(id);
    return value ? [value] : [];
  });
  const remaining = values.filter((value) => !orderedIds.includes(value.id));

  return [...ordered, ...remaining].map((value, order) => ({
    ...value,
    order,
  }));
}

function createCopyTitle(sourceTitle: string) {
  return `${sourceTitle} のコピー`;
}
