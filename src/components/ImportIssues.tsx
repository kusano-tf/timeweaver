import { useTimelineState } from "../state/TimelineContext";

export function ImportIssues() {
  const { importIssues } = useTimelineState();

  if (importIssues.length === 0) {
    return null;
  }

  return (
    <section className="issuePanel">
      <h2>インポートエラー</h2>
      <ul>
        {importIssues.map((issue) => (
          <li key={`${issue.path}-${issue.message}`}>
            <code>{issue.path || "$"}</code>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
