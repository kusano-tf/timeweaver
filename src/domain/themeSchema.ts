import { z } from "zod";

import { type TimelineThemeDefinition, timelineThemeTokenKeys } from "./theme";
import type { ValidationIssue } from "./types";

export const themeSchemaVersion = "1.0.0" as const;

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "色は #RRGGBB 形式で指定してください。");

const tokenShape = Object.fromEntries(
  timelineThemeTokenKeys.map((key) => [key, colorSchema]),
) as Record<keyof TimelineThemeDefinition, typeof colorSchema>;

export const timelineThemeDocumentSchema = z
  .object({
    schemaVersion: z.literal(themeSchemaVersion),
    tokens: z.object(tokenShape).strict(),
  })
  .strict();

export type TimelineThemeDocument = {
  schemaVersion: typeof themeSchemaVersion;
  tokens: TimelineThemeDefinition;
};

export type ParseTimelineThemeResult =
  | { ok: true; document: TimelineThemeDocument }
  | { ok: false; issues: ValidationIssue[] };

export function parseTimelineThemeDocument(
  input: unknown,
): ParseTimelineThemeResult {
  const parsed = timelineThemeDocumentSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, document: parsed.data };
  }

  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join(".") || "$",
      message: issue.message,
    })),
  };
}
