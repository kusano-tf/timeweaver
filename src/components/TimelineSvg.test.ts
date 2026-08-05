import { describe, expect, it } from "vitest";

import {
  createBoundaryTicks,
  createLabelInterval,
  formatBoundaryTick,
  formatTick,
  shouldShowTickLabel,
} from "./TimelineSvg";

describe("時間軸ヘッダーのラベル", () => {
  it("日表示の通常ラベルは日だけを表示する", () => {
    expect(formatTick("day", new Date(2026, 6, 1))).toBe("01");
  });

  it("月表示は年境界と月ラベルを分ける", () => {
    const january = new Date(2026, 0, 1);
    expect(formatBoundaryTick("month", january)).toBe("2026");
    expect(formatTick("month", january)).toBe("01");
  });

  it("月表示では表示範囲内の年初を境界として返す", () => {
    const ticks = createBoundaryTicks(
      "month",
      new Date(2025, 11, 1),
      new Date(2026, 1, 1),
    );
    expect(ticks.map((tick) => tick.getTime())).toEqual([
      new Date(2026, 0, 1).getTime(),
    ]);
  });

  it("日表示のラベル間隔は目盛り間隔に揃える", () => {
    expect(
      createLabelInterval(
        "day",
        new Date(2026, 3, 1),
        (date) => date.getTime() / 86_400_000,
        7,
      ),
    ).toBe(7);
  });

  it("日表示では生成済みの目盛りを月内の日付に関係なく表示する", () => {
    expect(shouldShowTickLabel("day", new Date(2026, 4, 6), 7, false)).toBe(
      true,
    );
  });
});
