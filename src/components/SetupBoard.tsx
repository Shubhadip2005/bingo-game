import { useEffect, useState } from "react";
import type { Player, RoomData } from "../types";
import {
  emptyDraft, isCompleteBoard, nextFreeNumber, randomFill, sequentialFill, unusedNumbers, validateEntry, type Draft,
} from "../lib/bingoLogic";
import { leaveGame, markReady, submitBoard } from "../lib/roomActions";
import { activeIds } from "../lib/roomLogic";
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
  const others = activeIds(room).filter((id) => id !== uid).map((id) => room.players[id]);
  const waitingFor = others.filter((p) => !p.ready);
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

  async function removePlayer(p: Player) {
    if (!window.confirm(`${p.name} is offline. Remove them so the game can start without them?`)) return;
    try {
      await leaveGame(roomId, p.id);
    } catch (e) {
      console.error(e);
      setError("Couldn't remove that player. Try again.");
    }
  }

  return (
    <main className="page wide">
      <div className="card">
        <h2 className="title">{locked ? "Board locked in" : "Arrange your board"}</h2>
        <p className="hint">
          {locked
            ? waitingFor.length === 0
              ? "Everyone is ready. Starting…"
              : `Waiting for ${waitingFor.map((p) => p.name).join(", ")} to finish their board.`
            : `Tap an empty box to place the next number, starting from 1. Tap a number to change or remove it. Use every number from 1 to ${n * n} once. Nobody can see your board until the game ends.`}
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
            <button className="btn ghost" onClick={() => setDraft((d) => sequentialFill(d, n))} disabled={placed === n * n}>
              Fill the rest in order
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

        <p className="label">Players</p>
        <ul className="players">
          {activeIds(room).map((id) => {
            const p = room.players[id];
            return (
              <li key={id} className="player-row">
                <span className={p.online ? "dot on" : "dot"} aria-hidden="true" />
                <span className="grow">
                  {p.name}
                  {id === uid && <span className="tag you">You</span>}
                </span>
                <span className={p.ready ? "tag ok" : "tag"}>{p.ready ? "Ready" : "Arranging"}</span>
                {id !== uid && !p.online && (
                  <button className="btn ghost small" onClick={() => removePlayer(p)}>
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <button className="btn ghost wide" onClick={onLeave}>
          Leave game
        </button>
      </div>
    </main>
  );
}
