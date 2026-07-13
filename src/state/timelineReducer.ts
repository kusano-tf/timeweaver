import { secondsBetween } from "../domain/datetime";
import {
  detectDependencyCycles,
  propagateMove,
  recalculateIncomingLagSeconds,
} from "../domain/dependencies";
import { moveItemBySeconds } from "../domain/items";
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
  | { type: "setScale"; scale: TimelineScale }
  | { type: "toggleTag"; tagId: string }
  | { type: "updateItem"; item: TimelineItem }
  | { type: "moveItem"; itemId: string; deltaSeconds: number; laneId?: string }
  | { type: "addItem"; item: TimelineItem }
  | { type: "deleteItem"; itemId: string }
  | { type: "addDependency"; dependency: Dependency }
  | { type: "deleteDependency"; dependencyId: string }
  | { type: "addTag"; tag: Tag }
  | { type: "deleteTag"; tagId: string }
  | { type: "addLane"; lane: Lane }
  | { type: "deleteLane"; laneId: string }
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
      const document = {
        ...state.document,
        items: state.document.items.map((item) =>
          item.id === action.item.id ? action.item : item,
        ),
      };

      return {
        ...state,
        dirty: true,
        document: recalculateIncomingLagSeconds(document, action.item.id),
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
          })),
          view: {
            ...state.document.view,
            visibleTagIds: state.document.view.visibleTagIds.filter(
              (tagId) => tagId !== action.tagId,
            ),
          },
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
