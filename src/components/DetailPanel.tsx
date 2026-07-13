import { secondsBetween } from "../domain/datetime";
import { getItemEnd, getItemStart } from "../domain/items";
import type { Dependency, TimelineItem } from "../domain/types";
import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";

export function DetailPanel() {
  const { document, selectedItemId } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const selected =
    document.items.find((item) => item.id === selectedItemId) ?? null;

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
        <button
          type="button"
          className="danger"
          onClick={() => dispatch({ type: "deleteItem", itemId: selected.id })}
        >
          削除
        </button>
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
          {document.lanes.map((lane) => (
            <option key={lane.id} value={lane.id}>
              {lane.name}
            </option>
          ))}
        </select>
      </label>

      {selected.type === "duration" ? (
        <>
          <label>
            開始
            <input
              value={selected.start}
              onChange={(event) =>
                updateItem({ ...selected, start: event.target.value })
              }
            />
          </label>
          <label>
            終了
            <input
              value={selected.end}
              onChange={(event) =>
                updateItem({ ...selected, end: event.target.value })
              }
            />
          </label>
        </>
      ) : (
        <label>
          日時
          <input
            value={selected.at}
            onChange={(event) =>
              updateItem({ ...selected, at: event.target.value })
            }
          />
        </label>
      )}

      <label>
        アイテム色
        <input
          value={selected.color ?? ""}
          placeholder="#2563eb"
          onChange={(event) =>
            updateItem({ ...selected, color: event.target.value || null })
          }
        />
      </label>

      <section className="fieldGroup">
        <h3>タグ</h3>
        {document.tags.map((tag) => (
          <label className="checkboxLabel" key={tag.id}>
            <input
              type="checkbox"
              checked={selected.tagIds.includes(tag.id)}
              onChange={(event) => {
                const tagIds = event.target.checked
                  ? [...selected.tagIds, tag.id]
                  : selected.tagIds.filter((tagId) => tagId !== tag.id);
                updateItem({ ...selected, tagIds });
              }}
            />
            <span className="tagSwatch" style={{ background: tag.color }} />
            {tag.name}
          </label>
        ))}
      </section>

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
      <code>{dependency.lagSeconds}s</code>
      <button
        type="button"
        onClick={() =>
          dispatch({ type: "deleteDependency", dependencyId: dependency.id })
        }
      >
        外す
      </button>
    </div>
  );
}
