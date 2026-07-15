import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { Lane, Tag } from "../domain/types";
import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";

const defaultTagColor = "#2563eb";

export function TagFilters() {
  const { document } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const visible = new Set(document.view.visibleTagIds);
  const sortedTags = sortByOrder(document.tags);
  const sortedLanes = sortByOrder(document.lanes);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function addTag(formData: FormData) {
    const name = String(formData.get("tagName") ?? "").trim();
    const color = String(formData.get("tagColor") ?? defaultTagColor);
    if (!name) {
      return;
    }

    dispatch({
      type: "addTag",
      tag: {
        id: createId(
          "tag",
          name,
          document.tags.map((tag) => tag.id),
        ),
        name,
        color,
        order: nextOrder(document.tags),
      },
    });
  }

  function addLane(formData: FormData) {
    const name = String(formData.get("laneName") ?? "").trim();
    if (!name) {
      return;
    }

    dispatch({
      type: "addLane",
      lane: {
        id: createId(
          "lane",
          name,
          document.lanes.map((lane) => lane.id),
        ),
        name,
        order: nextOrder(document.lanes),
      },
    });
  }

  function reorderTags(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) {
      return;
    }

    const oldIndex = sortedTags.findIndex((tag) => tag.id === activeId);
    const newIndex = sortedTags.findIndex((tag) => tag.id === overId);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    dispatch({
      type: "reorderTags",
      tagIds: arrayMove(sortedTags, oldIndex, newIndex).map((tag) => tag.id),
    });
  }

  function reorderLanes(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) {
      return;
    }

    const oldIndex = sortedLanes.findIndex((lane) => lane.id === activeId);
    const newIndex = sortedLanes.findIndex((lane) => lane.id === overId);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    dispatch({
      type: "reorderLanes",
      laneIds: arrayMove(sortedLanes, oldIndex, newIndex).map(
        (lane) => lane.id,
      ),
    });
  }

  return (
    <>
      <section className="panelSection">
        <h2>タグ</h2>
        <div className="tagList">
          {sortedTags.map((tag) => (
            <button
              type="button"
              key={tag.id}
              className={
                visible.has(tag.id) ? "tagButton selected" : "tagButton"
              }
              onClick={() => dispatch({ type: "toggleTag", tagId: tag.id })}
            >
              <span className="tagSwatch" style={{ background: tag.color }} />
              {tag.name}
            </button>
          ))}
        </div>
      </section>

      <section className="panelSection">
        <h2>タグ管理</h2>
        <form
          className="inlineForm"
          action={(formData) => {
            addTag(formData);
          }}
        >
          <input name="tagName" placeholder="タグ名" />
          <input
            aria-label="タグ色"
            className="colorInput"
            name="tagColor"
            type="color"
            defaultValue={defaultTagColor}
          />
          <button type="submit">追加</button>
        </form>
        <DndContext
          collisionDetection={closestCenter}
          sensors={sensors}
          onDragEnd={reorderTags}
        >
          <SortableContext
            items={sortedTags.map((tag) => tag.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="managementList">
              {sortedTags.map((tag) => (
                <SortableTagRow key={tag.id} tag={tag} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </section>

      <section className="panelSection">
        <h2>レーン管理</h2>
        <form
          className="inlineForm"
          action={(formData) => {
            addLane(formData);
          }}
        >
          <input name="laneName" placeholder="レーン名" />
          <button type="submit">追加</button>
        </form>
        <DndContext
          collisionDetection={closestCenter}
          sensors={sensors}
          onDragEnd={reorderLanes}
        >
          <SortableContext
            items={sortedLanes.map((lane) => lane.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="managementList">
              {sortedLanes.map((lane) => {
                const itemCount = document.items.filter(
                  (item) => item.laneId === lane.id,
                ).length;
                return (
                  <SortableLaneRow
                    itemCount={itemCount}
                    key={lane.id}
                    lane={lane}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </section>
    </>
  );
}

function SortableTagRow({ tag }: { tag: Tag }) {
  const dispatch = useTimelineDispatch();
  const sortable = useSortable({ id: tag.id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <div
      className={
        sortable.isDragging
          ? "managementRow sortableRow dragging"
          : "managementRow sortableRow"
      }
      ref={sortable.setNodeRef}
      style={style}
    >
      <button
        type="button"
        className="dragHandle"
        aria-label={`${tag.name} を並べ替え`}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        ⋮⋮
      </button>
      <span className="tagSwatch" style={{ background: tag.color }} />
      <span>{tag.name}</span>
      <button
        type="button"
        className="danger compactButton"
        onClick={() => dispatch({ type: "deleteTag", tagId: tag.id })}
      >
        削除
      </button>
    </div>
  );
}

function SortableLaneRow({
  lane,
  itemCount,
}: {
  lane: Lane;
  itemCount: number;
}) {
  const dispatch = useTimelineDispatch();
  const sortable = useSortable({ id: lane.id });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  return (
    <div
      className={
        sortable.isDragging
          ? "managementRow sortableRow dragging"
          : "managementRow sortableRow"
      }
      ref={sortable.setNodeRef}
      style={style}
    >
      <button
        type="button"
        className="dragHandle"
        aria-label={`${lane.name} を並べ替え`}
        {...sortable.attributes}
        {...sortable.listeners}
      >
        ⋮⋮
      </button>
      <span>{lane.name}</span>
      <span className="muted">{itemCount}件</span>
      <button
        type="button"
        className="danger compactButton"
        disabled={itemCount > 0}
        title={
          itemCount > 0
            ? "アイテムが配置されているレーンは削除できません"
            : "レーンを削除"
        }
        onClick={() => dispatch({ type: "deleteLane", laneId: lane.id })}
      >
        削除
      </button>
    </div>
  );
}

function sortByOrder<T extends { order: number }>(values: T[]): T[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value.order - b.value.order || a.index - b.index)
    .map(({ value }) => value);
}

function nextOrder(values: { order: number }[]) {
  return Math.max(-1, ...values.map((value) => value.order)) + 1;
}

function createId(prefix: string, name: string, existingIds: string[]) {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const baseId = `${prefix}-${normalized || Date.now().toString(36)}`;
  const existing = new Set(existingIds);
  let candidate = baseId;
  let index = 2;

  while (existing.has(candidate)) {
    candidate = `${baseId}-${index}`;
    index += 1;
  }

  return candidate;
}
