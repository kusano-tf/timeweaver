import { useDebugEnabled, useDebugInfo } from "../state/DebugContext";

export function DebugOverlay() {
  const { enabled } = useDebugEnabled();
  const { timeline, app } = useDebugInfo();

  if (!enabled) {
    return null;
  }

  return (
    <aside className="debugOverlay" aria-label="デバッグ情報">
      <div className="debugOverlayTitle">DEBUG</div>
      <DebugSection
        title="表示"
        rows={[
          ["粒度", timeline?.view.scale],
          ["表示範囲", timeline?.view.visibleRange],
          ["基準範囲", timeline?.view.baseRange],
          [
            "拡大率",
            timeline ? `${timeline.view.zoomRatio.toFixed(2)}×` : null,
          ],
          [
            "px / 時間",
            timeline ? timeline.view.pixelsPerHour.toFixed(2) : null,
          ],
        ]}
      />
      <DebugSection
        title="描画"
        rows={[
          ["SVG", timeline?.render.svgSize],
          ["プロット幅", timeline ? `${timeline.render.plotWidth}px` : null],
          ["目盛り", timeline?.render.tickInterval],
          ["ラベル", timeline?.render.labelInterval],
          [
            "描画数",
            timeline
              ? `${timeline.render.tickCount} + 境界 ${timeline.render.boundaryTickCount}`
              : null,
          ],
          [
            "アイテム",
            timeline
              ? `${timeline.render.visibleItemCount} / ${timeline.render.filteredItemCount}`
              : null,
          ],
          ["依存", timeline?.render.visibleDependencyCount],
        ]}
      />
      <DebugSection
        title="選択"
        rows={[
          ["アイテム", timeline?.selection.item],
          ["依存", timeline?.selection.dependency],
          ["配置", timeline?.selection.itemLayout],
        ]}
      />
      <DebugSection
        title="操作"
        rows={[
          ["ドラッグ", timeline?.interaction.drag],
          ["フィルタ", timeline?.interaction.filter],
          ["詳細パネル", app ? (app.detailOpen ? "開" : "閉") : null],
        ]}
      />
    </aside>
  );
}

function DebugSection({
  title,
  rows,
}: {
  title: string;
  rows: [string, string | number | null | undefined][];
}) {
  return (
    <section className="debugOverlaySection">
      <h2>{title}</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
