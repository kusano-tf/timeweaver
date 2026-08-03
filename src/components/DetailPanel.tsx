import {
  Copy,
  PanelRightClose,
  Pencil,
  Plus,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  compareDateTime,
  fromGranularityInput,
  timelineUnitsBetween,
  toGranularityInput,
} from "../domain/datetime";
import { getItemColor } from "../domain/filtering";
import { getItemEnd, getItemStart } from "../domain/items";
import type {
  DateTimeString,
  Dependency,
  Tag,
  TimelineGranularity,
  TimelineItem,
} from "../domain/types";
import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";
import { PropagationPrompt } from "./PropagationPrompt";

export function DetailPanel({ onClose }: { onClose: () => void }) {
  const { document, selectedItemId } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const selected =
    document.items.find((item) => item.id === selectedItemId) ?? null;
  const sortedLanes = sortByOrder(document.lanes);
  const sortedTags = sortByOrder(document.tags);
  const tagsById = new Map(document.tags.map((tag) => [tag.id, tag]));
  const [pendingItemUpdate, setPendingItemUpdate] = useState<{
    item: TimelineItem;
    descendantCount: number;
  } | null>(null);

  useEffect(() => {
    if (!pendingItemUpdate) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPendingItemUpdate(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingItemUpdate]);

  if (!selected) {
    return (
      <aside className="detailPanel">
        <div className="detailHeader">
          <h2>詳細</h2>
          <button
            type="button"
            className="iconButton"
            aria-label="詳細を隠す"
            title="詳細を隠す"
            onClick={onClose}
          >
            <PanelRightClose aria-hidden="true" size={16} />
          </button>
        </div>
        <p className="muted">アイテムを選択してください。</p>
      </aside>
    );
  }

  function updateItem(next: TimelineItem, propagate?: boolean) {
    dispatch({ type: "updateItem", item: next, propagate });
  }

  const incomingDependencies = document.dependencies.filter(
    (dependency) => dependency.toId === selected.id,
  );
  const descendantCount = countDescendants(selected.id, document.dependencies);
  const activePendingItemUpdate =
    pendingItemUpdate?.item.id === selected.id ? pendingItemUpdate : null;

  function requestOutputChange(next: TimelineItem) {
    if (descendantCount === 0) {
      updateItem(next);
      return true;
    }
    setPendingItemUpdate({ item: next, descendantCount });
    return false;
  }

  return (
    <aside className="detailPanel">
      <div className="detailHeader">
        <h2>詳細</h2>
        <div className="detailActions">
          <button
            type="button"
            className="iconButton"
            aria-label="詳細を隠す"
            title="詳細を隠す"
            onClick={onClose}
          >
            <PanelRightClose aria-hidden="true" size={16} />
          </button>
          <button
            type="button"
            className="iconButton"
            aria-label="コピー"
            title="コピー"
            onClick={() => dispatch({ type: "copyItem", itemId: selected.id })}
          >
            <Copy aria-hidden="true" size={16} />
          </button>
          <button
            type="button"
            className="danger iconButton"
            aria-label="削除"
            title="削除"
            onClick={() =>
              dispatch({ type: "deleteItem", itemId: selected.id })
            }
          >
            <Trash2 aria-hidden="true" size={16} />
          </button>
        </div>
      </div>

      <label>
        タイトル
        <input
          value={selected.title}
          onChange={(event) =>
            updateItem({ ...selected, title: event.target.value })
          }
        />
      </label>

      <label>
        説明
        <textarea
          value={selected.description ?? ""}
          onChange={(event) =>
            updateItem({ ...selected, description: event.target.value })
          }
        />
      </label>

      <label>
        レーン
        <select
          value={selected.laneId}
          onChange={(event) =>
            updateItem({ ...selected, laneId: event.target.value })
          }
        >
          {sortedLanes.map((lane) => (
            <option key={lane.id} value={lane.id}>
              {lane.name}
            </option>
          ))}
        </select>
      </label>

      {selected.type === "duration" ? (
        <>
          <label htmlFor={`${selected.id}-start`}>
            開始
            <DateTimeInput
              id={`${selected.id}-start`}
              key={`${selected.id}-start`}
              value={selected.start}
              granularity={document.timeline.granularity}
              onCommit={(start) => {
                if (compareDateTime(start, selected.end) <= 0) {
                  updateItem({ ...selected, start });
                  return true;
                }
                return false;
              }}
            />
          </label>
          <label htmlFor={`${selected.id}-end`}>
            終了
            <DateTimeInput
              id={`${selected.id}-end`}
              key={`${selected.id}-end`}
              value={selected.end}
              granularity={document.timeline.granularity}
              onCommit={(end) => {
                if (compareDateTime(selected.start, end) <= 0) {
                  return requestOutputChange({ ...selected, end });
                }
                return false;
              }}
            />
          </label>
        </>
      ) : (
        <label htmlFor={`${selected.id}-at`}>
          日時
          <DateTimeInput
            id={`${selected.id}-at`}
            key={`${selected.id}-at`}
            value={selected.at}
            granularity={document.timeline.granularity}
            onCommit={(at) => requestOutputChange({ ...selected, at })}
          />
        </label>
      )}

      {activePendingItemUpdate && (
        <PropagationPrompt
          descendantCount={activePendingItemUpdate.descendantCount}
          onPropagate={() => {
            updateItem(activePendingItemUpdate.item, true);
            setPendingItemUpdate(null);
          }}
          onKeepLocal={() => {
            updateItem(activePendingItemUpdate.item, false);
            setPendingItemUpdate(null);
          }}
          onCancel={() => setPendingItemUpdate(null)}
        />
      )}

      <ColorControls
        selected={selected}
        sortedTags={sortedTags}
        tagsById={tagsById}
        updateItem={updateItem}
      />

      <TagPicker
        selected={selected}
        sortedTags={sortedTags}
        updateItem={updateItem}
      />

      <section className="fieldGroup">
        <h3>先行依存</h3>
        <AddDependencyForm selected={selected} />
        {incomingDependencies.length === 0 ? (
          <p className="muted">先行依存はありません。</p>
        ) : (
          incomingDependencies.map((dependency) => (
            <DependencyRow key={dependency.id} dependency={dependency} />
          ))
        )}
      </section>
    </aside>
  );
}

function TagPicker({
  selected,
  sortedTags,
  updateItem,
}: {
  selected: TimelineItem;
  sortedTags: Tag[];
  updateItem: (next: TimelineItem) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedTags = sortedTags.filter((tag) =>
    selected.tagIds.includes(tag.id),
  );
  const candidateTags = sortedTags.filter(
    (tag) =>
      !selected.tagIds.includes(tag.id) &&
      tag.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function addTag(tagId: string) {
    updateItem({ ...selected, tagIds: [...selected.tagIds, tagId] });
    setQuery("");
  }

  function removeTag(tagId: string) {
    updateItem({
      ...selected,
      tagIds: selected.tagIds.filter(
        (selectedTagId) => selectedTagId !== tagId,
      ),
      colorTagId: selected.colorTagId === tagId ? null : selected.colorTagId,
    });
  }

  return (
    <section className="fieldGroup">
      <h3>タグ</h3>
      {selectedTags.length > 0 ? (
        <div className="tagPillList">
          {selectedTags.map((tag) => (
            <span className="tagPill removableTagPill" key={tag.id}>
              <span className="tagSwatch" style={{ background: tag.color }} />
              <span>{tag.name}</span>
              <button
                type="button"
                className="tagPillRemove"
                aria-label={`${tag.name} を外す`}
                title={`${tag.name} を外す`}
                onClick={() => removeTag(tag.id)}
              >
                <X aria-hidden="true" size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="muted compactMuted">タグは未設定です。</p>
      )}

      <label>
        タグを追加
        <input
          type="search"
          value={query}
          placeholder="タグを検索"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className="tagCandidateList">
        {candidateTags.length > 0 ? (
          candidateTags.map((tag) => (
            <button
              type="button"
              className="tagPill tagCandidate"
              key={tag.id}
              onClick={() => addTag(tag.id)}
            >
              <span className="tagSwatch" style={{ background: tag.color }} />
              <span>{tag.name}</span>
              <Plus aria-hidden="true" size={12} />
            </button>
          ))
        ) : (
          <p className="muted compactMuted">追加できるタグはありません。</p>
        )}
      </div>
    </section>
  );
}

function DateTimeInput({
  id,
  value,
  granularity,
  onCommit,
}: {
  id: string;
  value: DateTimeString;
  granularity: TimelineGranularity;
  onCommit: (value: DateTimeString) => boolean;
}) {
  const [inputValue, setInputValue] = useState(
    toGranularityInput(value, granularity),
  );

  useEffect(() => {
    setInputValue(toGranularityInput(value, granularity));
  }, [value, granularity]);

  function reset() {
    setInputValue(toGranularityInput(value, granularity));
  }

  function commit() {
    const next = fromGranularityInput(inputValue, granularity);
    if (!next || (next !== value && !onCommit(next))) {
      reset();
    }
  }

  return (
    <input
      id={id}
      type={
        granularity === "year"
          ? "number"
          : granularity === "month"
            ? "month"
            : granularity === "day"
              ? "date"
              : "datetime-local"
      }
      min={granularity === "year" ? "1" : undefined}
      step={granularity === "hour" ? 3600 : 1}
      value={inputValue}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
      onChange={(event) => {
        setInputValue(event.target.value);
      }}
    />
  );
}

function countDescendants(itemId: string, dependencies: Dependency[]) {
  const outgoing = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const next = outgoing.get(dependency.fromId) ?? [];
    next.push(dependency.toId);
    outgoing.set(dependency.fromId, next);
  }
  const descendants = new Set<string>();
  const queue = [itemId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    for (const next of outgoing.get(current) ?? []) {
      if (!descendants.has(next)) {
        descendants.add(next);
        queue.push(next);
      }
    }
  }
  return descendants.size;
}

function ColorControls({
  selected,
  sortedTags,
  tagsById,
  updateItem,
}: {
  selected: TimelineItem;
  sortedTags: Tag[];
  tagsById: Map<string, Tag>;
  updateItem: (next: TimelineItem) => void;
}) {
  const selectedTags = sortedTags.filter((tag) =>
    selected.tagIds.includes(tag.id),
  );
  const colorMode = selected.color ? "custom" : (selected.colorTagId ?? "");

  return (
    <section className="fieldGroup">
      <h3>色</h3>
      <label>
        色の決め方
        <select
          value={colorMode}
          onChange={(event) => {
            const nextMode = event.target.value;
            if (nextMode === "custom") {
              updateItem({
                ...selected,
                color: selected.color ?? getItemColor(selected, tagsById),
              });
              return;
            }

            updateItem({
              ...selected,
              color: null,
              colorTagId: nextMode || null,
            });
          }}
        >
          <option value="">自動（先頭タグ）</option>
          {selectedTags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              自動（{tag.name}）
            </option>
          ))}
          <option value="custom">カスタム色</option>
        </select>
      </label>
      {selected.color && (
        <label>
          カスタム色
          <input
            type="color"
            value={selected.color}
            onChange={(event) =>
              updateItem({ ...selected, color: event.target.value })
            }
          />
        </label>
      )}
    </section>
  );
}

function AddDependencyForm({ selected }: { selected: TimelineItem }) {
  const { document } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const candidates = document.items.filter((item) => item.id !== selected.id);

  return (
    <select
      value=""
      onChange={(event) => {
        const from = document.items.find(
          (item) => item.id === event.target.value,
        );
        if (!from) {
          return;
        }

        const dependency: Dependency = {
          id: `dep-${Date.now().toString(36)}`,
          fromId: from.id,
          toId: selected.id,
          type: "finish-to-start",
          lag:
            timelineUnitsBetween(
              getItemEnd(from),
              getItemStart(selected),
              document.timeline.granularity,
            ) - 1,
        };
        dispatch({ type: "addDependency", dependency });
        event.currentTarget.value = "";
      }}
    >
      <option value="">先行アイテムを追加</option>
      {candidates.map((item) => (
        <option key={item.id} value={item.id}>
          {item.title}
        </option>
      ))}
    </select>
  );
}

function DependencyRow({ dependency }: { dependency: Dependency }) {
  const { document, selectedDependencyId } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const [draft, setDraft] = useState<string | null>(null);
  const from = document.items.find((item) => item.id === dependency.fromId);
  const to = document.items.find((item) => item.id === dependency.toId);
  const selected = dependency.id === selectedDependencyId;

  return (
    <>
      <div className={`dependencyRow${selected ? " selected" : ""}`}>
        <button
          type="button"
          className={`dependencyRowSelect${selected ? " selected" : ""}`}
          onClick={() =>
            dispatch({
              type: "selectDependency",
              dependencyId: dependency.id,
            })
          }
        >
          {from?.title ?? dependency.fromId}
        </button>
        <code
          title={`${dependency.lag}${granularityLabel(document.timeline.granularity)}`}
        >
          {formatLag(dependency.lag, document.timeline.granularity)}
        </code>
        <button
          type="button"
          className="iconButton compactIconButton"
          aria-label="時間差を編集"
          title="時間差を編集"
          onClick={() => setDraft(String(dependency.lag))}
        >
          <Pencil aria-hidden="true" size={14} />
        </button>
        <button
          type="button"
          className="iconButton compactIconButton"
          aria-label="依存関係を外す"
          title="依存関係を外す"
          onClick={() =>
            dispatch({ type: "deleteDependency", dependencyId: dependency.id })
          }
        >
          <Unlink aria-hidden="true" size={14} />
        </button>
      </div>
      {draft !== null && (
        <div className="modalBackdrop">
          <form
            className="dependencyDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${dependency.id}-dialog-title`}
            onSubmit={(event) => {
              event.preventDefault();
              dispatch({
                type: "updateDependencyLag",
                dependencyId: dependency.id,
                lag: Number.parseInt(draft, 10) || 0,
              });
              setDraft(null);
            }}
          >
            <h3 id={`${dependency.id}-dialog-title`}>先行依存を編集</h3>
            <dl className="dependencyDialogSummary">
              <div>
                <dt>先行</dt>
                <dd>{from?.title ?? dependency.fromId}</dd>
              </div>
              <div>
                <dt>対象</dt>
                <dd>{to?.title ?? dependency.toId}</dd>
              </div>
            </dl>
            <label>
              遅延（{granularityLabel(document.timeline.granularity)}）
              <input
                type="number"
                step={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <div className="dialogActions">
              <button type="button" onClick={() => setDraft(null)}>
                キャンセル
              </button>
              <button type="submit" className="primary">
                適用
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function formatLag(lag: number, granularity: TimelineGranularity) {
  return `${lag}${granularityLabel(granularity)}`;
}

function granularityLabel(granularity: TimelineGranularity) {
  return { year: "年", month: "か月", day: "日", hour: "時間" }[granularity];
}

function sortByOrder<T extends { order: number }>(values: T[]): T[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value.order - b.value.order || a.index - b.index)
    .map(({ value }) => value);
}
