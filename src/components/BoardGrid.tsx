import type { CSSProperties } from "react";
import { callKey } from "../lib/bingoLogic";

interface Props {
  n: number;
  cells: (number | null)[];
  called?: Record<string, number>;
  lit?: Set<number>;
  selected?: number | number[] | null;
  /** show the order in which each number was called (used on the final reveal) */
  showOrder?: boolean;
  canClick?: (index: number) => boolean;
  onCellClick?: (index: number) => void;
  label: string;
}

/** Boards bigger than 10x10 keep a readable box size and scroll sideways on small screens. */
const BIG_BOARD = 10;

export default function BoardGrid({ n, cells, called, lit, selected, showOrder, canClick, onCellClick, label }: Props) {
  const big = n > BIG_BOARD;
  const chosen = Array.isArray(selected) ? selected : selected == null ? [] : [selected];
  return (
    <div className="grid-wrap">
      <div
        className={big ? "grid big" : "grid"}
        style={{ "--n": n, "--mincell": big ? "30px" : "0px" } as CSSProperties}
        role="group"
        aria-label={label}
      >
        {cells.map((value, i) => {
          const order = value !== null && called ? called[callKey(value)] : undefined;
          const isCalled = typeof order === "number";
          const clickable = canClick ? canClick(i) : false;
          const cls = [
            "cell",
            value === null ? "empty" : "",
            isCalled ? "called" : "",
            lit?.has(i) ? "lit" : "",
            chosen.includes(i) ? "selected" : "",
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
    </div>
  );
}
