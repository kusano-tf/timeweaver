import {
  Download,
  ImageDown,
  MoreHorizontal,
  Palette,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { createMermaidGantt } from "../domain/mermaid";
import { parseTimelineDocument } from "../domain/schema";
import {
  timelineThemeEntries,
  timelineThemeLabels,
  timelineThemes,
} from "../domain/theme";
import type { TimelineDocument } from "../domain/types";
import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";

export function Toolbar() {
  const { document: timelineDocument, dirty } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setExportMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExportMenuOpen(false);
        setThemeDialogOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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
      `${timelineDocument.timeline.title || "timeweaver"}.json`,
      JSON.stringify(timelineDocument satisfies TimelineDocument, null, 2),
      "application/json",
    );
    dispatch({ type: "markExported" });
  }

  function handleExportPng() {
    exportTimelinePng(timelineDocument.timeline.title);
    setExportMenuOpen(false);
  }

  function handleExportSvg() {
    exportTimelineSvg(timelineDocument.timeline.title);
    setExportMenuOpen(false);
  }

  function handleExportMermaid() {
    downloadText(
      `${timelineDocument.timeline.title || "timeweaver"}.mmd`,
      createMermaidGantt(timelineDocument),
      "text/plain;charset=utf-8",
    );
    setExportMenuOpen(false);
  }

  function openThemeDialog() {
    setThemeDialogOpen(true);
    setExportMenuOpen(false);
  }

  const theme = timelineThemes[timelineDocument.view.themePreset];

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
        <div className="toolbarMenu" ref={exportMenuRef}>
          <button
            type="button"
            className="iconButton"
            aria-expanded={exportMenuOpen}
            aria-haspopup="menu"
            aria-label="その他の出力"
            title="その他の出力"
            onClick={() => setExportMenuOpen((open) => !open)}
          >
            <MoreHorizontal aria-hidden="true" size={16} />
          </button>
          {exportMenuOpen && (
            <div className="toolbarMenuPanel" role="menu">
              <button type="button" role="menuitem" onClick={handleExportPng}>
                <ImageDown aria-hidden="true" size={16} />
                PNG出力
              </button>
              <button type="button" role="menuitem" onClick={handleExportSvg}>
                <Download aria-hidden="true" size={16} />
                SVG出力
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleExportMermaid}
              >
                <Download aria-hidden="true" size={16} />
                Mermaid出力
              </button>
              <button type="button" role="menuitem" onClick={openThemeDialog}>
                <Palette aria-hidden="true" size={16} />
                テーマ設定
              </button>
            </div>
          )}
        </div>
      </div>
      {themeDialogOpen && (
        <div className="modalBackdrop">
          <section
            className="themeDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="theme-dialog-title"
          >
            <div className="themeDialogHeader">
              <h2 id="theme-dialog-title">テーマ設定</h2>
              <button
                type="button"
                className="iconButton"
                aria-label="テーマ設定を閉じる"
                title="閉じる"
                onClick={() => setThemeDialogOpen(false)}
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
            <section className="themeDialogSection">
              <h3>プリセット</h3>
              <div className="themePresetList">
                {(["light", "dark"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={
                      timelineDocument.view.themePreset === preset
                        ? "themePresetButton active"
                        : "themePresetButton"
                    }
                    onClick={() =>
                      dispatch({ type: "setThemePreset", themePreset: preset })
                    }
                  >
                    {timelineThemeLabels[preset]}
                  </button>
                ))}
              </div>
            </section>
            <section className="themeDialogSection">
              <h3>タイムライン</h3>
              <dl className="themeTokenList">
                {timelineThemeEntries.map((entry) => {
                  const value = theme[entry.key];
                  return (
                    <div key={entry.key} className="themeTokenRow">
                      <dt>{entry.label}</dt>
                      <dd>
                        <span
                          className="themeSwatch"
                          style={{ background: value }}
                        />
                        <code>{value}</code>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          </section>
        </div>
      )}
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
  const serializedSvg = serializeTimelineSvg();
  if (!serializedSvg) {
    return;
  }

  const blob = new Blob([serializedSvg.svg], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = serializedSvg.width;
    canvas.height = serializedSvg.height;
    const context = canvas.getContext("2d");
    if (!context) {
      URL.revokeObjectURL(url);
      return;
    }
    context.fillStyle =
      timelineThemes[timelineDocumentFallbackTheme()].timelineBackground;
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

function exportTimelineSvg(title: string) {
  const serializedSvg = serializeTimelineSvg();
  if (!serializedSvg) {
    return;
  }

  downloadText(
    `${title || "timeweaver"}.svg`,
    serializedSvg.svg,
    "image/svg+xml;charset=utf-8",
  );
}

function serializeTimelineSvg() {
  const svg = document.querySelector<SVGSVGElement>(
    "[data-timeline-svg='true']",
  );
  if (!svg) {
    return null;
  }

  const clone = svg.cloneNode(true) as SVGSVGElement;
  const width = svg.viewBox.baseVal.width || svg.clientWidth;
  const height = svg.viewBox.baseVal.height || svg.clientHeight;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clearExportSelectionState(clone);
  embedTimelineSvgStyles(clone);

  return {
    svg: new XMLSerializer().serializeToString(clone),
    width,
    height,
  };
}

function clearExportSelectionState(svg: SVGSVGElement) {
  const preset = readTimelineThemePreset(svg);
  const theme = timelineThemes[preset];
  svg
    .querySelectorAll<SVGElement>("[data-selected-stroke='true']")
    .forEach((element) => {
      element.setAttribute("stroke", theme.itemStroke);
      element.setAttribute("stroke-width", "2");
      element.removeAttribute("data-selected-stroke");
    });
  svg
    .querySelectorAll<SVGElement>("[data-selected-dependency='true']")
    .forEach((element) => {
      element.setAttribute("stroke", theme.dependencyLine);
      element.setAttribute("stroke-width", "2");
      element.setAttribute("opacity", "0.55");
      element.setAttribute("marker-end", "url(#arrow)");
      element.removeAttribute("data-selected-dependency");
    });
}

function embedTimelineSvgStyles(svg: SVGSVGElement) {
  const theme = timelineThemes[readTimelineThemePreset(svg)];
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `
    .laneLabel { fill: ${theme.laneLabel}; font-size: 14px; font-weight: 700; }
    .tickLabel { fill: ${theme.tickLabel}; font-size: 12px; font-weight: 700; }
    .boundaryTickLabel { fill: ${theme.boundaryTickLabel}; font-size: 12px; font-weight: 800; }
    .itemLabel { fill: ${theme.itemLabel}; font-size: 13px; font-weight: 700; pointer-events: none; }
    .itemLabel.inBar { fill: ${theme.itemLabelOnColor}; }
  `;

  const defs = svg.querySelector("defs");
  if (defs) {
    defs.prepend(style);
    return;
  }

  svg.prepend(style);
}

function readTimelineThemePreset(svg: SVGSVGElement) {
  return svg.dataset.timelineTheme === "dark" ? "dark" : "light";
}

function timelineDocumentFallbackTheme() {
  const svg = document.querySelector<SVGSVGElement>(
    "[data-timeline-svg='true']",
  );
  return svg ? readTimelineThemePreset(svg) : "light";
}
