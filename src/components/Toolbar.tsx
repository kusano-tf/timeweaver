import { Download, ImageDown, Upload } from "lucide-react";

import { parseTimelineDocument } from "../domain/schema";
import type { TimelineDocument } from "../domain/types";
import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";

export function Toolbar() {
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
          aria-label="PNG出力"
          title="PNG出力"
          onClick={() => exportTimelinePng(document.timeline.title)}
        >
          <ImageDown aria-hidden="true" size={16} />
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

function exportTimelinePng(title: string) {
  const svg = document.querySelector<SVGSVGElement>(
    "[data-timeline-svg='true']",
  );
  if (!svg) {
    return;
  }

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const serialized = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = svg.viewBox.baseVal.width || svg.clientWidth;
    canvas.height = svg.viewBox.baseVal.height || svg.clientHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(url);
      return;
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);

    canvas.toBlob((pngBlob) => {
      if (!pngBlob) {
        return;
      }
      const pngUrl = URL.createObjectURL(pngBlob);
      const link = document.createElement("a");
      link.href = pngUrl;
      link.download = `${title || "timeweaver"}.png`;
      link.click();
      URL.revokeObjectURL(pngUrl);
    }, "image/png");
  };
  image.src = url;
}
