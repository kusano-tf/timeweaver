import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";

export function TagFilters() {
  const { document } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const visible = new Set(document.view.visibleTagIds);

  return (
    <section className="panelSection">
      <h2>タグ</h2>
      <div className="tagList">
        {document.tags.map((tag) => (
          <button
            type="button"
            key={tag.id}
            className={visible.has(tag.id) ? "tagButton selected" : "tagButton"}
            onClick={() => dispatch({ type: "toggleTag", tagId: tag.id })}
          >
            <span className="tagSwatch" style={{ background: tag.color }} />
            {tag.name}
          </button>
        ))}
      </div>
    </section>
  );
}
