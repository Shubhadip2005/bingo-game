import { useState } from "react";
import type { Player, RoomData } from "../types";
import { countLines, litCells, isCalled } from "../lib/bingoLogic";
import { callNumber, forfeit } from "../lib/roomActions";
import { otherPlayerId } from "../lib/roomLogic";
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
  const opponentId = otherPlayerId(room, uid);
  const opponent: Player | undefined = opponentId ? room.players[opponentId] : undefined;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!myCells) {
    return (
      <main className="page">
        <p className="center-msg">Loading your board…</p>
      </main>
    );
  }

  const myLines = countLines(myCells, room.called, n, room.diagonals);
  const opponentLines = opponentId ? room.reports[opponentId]?.lines ?? 0 : 0;
  const lit = litCells(myCells, room.called, n, room.diagonals);
  const myTurn = room.turnId === uid;
  const canPick = myTurn && !room.awaiting && !pending;

  const history = Object.entries(room.called)
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => Number(key.slice(1)));
  const lastCaller = room.lastCall ? room.players[room.lastCall.by]?.name ?? "Someone" : null;

  async function handleCell(index: number) {
    const num = myCells![index];
    if (!canPick || isCalled(room.called, num)) return;
    setPending(true);
    setError(null);
    try {
      await callNumber(roomId, uid, num);
    } catch (e) {
      console.error(e);
      setError("That call didn't go through. Check your connection and tap the number again.");
    } finally {
      setPending(false);
    }
  }

  async function claimWin() {
    if (!opponentId) return;
    if (!window.confirm(`${opponent?.name ?? "Your opponent"} is offline. End the game and claim the win?`)) return;
    try {
      await forfeit(roomId, opponentId);
    } catch (e) {
      console.error(e);
      setError("Couldn't end the game. Try again.");
    }
  }

  let banner: string;
  if (room.awaiting) banner = "Checking lines…";
  else if (myTurn) banner = "Your turn. Tap a number on your board.";
  else banner = `${opponent?.name ?? "Your opponent"} is choosing a number…`;

  const rows: { id: string; name: string; lines: number; you: boolean }[] = [
    { id: uid, name: room.players[uid]?.name ?? "You", lines: myLines, you: true },
    ...(opponentId ? [{ id: opponentId, name: opponent?.name ?? "Opponent", lines: opponentLines, you: false }] : []),
  ];

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
            label="Your board"
            canClick={(i) => canPick && !isCalled(room.called, myCells[i])}
            onCellClick={handleCell}
          />
        </section>

        <aside className="side">
          <div className="card">
            <h2 className="title small">First to {room.linesToWin} lines</h2>
            <ul className="progress-list">
              {rows.map((r) => (
                <li key={r.id}>
                  <div className="progress-top">
                    <span className="grow">
                      {r.name}
                      {r.you && <span className="tag you">You</span>}
                    </span>
                    <strong>
                      {r.lines}/{room.linesToWin}
                    </strong>
                  </div>
                  <div className="bar">
                    <div className="bar-fill" style={{ width: `${Math.min(100, (r.lines / room.linesToWin) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            {opponent && !opponent.online && (
              <div className="offline">
                <p>{opponent.name} is offline.</p>
                <button className="btn ghost small" onClick={claimWin}>
                  End game and claim win
                </button>
              </div>
            )}
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
              if (window.confirm("Leave the game? Your opponent will win.")) onLeave();
            }}
          >
            Leave game
          </button>
        </aside>
      </div>
    </main>
  );
}
