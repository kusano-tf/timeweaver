import { Settings, X } from "lucide-react";
import { useEffect, useState } from "react";

import { DependencyView } from "./components/DependencyView";
import { DetailPanel } from "./components/DetailPanel";
import { ImportIssues } from "./components/ImportIssues";
import {
  TagFilters,
  TagLaneSettings,
  TimelineMetaSettings,
} from "./components/TagFilters";
import { TimelineControls } from "./components/TimelineControls";
import { TimelineSvg } from "./components/TimelineSvg";
import { Toolbar } from "./components/Toolbar";
import { TimelineProvider, useTimelineState } from "./state/TimelineContext";

export function App() {
  return (
    <TimelineProvider>
      <TimeweaverApp />
    </TimelineProvider>
  );
}

function TimeweaverApp() {
  const { document, dirty } = useTimelineState();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) {
        return;
      }
      event.preventDefault();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <main className="workspace">
        <section className="summaryPanel">
          <section className="panelSection">
            <div className="summaryTitleRow">
              <h1>{document.timeline.title}</h1>
              <button
                type="button"
                className="iconButton compactIconButton"
                aria-label="設定"
                title="設定"
                onClick={() => setSettingsOpen(true)}
              >
                <Settings aria-hidden="true" size={14} />
              </button>
            </div>
            {document.timeline.description ? (
              <p>{document.timeline.description}</p>
            ) : null}
          </section>
          <TagFilters />
          <ImportIssues />
        </section>
        <div className="timelineWorkspace">
          <section className="timelineColumn">
            <TimelineControls />
            <TimelineSvg />
            <DependencyView />
          </section>
          <DetailPanel />
        </div>
      </main>
      {settingsOpen && (
        <div className="settingsOverlay">
          <button
            type="button"
            className="settingsBackdrop"
            aria-label="設定を閉じる"
            onClick={() => setSettingsOpen(false)}
          />
          <aside className="settingsPanel" aria-label="設定">
            <div className="settingsHeader">
              <h2>設定</h2>
              <button
                type="button"
                className="iconButton"
                aria-label="設定を閉じる"
                title="閉じる"
                onClick={() => setSettingsOpen(false)}
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
            <TimelineMetaSettings />
            <TagLaneSettings />
          </aside>
        </div>
      )}
    </div>
  );
}
