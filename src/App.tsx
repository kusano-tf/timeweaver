import { useEffect } from "react";

import { DetailPanel } from "./components/DetailPanel";
import { ImportIssues } from "./components/ImportIssues";
import { TagFilters } from "./components/TagFilters";
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

  return (
    <div className="app">
      <Toolbar />
      <main className="workspace">
        <aside className="sidePanel">
          <section className="panelSection">
            <h1>{document.timeline.title}</h1>
            <p>{document.timeline.description}</p>
          </section>
          <TagFilters />
          <ImportIssues />
        </aside>
        <TimelineSvg />
        <DetailPanel />
      </main>
    </div>
  );
}
