import { Copy, Plus, Trash2, Unlink, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  compareDateTime,
  fromDateTimeLocalMinute,
  secondsBetween,
  toDateTimeLocalMinute,
} from "../domain/datetime";
import { getItemColor } from "../domain/filtering";
import { getItemEnd, getItemStart } from "../domain/items";
import type {
  DateTimeString,
  Dependency,
  Tag,
  TimelineItem,
} from "../domain/types";
import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";

export function DetailPanel() {
  const { document, selectedItemId } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const selected =
    document.items.find((item) => item.id === selectedItemId) ?? null;
  const sortedLanes = sortByOrder(document.lanes);
  const sortedTags = sortByOrder(document.tags);
  const tagsById = new Map(document.tags.map((tag) => [tag.id, tag]));

  if (!selected) {
    return (
      <aside className="detailPanel">
        <h2>詳細</h2>
        <p className="muted">アイテムを選択してください。</p>
      </aside>
    );
  }

  function updateItem(next: TimelineItem) {
    dispatch({ type: "updateItem", item: next });
  }

  const incomingDependencies = document.dependencies.filter(
    (dependency) => dependency.toId === selected.id,
  );

  return (
    <aside className="detailPanel">
      <div className="detailHeader">
        <h2>詳細</h2>
        <div className="detailActions">
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
              onChange={(start) => {
                if (compareDateTime(start, selected.end) < 0) {
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
              onChange={(end) => {
                if (compareDateTime(selected.start, end) < 0) {
                  updateItem({ ...selected, end });
                  return true;
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
            onChange={(at) => {
              updateItem({ ...selected, at });
              return true;
            }}
          />
        </label>
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
  onChange,
}: {
  id: string;
  value: DateTimeString;
  onChange: (value: DateTimeString) => boolean;
}) {
  const [inputValue, setInputValue] = useState(toDateTimeLocalMinute(value));

  useEffect(() => {
    setInputValue(toDateTimeLocalMinute(value));
  }, [value]);

  function reset() {
    setInputValue(toDateTimeLocalMinute(value));
  }

  return (
    <input
      id={id}
      type="datetime-local"
      step={60}
      value={inputValue}
      onBlur={() => {
        const next = fromDateTimeLocalMinute(inputValue);
        if (!next || (next !== value && !onChange(next))) {
          reset();
        }
      }}
      onChange={(event) => {
        const nextInputValue = event.target.value;
        setInputValue(nextInputValue);

        const next = fromDateTimeLocalMinute(nextInputValue);
        if (next) {
          onChange(next);
        }
      }}
    />
  );
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
          lagSeconds: secondsBetween(getItemEnd(from), getItemStart(selected)),
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
  const { document } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const from = document.items.find((item) => item.id === dependency.fromId);

  return (
    <div className="dependencyRow">
      <span>{from?.title ?? dependency.fromId}</span>
      <code title={`${dependency.lagSeconds}s`}>
        {formatLagSeconds(dependency.lagSeconds)}
      </code>
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
  );
}

function formatLagSeconds(totalSeconds: number) {
  if (totalSeconds === 0) {
    return "0h";
  }

  const sign = totalSeconds < 0 ? "-" : "";
  let remaining = Math.abs(totalSeconds);
  const days = Math.floor(remaining / 86_400);
  remaining %= 86_400;
  const hours = Math.floor(remaining / 3_600);
  remaining %= 3_600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 && days === 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0 && days === 0 && hours === 0) {
    parts.push(`${seconds}s`);
  }

  return `${sign}${parts.join(" ")}`;
}

function sortByOrder<T extends { order: number }>(values: T[]): T[] {
  return values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value.order - b.value.order || a.index - b.index)
    .map(({ value }) => value);
}
