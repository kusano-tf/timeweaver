export function PropagationPrompt({
  descendantCount,
  onPropagate,
  onKeepLocal,
  onCancel,
}: {
  descendantCount: number;
  onPropagate: () => void;
  onKeepLocal: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="propagationPromptOverlay">
      <button
        type="button"
        className="propagationPromptBackdrop"
        aria-label="変更をキャンセル"
        onClick={onCancel}
      />
      <section
        className="propagationPrompt"
        role="dialog"
        aria-modal="true"
        aria-label="後続への伝播"
      >
        <p>後続 {descendantCount}件も同じ差分で移動します。</p>
        <div>
          <button type="button" className="primary" onClick={onPropagate}>
            後続に伝播する
          </button>
          <button type="button" onClick={onKeepLocal}>
            このアイテムだけ変更する
          </button>
          <button type="button" className="textButton" onClick={onCancel}>
            キャンセル
          </button>
        </div>
      </section>
    </div>
  );
}
