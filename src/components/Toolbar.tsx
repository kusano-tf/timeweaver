import {
  Bug,
  BugOff,
  Copy,
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
  getThemeTokens,
  type TimelineThemeDefinition,
  timelineThemeEntries,
  timelineThemeLabels,
  timelineThemes,
} from "../domain/theme";
import {
  parseTimelineThemeDocument,
  themeSchemaVersion,
} from "../domain/themeSchema";
import type { TimelineDocument } from "../domain/types";
import { useDebugEnabled } from "../state/DebugContext";
import { type StoredTheme, useTheme } from "../state/ThemeContext";
import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";

export function Toolbar() {
  const { document: timelineDocument, dirty } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const {
    theme,
    preset: activePreset,
    custom: activeThemeIsCustom,
    previewTheme,
    commitPreview,
    discardPreview,
    importTheme,
  } = useTheme();
  const { enabled: debugEnabled, setEnabled: setDebugEnabled } =
    useDebugEnabled();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [themeDialogOpen, setThemeDialogOpen] = useState(false);
  const [mermaidDialogOpen, setMermaidDialogOpen] = useState(false);
  const [mermaidCopyStatus, setMermaidCopyStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [themeDraft, setThemeDraft] = useState<StoredTheme | null>(null);
  const [themeHexValues, setThemeHexValues] = useState<Record<
    keyof TimelineThemeDefinition,
    string
  > | null>(null);
  const [themeImportIssues, setThemeImportIssues] = useState<string[]>([]);
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
        closeThemeDialog();
        closeMermaidDialog();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  });

  useEffect(() => {
    if (mermaidCopyStatus === "idle") {
      return;
    }

    const timer = window.setTimeout(() => setMermaidCopyStatus("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [mermaidCopyStatus]);

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

  async function handleThemeImport(file: File) {
    const text = await file.text();
    try {
      const json = JSON.parse(text);
      const result = parseTimelineThemeDocument(json);
      if (!result.ok) {
        setThemeImportIssues(
          result.issues.map((issue) => `${issue.path}: ${issue.message}`),
        );
        openThemeDialog();
        return;
      }

      importTheme(result.document.tokens);
      setThemeImportIssues([]);
      setExportMenuOpen(false);
    } catch (error) {
      setThemeImportIssues([
        error instanceof Error
          ? error.message
          : "テーマ JSON の解析に失敗しました。",
      ]);
      openThemeDialog();
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
    exportTimelinePng(timelineDocument.timeline.title, theme);
    setExportMenuOpen(false);
  }

  function handleExportSvg() {
    exportTimelineSvg(timelineDocument.timeline.title, theme);
    setExportMenuOpen(false);
  }

  function openMermaidDialog() {
    setMermaidCopyStatus("idle");
    setMermaidDialogOpen(true);
    setExportMenuOpen(false);
  }

  function closeMermaidDialog() {
    setMermaidDialogOpen(false);
    setMermaidCopyStatus("idle");
  }

  function downloadMermaid() {
    downloadText(
      `${timelineDocument.timeline.title || "timeweaver"}.mmd`,
      createMermaidGantt(timelineDocument),
      "text/plain;charset=utf-8",
    );
  }

  async function copyMermaid() {
    try {
      await navigator.clipboard.writeText(createMermaidGantt(timelineDocument));
      setMermaidCopyStatus("success");
    } catch {
      setMermaidCopyStatus("error");
    }
  }

  function openThemeDialog() {
    setThemeDraft({
      preset: activePreset,
      tokens: getThemeTokens(theme),
      custom: activeThemeIsCustom,
    });
    setThemeHexValues(getThemeTokens(theme));
    setThemeDialogOpen(true);
    setExportMenuOpen(false);
  }

  function closeThemeDialog() {
    discardPreview();
    setThemeDraft(null);
    setThemeHexValues(null);
    setThemeDialogOpen(false);
  }

  function previewDraft(next: StoredTheme) {
    setThemeDraft(next);
    setThemeHexValues(next.tokens);
    previewTheme(next);
  }

  function selectThemePreset(preset: StoredTheme["preset"]) {
    previewDraft({
      preset,
      tokens: getThemeTokens(timelineThemes[preset]),
      custom: false,
    });
  }

  function resetThemeToken(key: keyof TimelineThemeDefinition) {
    if (!themeDraft) {
      return;
    }
    previewDraft({
      ...themeDraft,
      tokens: {
        ...themeDraft.tokens,
        [key]: getThemeTokens(timelineThemes[themeDraft.preset])[key],
      },
      custom: true,
    });
  }

  function resetTheme() {
    if (!themeDraft) {
      return;
    }
    selectThemePreset(themeDraft.preset);
  }

  function saveThemeEdit() {
    if (
      !themeHexValues ||
      !Object.values(themeHexValues).every((value) =>
        /^#[0-9a-fA-F]{6}$/.test(value),
      )
    ) {
      return;
    }
    commitPreview();
    setThemeDraft(null);
    setThemeHexValues(null);
    setThemeDialogOpen(false);
  }

  function exportTheme() {
    downloadText(
      "timeweaver-theme.json",
      JSON.stringify(
        {
          schemaVersion: themeSchemaVersion,
          tokens: getThemeTokens(theme),
        },
        null,
        2,
      ),
      "application/json",
    );
    setExportMenuOpen(false);
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
              <button type="button" role="menuitem" onClick={openMermaidDialog}>
                <Download aria-hidden="true" size={16} />
                Mermaid出力
              </button>
              <button type="button" role="menuitem" onClick={openThemeDialog}>
                <Palette aria-hidden="true" size={16} />
                テーマ設定
              </button>
              <label className="toolbarMenuFile">
                <Upload aria-hidden="true" size={16} />
                テーマを読み込む
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) {
                      void handleThemeImport(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <button type="button" role="menuitem" onClick={exportTheme}>
                <Download aria-hidden="true" size={16} />
                テーマを保存
              </button>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={debugEnabled}
                onClick={() => {
                  setDebugEnabled(!debugEnabled);
                  setExportMenuOpen(false);
                }}
              >
                {debugEnabled ? (
                  <BugOff aria-hidden="true" size={16} />
                ) : (
                  <Bug aria-hidden="true" size={16} />
                )}
                {debugEnabled ? "デバッグ情報を非表示" : "デバッグ情報を表示"}
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
                onClick={closeThemeDialog}
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
                      themeDraft?.preset === preset && !themeDraft.custom
                        ? "themePresetButton active"
                        : "themePresetButton"
                    }
                    onClick={() => selectThemePreset(preset)}
                  >
                    {timelineThemeLabels[preset]}
                  </button>
                ))}
              </div>
            </section>
            <section className="themeDialogSection">
              <div className="themeSectionHeading">
                <h3>タイムライン</h3>
                <button type="button" onClick={resetTheme}>
                  プリセットへ戻す
                </button>
              </div>
              {themeImportIssues.length > 0 && (
                <div className="themeImportError" role="alert">
                  <strong>テーマを読み込めませんでした</strong>
                  <ul>
                    {themeImportIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              <dl className="themeTokenList">
                {timelineThemeEntries.map((entry) => {
                  const value =
                    themeHexValues?.[entry.key] ??
                    themeDraft?.tokens[entry.key] ??
                    theme[entry.key];
                  return (
                    <div key={entry.key} className="themeTokenRow">
                      <dt>{entry.label}</dt>
                      <dd>
                        <input
                          aria-label={`${entry.label}の色`}
                          type="color"
                          value={value}
                          onChange={(event) => {
                            if (!themeDraft) {
                              return;
                            }
                            previewDraft({
                              ...themeDraft,
                              tokens: {
                                ...themeDraft.tokens,
                                [entry.key]: event.target.value,
                              },
                              custom: true,
                            });
                          }}
                        />
                        <input
                          aria-label={`${entry.label}のHEX値`}
                          className="themeHexInput"
                          value={value}
                          onChange={(event) => {
                            if (!themeDraft) {
                              return;
                            }
                            const next = event.target.value;
                            setThemeHexValues((current) => ({
                              ...(current ?? themeDraft.tokens),
                              [entry.key]: next,
                            }));
                            if (!/^#[0-9a-fA-F]{6}$/.test(next)) {
                              return;
                            }
                            previewDraft({
                              ...themeDraft,
                              tokens: {
                                ...themeDraft.tokens,
                                [entry.key]: next,
                              },
                              custom: true,
                            });
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => resetThemeToken(entry.key)}
                        >
                          戻す
                        </button>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
            <div className="themeDialogActions">
              <button type="button" onClick={closeThemeDialog}>
                キャンセル
              </button>
              <button
                type="button"
                className="primary"
                disabled={
                  !themeHexValues ||
                  !Object.values(themeHexValues).every((value) =>
                    /^#[0-9a-fA-F]{6}$/.test(value),
                  )
                }
                onClick={saveThemeEdit}
              >
                保存
              </button>
            </div>
          </section>
        </div>
      )}
      {mermaidDialogOpen && (
        <div className="modalBackdrop" role="presentation">
          <button
            type="button"
            className="modalDismissButton"
            aria-label="Mermaid出力を閉じる"
            onClick={closeMermaidDialog}
          />
          <section
            className="mermaidDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mermaid-dialog-title"
          >
            <div className="themeDialogHeader">
              <h2 id="mermaid-dialog-title">Mermaid出力</h2>
              <button
                type="button"
                className="iconButton"
                aria-label="Mermaid出力を閉じる"
                title="閉じる"
                onClick={closeMermaidDialog}
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
            <textarea
              className="mermaidDefinition"
              aria-label="Mermaid定義"
              readOnly
              spellCheck={false}
              value={createMermaidGantt(timelineDocument)}
              wrap="off"
            />
            <div className="mermaidDialogActions">
              <span aria-live="polite" className="mermaidCopyStatus">
                {mermaidCopyStatus === "success" && "コピーしました"}
                {mermaidCopyStatus === "error" && "コピーに失敗しました"}
              </span>
              <button type="button" onClick={downloadMermaid}>
                <Download aria-hidden="true" size={16} />
                .mmdをダウンロード
              </button>
              <button type="button" className="primary" onClick={copyMermaid}>
                <Copy aria-hidden="true" size={16} />
                コピー
              </button>
            </div>
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

function exportTimelinePng(
  title: string,
  theme: import("../domain/theme").TimelineTheme,
) {
  const serializedSvg = serializeTimelineSvg(theme);
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
    context.fillStyle = theme.timelineBackground;
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

function exportTimelineSvg(
  title: string,
  theme: import("../domain/theme").TimelineTheme,
) {
  const serializedSvg = serializeTimelineSvg(theme);
  if (!serializedSvg) {
    return;
  }

  downloadText(
    `${title || "timeweaver"}.svg`,
    serializedSvg.svg,
    "image/svg+xml;charset=utf-8",
  );
}

function serializeTimelineSvg(theme: import("../domain/theme").TimelineTheme) {
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
  clearExportSelectionState(clone, theme);
  embedTimelineSvgStyles(clone, theme);

  return {
    svg: new XMLSerializer().serializeToString(clone),
    width,
    height,
  };
}

function clearExportSelectionState(
  svg: SVGSVGElement,
  theme: import("../domain/theme").TimelineTheme,
) {
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

function embedTimelineSvgStyles(
  svg: SVGSVGElement,
  theme: import("../domain/theme").TimelineTheme,
) {
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
