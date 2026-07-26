import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const debugStorageKey = "timeweaver.debug-overlay-enabled";

export type TimelineDebugInfo = {
  view: {
    scale: string;
    visibleRange: string;
    baseRange: string;
    zoomRatio: number;
    pixelsPerHour: number;
  };
  render: {
    svgSize: string;
    plotWidth: number;
    tickInterval: string;
    labelInterval: string;
    tickCount: number;
    boundaryTickCount: number;
    filteredItemCount: number;
    visibleItemCount: number;
    visibleDependencyCount: number;
  };
  selection: {
    item: string | null;
    dependency: string | null;
    itemLayout: string | null;
  };
  interaction: {
    drag: string | null;
    filter: string;
  };
};

type AppDebugInfo = {
  detailOpen: boolean;
};

const DebugEnabledContext = createContext<{
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
} | null>(null);
const DebugReporterContext = createContext<{
  reportTimeline: (info: TimelineDebugInfo) => void;
  reportApp: (info: AppDebugInfo) => void;
} | null>(null);
const DebugInfoContext = createContext<{
  timeline: TimelineDebugInfo | null;
  app: AppDebugInfo | null;
} | null>(null);

export function DebugProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(readDebugEnabled);
  const [timeline, setTimeline] = useState<TimelineDebugInfo | null>(null);
  const [app, setApp] = useState<AppDebugInfo | null>(null);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(debugStorageKey, String(enabled));
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }, [enabled]);

  const updateEnabled = useCallback((nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    if (!nextEnabled) {
      setTimeline(null);
      setApp(null);
    }
  }, []);
  const reportTimeline = useCallback((info: TimelineDebugInfo) => {
    setTimeline(info);
  }, []);
  const reportApp = useCallback((info: AppDebugInfo) => {
    setApp(info);
  }, []);
  const enabledValue = useMemo(
    () => ({ enabled, setEnabled: updateEnabled }),
    [enabled, updateEnabled],
  );
  const reporterValue = useMemo(
    () => ({ reportTimeline, reportApp }),
    [reportApp, reportTimeline],
  );
  const infoValue = useMemo(() => ({ timeline, app }), [app, timeline]);

  return (
    <DebugEnabledContext.Provider value={enabledValue}>
      <DebugReporterContext.Provider value={reporterValue}>
        <DebugInfoContext.Provider value={infoValue}>
          {children}
        </DebugInfoContext.Provider>
      </DebugReporterContext.Provider>
    </DebugEnabledContext.Provider>
  );
}

export function useDebugEnabled() {
  const context = useContext(DebugEnabledContext);
  if (!context) {
    throw new Error("useDebugEnabled must be used within DebugProvider.");
  }
  return context;
}

export function useDebugReporter() {
  const context = useContext(DebugReporterContext);
  if (!context) {
    throw new Error("useDebugReporter must be used within DebugProvider.");
  }
  return context;
}

export function useDebugInfo() {
  const context = useContext(DebugInfoContext);
  if (!context) {
    throw new Error("useDebugInfo must be used within DebugProvider.");
  }
  return context;
}

function readDebugEnabled() {
  try {
    return window.sessionStorage.getItem(debugStorageKey) === "true";
  } catch {
    return false;
  }
}
