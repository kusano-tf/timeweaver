export const schemaVersion = "1.0.0" as const;

export type TimelineScale = "year" | "month" | "day" | "hour";
export type ItemType = "duration" | "instant";
export type DependencyType = "finish-to-start";
export type DateTimeString = string;

export type TimelineMeta = {
  title: string;
  description?: string;
};

export type Lane = {
  id: string;
  name: string;
  order: number;
};

export type Tag = {
  id: string;
  name: string;
  color: string;
};

export type BaseItem = {
  id: string;
  title: string;
  description?: string;
  laneId: string;
  tagIds: string[];
  color: string | null;
};

export type DurationItem = BaseItem & {
  type: "duration";
  start: DateTimeString;
  end: DateTimeString;
};

export type InstantItem = BaseItem & {
  type: "instant";
  at: DateTimeString;
};

export type TimelineItem = DurationItem | InstantItem;

export type Dependency = {
  id: string;
  fromId: string;
  toId: string;
  type: DependencyType;
  lagSeconds: number;
};

export type TimelineView = {
  scale: TimelineScale;
  visibleTagIds: string[];
  tagFilterMode: "any";
  laneMode: "manual";
  itemDisplay: {
    showLabels: boolean;
    showDependencyLines: boolean;
  };
};

export type TimelineDocument = {
  schemaVersion: typeof schemaVersion;
  timeline: TimelineMeta;
  lanes: Lane[];
  tags: Tag[];
  items: TimelineItem[];
  dependencies: Dependency[];
  view: TimelineView;
};

export type ValidationIssue = {
  path: string;
  message: string;
};
