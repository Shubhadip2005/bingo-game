import type { CSSProperties } from "react";
import { callKey } from "../lib/bingoLogic";

interface Props {
  n: number;
  cells: (number | null)[];
  called?: Record<string, number>;
  lit?: Set<number>;
  selected?: number | null;
  /** show the order in which each number was called (used on the final reveal) */
  showOrder?: boolean;
  canClick?: (index: number) => boolean;
  onCellClick?: (index: number) => void;
  label: string;
}

export default function BoardGrid({ n, cells, called, lit, selected, showOrder, canClick, onCellClick, label }: Props) {
  return (
    <div className="grid" style={{ "--n": n } as CSSProperties} role="group" aria-label={label}>
      {cells.map((value, i) => {
        const order = value !== null && called ? called[callKey(value)] : undefined;
        const isCalled = typeof order === "number";
        const clickable = canClick ? canClick(i) : false;
        const cls = [
          "cell",
          value === null ? "empty" : "",
          isCalled ? "called" : "",
          lit?.has(i) ? "lit" : "",
          selected === i ? "selected" : "",
          clickable ? "clickable" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={i}
            type="button"
            className={cls}
            disabled={!clickable}
            onClick={() => onCellClick?.(i)}
            aria-label={value === null ? `Empty box ${i + 1}` : `Number ${value}${isCalled ? ", called" : ""}`}
          >
            <span className="cell-num">{value ?? ""}</span>
            {showOrder && isCalled && <span className="cell-order">{order}</span>}
          </button>
        );
      })}
    </div>
  );
}
