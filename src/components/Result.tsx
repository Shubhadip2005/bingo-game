import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Player, RoomData } from "../types";
import { countLines, litCells } from "../lib/bingoLogic";
import { fetchBoard, rematch } from "../lib/roomActions";
import { otherPlayerId } from "../lib/roomLogic";
import BoardGrid from "./BoardGrid";

interface Props {
  room: RoomData;
  roomId: string;
  uid: string;
}

export default function Result({ room, roomId, uid }: Props) {
  const navigate = useNavigate();
  const n = room.gridSize;
  const opponentId = otherPlayerId(room, uid);
  const opponent: Player | undefined = opponentId ? room.players[opponentId] : undefined;
  const ids = opponentId ? [uid, opponentId] : [uid];
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
  }, [roomId, room.round, uid, opponentId]);

  const winners = room.winnerIds ?? [];
  const nameOf = (id: string) => room.players[id]?.name ?? "Player";
  let headline: string;
  let detail: string;
  if (winners.length > 1) {
    headline = "It's a draw";
    detail = `You both completed ${room.linesToWin} lines on number ${room.lastCall?.number ?? ""}.`;
  } else if (winners[0] === uid) {
    headline = "You win";
    detail = room.endReason === "forfeit" ? `${opponent?.name ?? "Your opponent"} left the game.` : `You reached ${room.linesToWin} lines first.`;
  } else {
    headline = `${nameOf(winners[0] ?? "")} wins`;
    detail = room.endReason === "forfeit" ? "You left the game." : `${nameOf(winners[0] ?? "")} reached ${room.linesToWin} lines first.`;
  }

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

        <div className="reveal">
          {ids.map((id) => {
            const cells = boards?.[id] ?? null;
            const lines = cells ? countLines(cells, room.called, n, room.diagonals) : 0;
            return (
              <section key={id} className="reveal-board">
                <h3 className="reveal-name">
                  {nameOf(id)}
                  {id === uid && <span className="tag you">You</span>}
                  {winners.includes(id) && <span className="tag ok">Winner</span>}
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
          <button className="btn primary" onClick={handleRematch} disabled={!opponent}>
            Play again
          </button>
          <button className="btn ghost" onClick={() => navigate("/")}>
            Back to home
          </button>
        </div>
        {opponent && !opponent.online && <p className="hint">{opponent.name} is offline right now.</p>}
      </div>
    </main>
  );
}
