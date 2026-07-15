import { z } from "zod";

import { compareDateTime, isDateTimeString } from "./datetime";
import { detectDependencyCycles } from "./dependencies";
import {
  schemaVersion,
  type TimelineDocument,
  type ValidationIssue,
} from "./types";

const dateTimeSchema = z.string().refine(isDateTimeString, {
  message: "日時は YYYY-MM-DDTHH:mm:ss 形式で指定してください。",
});

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "色は #RRGGBB 形式で指定してください。");

const baseItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  laneId: z.string().min(1),
  tagIds: z.array(z.string().min(1)),
  colorTagId: z.string().min(1).nullable(),
  color: colorSchema.nullable(),
});

const durationItemSchema = baseItemSchema
  .extend({
    type: z.literal("duration"),
    start: dateTimeSchema,
    end: dateTimeSchema,
  })
  .refine((item) => compareDateTime(item.start, item.end) < 0, {
    path: ["end"],
    message: "期間アイテムの end は start より後にしてください。",
  });

const instantItemSchema = baseItemSchema.extend({
  type: z.literal("instant"),
  at: dateTimeSchema,
});

export const timelineDocumentSchema = z.object({
  schemaVersion: z.literal(schemaVersion),
  timeline: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
  }),
  lanes: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      order: z.number().int(),
    }),
  ),
  tags: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      color: colorSchema,
      order: z.number().int(),
    }),
  ),
  items: z.array(
    z.discriminatedUnion("type", [durationItemSchema, instantItemSchema]),
  ),
  dependencies: z.array(
    z.object({
      id: z.string().min(1),
      fromId: z.string().min(1),
      toId: z.string().min(1),
      type: z.literal("finish-to-start"),
      lagSeconds: z.number().int(),
    }),
  ),
  view: z.object({
    scale: z.enum(["year", "month", "day", "hour"]),
    visibleTagIds: z.array(z.string().min(1)),
    tagFilterMode: z.literal("any"),
    laneMode: z.literal("manual"),
    itemDisplay: z.object({
      showLabels: z.boolean(),
      showDependencyLines: z.boolean(),
    }),
  }),
});

export type ParseTimelineResult =
  | { ok: true; document: TimelineDocument }
  | { ok: false; issues: ValidationIssue[] };

export function parseTimelineDocument(input: unknown): ParseTimelineResult {
  const parsed = timelineDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const integrityIssues = validateDocumentIntegrity(parsed.data);
  if (integrityIssues.length > 0) {
    return { ok: false, issues: integrityIssues };
  }

  return { ok: true, document: parsed.data };
}

export function validateDocumentIntegrity(
  document: TimelineDocument,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const laneIds = new Set(document.lanes.map((lane) => lane.id));
  const tagIds = new Set(document.tags.map((tag) => tag.id));
  const itemIds = new Set(document.items.map((item) => item.id));

  collectDuplicateIds("lanes", document.lanes, issues);
  collectDuplicateIds("tags", document.tags, issues);
  collectDuplicateIds("items", document.items, issues);
  collectDuplicateIds("dependencies", document.dependencies, issues);

  document.items.forEach((item, itemIndex) => {
    if (!laneIds.has(item.laneId)) {
      issues.push({
        path: `items.${itemIndex}.laneId`,
        message: `存在しないレーン ID です: ${item.laneId}`,
      });
    }

    item.tagIds.forEach((tagId, tagIndex) => {
      if (!tagIds.has(tagId)) {
        issues.push({
          path: `items.${itemIndex}.tagIds.${tagIndex}`,
          message: `存在しないタグ ID です: ${tagId}`,
        });
      }
    });

    if (item.colorTagId !== null) {
      if (!tagIds.has(item.colorTagId)) {
        issues.push({
          path: `items.${itemIndex}.colorTagId`,
          message: `存在しないタグ ID です: ${item.colorTagId}`,
        });
      } else if (!item.tagIds.includes(item.colorTagId)) {
        issues.push({
          path: `items.${itemIndex}.colorTagId`,
          message: `色に使うタグは item.tagIds に含めてください: ${item.colorTagId}`,
        });
      }
    }
  });

  document.dependencies.forEach((dependency, dependencyIndex) => {
    if (!itemIds.has(dependency.fromId)) {
      issues.push({
        path: `dependencies.${dependencyIndex}.fromId`,
        message: `存在しないアイテム ID です: ${dependency.fromId}`,
      });
    }

    if (!itemIds.has(dependency.toId)) {
      issues.push({
        path: `dependencies.${dependencyIndex}.toId`,
        message: `存在しないアイテム ID です: ${dependency.toId}`,
      });
    }
  });

  document.view.visibleTagIds.forEach((tagId, tagIndex) => {
    if (!tagIds.has(tagId)) {
      issues.push({
        path: `view.visibleTagIds.${tagIndex}`,
        message: `存在しないタグ ID です: ${tagId}`,
      });
    }
  });

  for (const cycle of detectDependencyCycles(document.dependencies)) {
    issues.push({
      path: "dependencies",
      message: `循環依存があります: ${cycle.join(" -> ")}`,
    });
  }

  return issues;
}

function collectDuplicateIds(
  path: string,
  values: { id: string }[],
  issues: ValidationIssue[],
) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value.id)) {
      issues.push({
        path: `${path}.${index}.id`,
        message: `ID が重複しています: ${value.id}`,
      });
    }
    seen.add(value.id);
  });
}
