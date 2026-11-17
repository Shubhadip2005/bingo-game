import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RoomData } from "../types";
import { countLines, litCells } from "../lib/bingoLogic";
import { fetchBoard, rematch } from "../lib/roomActions";
import { activeIds } from "../lib/roomLogic";
import BoardGrid from "./BoardGrid";

interface Props {
  room: RoomData;
  roomId: string;
  uid: string;
}

export default function Result({ room, roomId, uid }: Props) {
  const navigate = useNavigate();
  const n = room.gridSize;
  const ids = useMemo(() => Object.keys(room.players), [room.players]);
  const idsKey = ids.join(",");
  const [boards, setBoards] = useState<Record<string, number[] | null> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    setBoards(null);
    Promise.all(ids.map((id) => fetchBoard(roomId, room.round, id))).then((list) => {
      if (dead) return;
      setBoards(Object.fromEntries(ids.map((id, i) => [id, list[i]])));
    });
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, room.round, idsKey]);

  const winners = room.winnerIds ?? [];
  const nameOf = (id: string) => room.players[id]?.name ?? "Player";
  const joinNames = (list: string[]) =>
    list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;

    let headline: string;
  let detail: string;
  if (winners.length === 0) {
    headline = "Game over";
    detail = "Everyone left the game.";
  } else if (winners.length > 1) {
    const everyoneTied = winners.length === activeIds(room).length;
    const others = winners.filter((id) => id !== uid).map(nameOf);
    const lineText = `completed ${room.linesToWin} lines on number ${room.lastCall?.number ?? ""}`;
    if (everyoneTied) {
      headline = "It's a draw";
      detail = `${joinNames(winners.map(nameOf))} all ${lineText}.`;
    } else if (winners.includes(uid)) {
      headline = "Shared win";
      detail = `You tied with ${joinNames(others)}. You all ${lineText}.`;
    } else {
      headline = `${joinNames(winners.map(nameOf))} share the win`;
      detail = `They all ${lineText}. You didn't reach it this time.`;
    }
  } else if (winners[0] === uid) {
    headline = "You win";
    detail = room.endReason === "forfeit" ? "Everyone else left the game." : `You reached ${room.linesToWin} lines first.`;
  } else {
    headline = `${nameOf(winners[0])} wins`;
    detail =
      room.endReason === "forfeit" ? "Everyone else left the game." : `${nameOf(winners[0])} reached ${room.linesToWin} lines first.`;
  }

  // Winners first, then by lines completed.
  const linesOf = (id: string) => {
    const cells = boards?.[id];
    return cells ? countLines(cells, room.called, n, room.diagonals) : 0;
  };
  const ranked = [...ids].sort(
    (a, b) => Number(winners.includes(b)) - Number(winners.includes(a)) || linesOf(b) - linesOf(a)
  );

  const stayingOnline = activeIds(room).filter((id) => id !== uid && room.players[id].online);
  const canRematch = stayingOnline.length >= 1;

  async function handleRematch() {
    setError(null);
    try {
      await rematch(roomId, uid);
    } catch (e) {
      console.error(e);
      setError("Couldn't start a rematch. Try again.");
    }
  }

  return (
    <main className="page wide">
      <div className="card">
        <h2 className="title big">{headline}</h2>
        <p className="hint">{detail} Small numbers in the corner show the order numbers were called.</p>

        <div className={n > 10 ? "reveal big" : "reveal"}>
          {ranked.map((id) => {
            const cells = boards?.[id] ?? null;
            const lines = linesOf(id);
            return (
              <section key={id} className="reveal-board">
                <h3 className="reveal-name">
                  {nameOf(id)}
                  {id === uid && <span className="tag you">You</span>}
                  {winners.includes(id) && <span className="tag ok">Winner</span>}
                  {room.players[id]?.left && <span className="tag">Left</span>}
                  {cells && (
                    <span className="reveal-lines">
                      {lines} {lines === 1 ? "line" : "lines"}
                    </span>
                  )}
                </h3>
                {boards === null ? (
                  <p className="hint">Loading board…</p>
                ) : cells ? (
                  <BoardGrid
                    n={n}
                    cells={cells}
                    called={room.called}
                    lit={litCells(cells, room.called, n, room.diagonals)}
                    showOrder
                    label={`${nameOf(id)}'s board`}
                  />
                ) : (
                  <p className="hint">This board wasn't finished before the game ended.</p>
                )}
              </section>
            );
          })}
        </div>

        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn primary" onClick={handleRematch} disabled={!canRematch}>
            Play again
          </button>
          <button className="btn ghost" onClick={() => navigate("/")}>
            Back to home
          </button>
        </div>
        <p className="hint">
          {canRematch
            ? "Play again keeps everyone who is still here. Anyone who has left or gone offline is dropped."
            : "Nobody else is online right now, so there's nobody to play again with."}
        </p>
      </div>
    </main>
  );
}
