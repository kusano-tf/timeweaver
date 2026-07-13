import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";

const defaultTagColor = "#2563eb";

export function TagFilters() {
  const { document } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const visible = new Set(document.view.visibleTagIds);

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
      },
    });
  }

  function addLane(formData: FormData) {
    const name = String(formData.get("laneName") ?? "").trim();
    if (!name) {
      return;
    }

    const nextOrder =
      Math.max(-1, ...document.lanes.map((lane) => lane.order)) + 1;

    dispatch({
      type: "addLane",
      lane: {
        id: createId(
          "lane",
          name,
          document.lanes.map((lane) => lane.id),
        ),
        name,
        order: nextOrder,
      },
    });
  }

  return (
    <>
      <section className="panelSection">
        <h2>タグ</h2>
        <div className="tagList">
          {document.tags.map((tag) => (
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
        <div className="managementList">
          {document.tags.map((tag) => (
            <div className="managementRow" key={tag.id}>
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
          ))}
        </div>
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
        <div className="managementList">
          {[...document.lanes]
            .sort((a, b) => a.order - b.order)
            .map((lane) => {
              const itemCount = document.items.filter(
                (item) => item.laneId === lane.id,
              ).length;
              return (
                <div className="managementRow" key={lane.id}>
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
                    onClick={() =>
                      dispatch({ type: "deleteLane", laneId: lane.id })
                    }
                  >
                    削除
                  </button>
                </div>
              );
            })}
        </div>
      </section>
    </>
  );
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
