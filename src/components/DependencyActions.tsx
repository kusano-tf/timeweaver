import { Pencil, Unlink } from "lucide-react";
import { useState } from "react";

import type { Dependency, TimelineGranularity } from "../domain/types";
import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";

export function DependencyActions({
  dependency,
  selectOnEdit = false,
}: {
  dependency: Dependency;
  selectOnEdit?: boolean;
}) {
  const { document } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const [draft, setDraft] = useState<string | null>(null);
  const from = document.items.find((item) => item.id === dependency.fromId);
  const to = document.items.find((item) => item.id === dependency.toId);

  function openEditor() {
    if (selectOnEdit) {
      dispatch({ type: "selectDependency", dependencyId: dependency.id });
    }
    setDraft(String(dependency.lag));
  }

  return (
    <>
      <button
        type="button"
        className="iconButton compactIconButton"
        aria-label="時間差を編集"
        title="時間差を編集"
        onClick={(event) => {
          event.stopPropagation();
          openEditor();
        }}
      >
        <Pencil aria-hidden="true" size={14} />
      </button>
      <button
        type="button"
        className="danger iconButton compactIconButton"
        aria-label="依存関係を削除"
        title="依存関係を削除"
        onClick={(event) => {
          event.stopPropagation();
          dispatch({ type: "deleteDependency", dependencyId: dependency.id });
        }}
      >
        <Unlink aria-hidden="true" size={14} />
      </button>
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

function granularityLabel(granularity: TimelineGranularity) {
  return { year: "年", month: "か月", day: "日", hour: "時間" }[granularity];
}
