import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
} from "react";

import { sampleTimeline } from "../data/sampleTimeline";
import {
  type TimelineAction,
  type TimelineState,
  timelineReducer,
} from "./timelineReducer";

const TimelineStateContext = createContext<TimelineState | null>(null);
const TimelineDispatchContext = createContext<Dispatch<TimelineAction> | null>(
  null,
);

export function TimelineProvider({ children }: { children: ReactNode }) {
  const initialState = useMemo<TimelineState>(
    () => ({
      document: sampleTimeline,
      selectedItemId: sampleTimeline.items[0]?.id ?? null,
      importIssues: [],
      dirty: false,
    }),
    [],
  );

  const [state, dispatch] = useReducer(timelineReducer, initialState);

  return (
    <TimelineStateContext.Provider value={state}>
      <TimelineDispatchContext.Provider value={dispatch}>
        {children}
      </TimelineDispatchContext.Provider>
    </TimelineStateContext.Provider>
  );
}

export function useTimelineState() {
  const state = useContext(TimelineStateContext);
  if (!state) {
    throw new Error("useTimelineState must be used within TimelineProvider.");
  }
  return state;
}

export function useTimelineDispatch() {
  const dispatch = useContext(TimelineDispatchContext);
  if (!dispatch) {
    throw new Error(
      "useTimelineDispatch must be used within TimelineProvider.",
    );
  }
  return dispatch;
}
