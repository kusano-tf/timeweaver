import { Download, Settings, Upload } from "lucide-react";

import { parseTimelineDocument } from "../domain/schema";
import type { TimelineDocument } from "../domain/types";
import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";

export function Toolbar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { document, dirty } = useTimelineState();
  const dispatch = useTimelineDispatch();

  async function handleImport(file: File) {
    const text = await file.text();
    try {
      const json = JSON.parse(text);
      const result = parseTimelineDocument(json);
      if (!result.ok) {
        dispatch({ type: "setImportIssues", issues: result.issues });
        return;
      }

      dispatch({ type: "replaceDocument", document: result.document });
    } catch (error) {
      dispatch({
        type: "setImportIssues",
        issues: [
          {
            path: "$",
            message:
              error instanceof Error
                ? error.message
                : "JSONの解析に失敗しました。",
          },
        ],
      });
    }
  }

  function exportJson() {
    downloadText(
      `${document.timeline.title || "timeweaver"}.json`,
      JSON.stringify(document satisfies TimelineDocument, null, 2),
      "application/json",
    );
    dispatch({ type: "markExported" });
  }

  return (
    <header className="toolbar">
      <div className="titleBlock">
        <span className="appName">Timeweaver</span>
        <span className={dirty ? "dirty visible" : "dirty"}>
          未エクスポート
        </span>
      </div>
      <div className="toolbarGroup toolbarFileGroup">
        <label
          aria-label="JSON読込"
          className="fileButton iconButton"
          title="JSON読込"
        >
          <Upload aria-hidden="true" size={16} />
          <span className="srOnly">JSON読込</span>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) {
                void handleImport(file);
              }
              event.currentTarget.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className="iconButton"
          aria-label="JSON出力"
          title="JSON出力"
          onClick={exportJson}
        >
          <Download aria-hidden="true" size={16} />
        </button>
        <button
          type="button"
          className="iconButton"
          aria-label="設定"
          title="設定"
          onClick={onOpenSettings}
        >
          <Settings aria-hidden="true" size={16} />
        </button>
      </div>
    </header>
  );
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
