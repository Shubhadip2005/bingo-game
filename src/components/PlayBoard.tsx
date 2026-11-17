import { useEffect, useState } from "react";
import type { Player, RoomData } from "../types";
import { countLines, litCells, isCalled } from "../lib/bingoLogic";
import { callNumber, leaveGame } from "../lib/roomActions";
import BoardGrid from "./BoardGrid";

interface Props {
  room: RoomData;
  roomId: string;
  uid: string;
  myCells: number[] | null;
  onLeave: () => void;
}

export default function PlayBoard({ room, roomId, uid, myCells, onLeave }: Props) {
  const n = room.gridSize;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The box the player tapped but hasn't confirmed yet (index into their board).
  const [picked, setPicked] = useState<number | null>(null);
  const myTurn = room.turnId === uid;

  // A tapped box is forgotten as soon as it is no longer this player's turn.
  useEffect(() => {
    if (!myTurn) setPicked(null);
  }, [myTurn]);

  if (!myCells) {
    return (
      <main className="page">
        <p className="center-msg">Loading your board…</p>
      </main>
    );
  }

  // Only YOUR line count is shown. Other players' progress is never stored or displayed.
  const myLines = countLines(myCells, room.called, n, room.diagonals);
  const lit = litCells(myCells, room.called, n, room.diagonals);
  const canPick = myTurn && !room.awaiting && !pending;
  const turnPlayer: Player | undefined = room.turnId ? room.players[room.turnId] : undefined;
  const seats = room.order.filter((id) => room.players[id]);

  const history = Object.entries(room.called)
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => Number(key.slice(1)));
  const lastCaller = room.lastCall ? room.players[room.lastCall.by]?.name ?? "Someone" : null;

  /** Tapping a box only selects it. Tapping it again, or another box, changes the selection. */
  function handleCell(index: number) {
    if (!canPick || isCalled(room.called, myCells![index])) return;
    setError(null);
    setPicked((current) => (current === index ? null : index));
  }

  async function confirmPick() {
    if (picked === null || !canPick) return;
    setPending(true);
    setError(null);
    try {
      await callNumber(roomId, uid, myCells![picked]);
      setPicked(null);
    } catch (e) {
      console.error(e);
      setError("That call didn't go through. Check your connection and tap the number again.");
    } finally {
      setPending(false);
    }
  }

  async function removePlayer(p: Player) {
    if (!window.confirm(`${p.name} is offline. Remove them so the game can carry on without them?`)) return;
    try {
      await leaveGame(roomId, p.id);
    } catch (e) {
      console.error(e);
      setError("Couldn't remove that player. Try again.");
    }
  }

  let banner: string;
  if (room.awaiting) banner = "Checking lines…";
  else if (myTurn && picked !== null) banner = "Happy with it? Press Confirm, or tap another number.";
  else if (myTurn) banner = "Your turn. Tap a number on your board.";
  else banner = `${turnPlayer?.name ?? "Another player"} is choosing a number…`;

  return (
    <main className="page wide">
      <div className="play-layout">
        <section className="card board-card">
          <div className={myTurn && !room.awaiting ? "banner mine" : "banner"} aria-live="polite">
            {banner}
          </div>
          {error && <p className="error">{error}</p>}
          <BoardGrid
            n={n}
            cells={myCells}
            called={room.called}
            lit={lit}
            selected={myTurn && !room.awaiting ? picked : null}
            label="Your board"
            canClick={(i) => canPick && !isCalled(room.called, myCells[i])}
            onCellClick={handleCell}
          />
          {picked !== null && myTurn && !room.awaiting && (
            <div className="confirm-bar" role="group" aria-label="Confirm your number">
              <span className="ball">{myCells[picked]}</span>
              <span className="confirm-text">Call {myCells[picked]}?</span>
              <button className="btn ghost small" onClick={() => setPicked(null)} disabled={pending}>
                Change
              </button>
              <button className="btn primary small" onClick={confirmPick} disabled={pending}>
                {pending ? "Calling…" : "Confirm"}
              </button>
            </div>
          )}
        </section>

        <aside className="side">
          <div className="card">
            <h2 className="title small">Your lines</h2>
            <div className="progress-top">
              <span className="grow">First to {room.linesToWin} wins</span>
              <strong>
                {myLines}/{room.linesToWin}
              </strong>
            </div>
            <div className="bar">
              <div className="bar-fill" style={{ width: `${Math.min(100, (myLines / room.linesToWin) * 100)}%` }} />
            </div>
          </div>

          <div className="card">
            <h2 className="title small">Turn order</h2>
            <ul className="turn-list">
              {seats.map((id) => {
                const p = room.players[id];
                const isTurn = id === room.turnId && !p.left;
                return (
                  <li key={id} className={p.left ? "turn-row left" : isTurn ? "turn-row now" : "turn-row"}>
                    <span className={p.online && !p.left ? "dot on" : "dot"} aria-hidden="true" />
                    <span className="grow">
                      {p.name}
                      {id === uid && <span className="tag you">You</span>}
                    </span>
                    {p.left ? (
                      <span className="tag">Left</span>
                    ) : isTurn ? (
                      <span className="tag turn">{room.awaiting ? "Called" : "Turn"}</span>
                    ) : null}
                    {!p.left && !p.online && id !== uid && (
                      <button className="btn ghost small" onClick={() => removePlayer(p)}>
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="card">
            <h2 className="title small">Called numbers</h2>
            {room.lastCall ? (
              <p className="last-call">
                <span className="ball big">{room.lastCall.number}</span>
                <span>{lastCaller} called it</span>
              </p>
            ) : (
              <p className="hint">Nothing called yet.</p>
            )}
            <div className="history">
              {history.map((num, i) => (
                <span key={num} className={i === history.length - 1 ? "ball tiny latest" : "ball tiny"}>
                  {num}
                </span>
              ))}
            </div>
          </div>

          <button
            className="btn ghost wide"
            onClick={() => {
              if (window.confirm("Leave the game? You won't be able to rejoin this round.")) onLeave();
            }}
          >
            Leave game
          </button>
        </aside>
      </div>
    </main>
  );
}