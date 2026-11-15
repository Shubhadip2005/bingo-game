import { useEffect, useState } from "react";
import type { Player, RoomData } from "../types";
import {
  emptyDraft, isCompleteBoard, nextFreeNumber, randomFill, unusedNumbers, validateEntry, type Draft,
} from "../lib/bingoLogic";
import { markReady, submitBoard } from "../lib/roomActions";
import { otherPlayerId } from "../lib/roomLogic";
import BoardGrid from "./BoardGrid";

interface Props {
  room: RoomData;
  roomId: string;
  uid: string;
  myCells: number[] | null;
  onSubmitted: (cells: number[]) => void;
  onLeave: () => void;
}

function loadDraft(key: string, total: number): Draft {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null");
    if (Array.isArray(parsed) && parsed.length === total && parsed.every((v) => v === null || Number.isInteger(v))) {
      return parsed as Draft;
    }
  } catch {
    /* ignore a broken draft */
  }
  return emptyDraft(Math.sqrt(total));
}

export default function SetupBoard({ room, roomId, uid, myCells, onSubmitted, onLeave }: Props) {
  const n = room.gridSize;
  const me: Player | undefined = room.players[uid];
  const opponentId = otherPlayerId(room, uid);
  const opponent: Player | undefined = opponentId ? room.players[opponentId] : undefined;
  const locked = !!me?.ready;

  const draftKey = `bingo:draft:${roomId}:${room.round}:${uid}`;
  const [draft, setDraft] = useState<Draft>(() => loadDraft(draftKey, n * n));
  const [selected, setSelected] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      /* ignore */
    }
  }, [draft, draftKey]);

  const shown: Draft = locked && myCells ? myCells : draft;
  const placed = draft.filter((v) => v !== null).length;
  const unused = unusedNumbers(draft, n);
  const complete = isCompleteBoard(draft, n);

  function setCell(index: number, value: number | null) {
    setDraft((d) => d.map((v, i) => (i === index ? value : v)));
  }

  function handleCell(index: number) {
    if (locked) return;
    setError(null);
    if (draft[index] === null) {
      const next = nextFreeNumber(draft, n);
      if (next !== null) setCell(index, next);
      setSelected(null);
    } else {
      setSelected(index);
      setEditValue(String(draft[index]));
    }
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (selected === null) return;
    const result = validateEntry(draft, selected, editValue, n);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCell(selected, result.value);
    setSelected(null);
    setError(null);
  }

  function removeNumber() {
    if (selected === null) return;
    setCell(selected, null);
    setSelected(null);
    setError(null);
  }

  async function handleReady() {
    if (!isCompleteBoard(draft, n)) return;
    setBusy(true);
    setError(null);
    try {
      await submitBoard(roomId, room.round, uid, draft);
      onSubmitted(draft);
      await markReady(roomId, uid);
    } catch (e) {
      console.error(e);
      setError("Couldn't save your board. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page wide">
      <div className="card">
        <h2 className="title">{locked ? "Board locked in" : "Arrange your board"}</h2>
        <p className="hint">
          {locked
            ? opponent?.ready
              ? "Both boards are ready. Starting…"
              : `Waiting for ${opponent?.name ?? "your opponent"} to finish their board.`
            : `Tap an empty box to place the next number, starting from 1. Tap a number to change or remove it. Use every number from 1 to ${n * n} once. Your opponent can't see your board until the game ends.`}
        </p>

        {!locked && (
          <p className="progress-line">
            <strong>
              {placed} of {n * n}
            </strong>{" "}
            boxes filled
            {unused.length > 0 && unused.length <= 15 && <span>. Still to place: {unused.join(", ")}</span>}
          </p>
        )}

        {selected !== null && !locked && (
          <form className="edit-bar" onSubmit={saveEdit}>
            <label htmlFor="edit-number">
              Row {Math.floor(selected / n) + 1}, column {(selected % n) + 1}
            </label>
            <input
              id="edit-number"
              className="input small"
              inputMode="numeric"
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSelected(null)}
            />
            <button type="submit" className="btn primary small">
              Save
            </button>
            <button type="button" className="btn ghost small" onClick={removeNumber}>
              Remove number
            </button>
            <button type="button" className="btn ghost small" onClick={() => setSelected(null)}>
              Cancel
            </button>
          </form>
        )}
        {error && <p className="error">{error}</p>}

        <BoardGrid
          n={n}
          cells={shown}
          selected={selected}
          label="Your board"
          canClick={() => !locked}
          onCellClick={handleCell}
        />

        {!locked && (
          <div className="actions">
            <button className="btn ghost" onClick={() => setDraft((d) => randomFill(d, n))} disabled={placed === n * n}>
              Fill the rest randomly
            </button>
            <button className="btn ghost" onClick={() => setDraft(randomFill(emptyDraft(n), n))}>
              Randomize everything
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                setDraft(emptyDraft(n));
                setSelected(null);
                setError(null);
              }}
              disabled={placed === 0}
            >
              Clear board
            </button>
            <button className="btn primary" onClick={handleReady} disabled={!complete || busy}>
              {busy ? "Saving…" : complete ? "I'm ready" : `Place ${unused.length} more`}
            </button>
          </div>
        )}

        <div className="status-row">
          <span className={me?.ready ? "tag ok" : "tag"}>You {me?.ready ? "ready" : "arranging"}</span>
          <span className={opponent?.ready ? "tag ok" : "tag"}>
            {opponent?.name ?? "Opponent"} {opponent?.ready ? "ready" : "arranging"}
          </span>
          {opponent && !opponent.online && <span className="tag warn">Opponent offline</span>}
        </div>
        <button className="btn ghost wide" onClick={onLeave}>
          Leave game
        </button>
      </div>
    </main>
  );
}
