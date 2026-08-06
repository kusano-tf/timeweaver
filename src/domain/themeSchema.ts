import { z } from "zod";

import { type TimelineThemeDefinition, timelineThemeTokenKeys } from "./theme";
import type { ValidationIssue } from "./types";

export const themeSchemaVersion = "1.0.0" as const;

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "色は #RRGGBB 形式で指定してください。");
const widthSchema = z
  .number()
  .min(0.5, "線幅は 0.5 以上にしてください。")
  .max(8, "線幅は 8 以下にしてください。")
  .multipleOf(0.5, "線幅は 0.5 刻みで指定してください。");

const tokenShape = Object.fromEntries(
  timelineThemeTokenKeys.map((key) => [
    key,
    key.endsWith("Width") ? widthSchema : colorSchema,
  ]),
) as Record<
  keyof TimelineThemeDefinition,
  typeof colorSchema | typeof widthSchema
>;

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
    return { ok: true, document: parsed.data as TimelineThemeDocument };
  }

  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.join(".") || "$",
      message: issue.message,
    })),
  };
}
