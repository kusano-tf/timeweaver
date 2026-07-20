import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { compareDateTime } from "../domain/datetime";
import { getItemStart } from "../domain/items";
import type { Dependency, TimelineItem } from "../domain/types";
import {
  useTimelineDispatch,
  useTimelineState,
} from "../state/TimelineContext";

export function DependencyView() {
  const { document, selectedDependencyId } = useTimelineState();
  const dispatch = useTimelineDispatch();
  const [open, setOpen] = useState(false);
  const itemById = useMemo(
    () => new Map(document.items.map((item) => [item.id, item])),
    [document.items],
  );
  const rows = useMemo(
    () => sortDependencies(document.dependencies, itemById),
    [document.dependencies, itemById],
  );

  return (
    <section className="dependencyView">
      <button
        type="button"
        className="dependencyViewToggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? (
          <ChevronDown aria-hidden="true" size={16} />
        ) : (
          <ChevronRight aria-hidden="true" size={16} />
        )}
        <span>依存関係</span>
        <span className="dependencyCount">
          {document.dependencies.length}件
        </span>
      </button>
      {open && (
        <div className="dependencyTableWrap">
          <table className="dependencyTable">
            <thead>
              <tr>
                <th>先行</th>
                <th>後続</th>
                <th>時間差</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="emptyDependencyCell">
                    依存関係はありません。
                  </td>
                </tr>
              ) : (
                rows.map((dependency) => {
                  const from = itemById.get(dependency.fromId);
                  const to = itemById.get(dependency.toId);
                  const selected = dependency.id === selectedDependencyId;

                  return (
                    <tr
                      key={dependency.id}
                      className={selected ? "selectedDependencyRow" : undefined}
                      onClick={() =>
                        dispatch({
                          type: "selectDependency",
                          dependencyId: dependency.id,
                        })
                      }
                    >
                      <td>{from?.title ?? dependency.fromId}</td>
                      <td>{to?.title ?? dependency.toId}</td>
                      <td>
                        <code title={`${dependency.lagSeconds}s`}>
                          {formatLagSeconds(dependency.lagSeconds)}
                        </code>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function sortDependencies(
  dependencies: Dependency[],
  itemById: Map<string, TimelineItem>,
) {
  return [...dependencies].sort((a, b) => {
    const fromA = itemById.get(a.fromId);
    const fromB = itemById.get(b.fromId);
    const fromDiff = compareOptionalItemStart(fromA, fromB);
    if (fromDiff !== 0) {
      return fromDiff;
    }

    const toA = itemById.get(a.toId);
    const toB = itemById.get(b.toId);
    const toDiff = compareOptionalItemStart(toA, toB);
    if (toDiff !== 0) {
      return toDiff;
    }

    return a.id.localeCompare(b.id);
  });
}

function compareOptionalItemStart(
  a: TimelineItem | undefined,
  b: TimelineItem | undefined,
) {
  if (!a && !b) {
    return 0;
  }
  if (!a) {
    return 1;
  }
  if (!b) {
    return -1;
  }
  return compareDateTime(getItemStart(a), getItemStart(b));
}

function formatLagSeconds(totalSeconds: number) {
  if (totalSeconds === 0) {
    return "0h";
  }

  const sign = totalSeconds < 0 ? "-" : "";
  let remaining = Math.abs(totalSeconds);
  const days = Math.floor(remaining / 86_400);
  remaining %= 86_400;
  const hours = Math.floor(remaining / 3_600);
  remaining %= 3_600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0 || days > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 && days === 0) {
    parts.push(`${minutes}m`);
  }
  if (seconds > 0 && days === 0 && hours === 0) {
    parts.push(`${seconds}s`);
  }

  return `${sign}${parts.join(" ")}`;
}
