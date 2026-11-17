import { useState } from "react";
import type { RoomData } from "../types";
import { copyText } from "../lib/session";
import { startGame } from "../lib/roomActions";
import { MIN_PLAYERS } from "../lib/roomLogic";

interface Props {
  room: RoomData;
  roomId: string;
  uid: string;
  onLeave: () => void;
}

export default function Lobby({ room, roomId, uid, onLeave }: Props) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const players = Object.values(room.players).sort((a, b) => a.joinedAt - b.joinedAt);
  const emptySlots = Math.max(0, room.maxPlayers - players.length);
  const isHost = room.hostId === uid;
  const canStart = isHost && players.length >= MIN_PLAYERS;

  async function copy(kind: "code" | "link") {
    const ok = await copyText(kind === "code" ? roomId : `${window.location.origin}/room/${roomId}`);
    if (ok) {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1600);
    }
  }

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      await startGame(roomId, uid);
    } catch (e) {
      console.error(e);
      setError("Couldn't start the game. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="card">
        <h2 className="title">Waiting for players</h2>
        <p className="hint">
          {room.gridSize}×{room.gridSize} board, first to {room.linesToWin} lines, up to {room.maxPlayers} players.
          Rows, columns and diagonals count.
        </p>

        <p className="label">Room code</p>
        <div className="code-row">
          <span className="code-stamp">{roomId}</span>
          <button type="button" className="btn ghost" onClick={() => copy("code")}>
            {copied === "code" ? "Copied" : "Copy code"}
          </button>
          <button type="button" className="btn ghost" onClick={() => copy("link")}>
            {copied === "link" ? "Copied" : "Copy invite link"}
          </button>
        </div>

        <p className="label">
          Players: {players.length} of {room.maxPlayers}
        </p>
        <ul className="players">
          {players.map((p) => (
            <li key={p.id} className="player-row">
              <span className={p.online ? "dot on" : "dot"} aria-hidden="true" />
              <span className="grow">{p.name}</span>
              {p.id === room.hostId && <span className="tag">Host</span>}
              {p.id === uid && <span className="tag you">You</span>}
            </li>
          ))}
          {Array.from({ length: emptySlots }, (_, i) => (
            <li key={`empty-${i}`} className="player-row empty">
              <span className="dot" aria-hidden="true" />
              <span className="grow">Waiting for a player to join…</span>
            </li>
          ))}
        </ul>

        {error && <p className="error">{error}</p>}
        {isHost ? (
          <>
            <button className="btn primary" onClick={handleStart} disabled={!canStart || busy}>
              {canStart ? `Start game with ${players.length} players` : "Need at least 2 players"}
            </button>
            {canStart && emptySlots > 0 && (
              <p className="hint">You can wait for more players, or start now. Nobody can join after the game starts.</p>
            )}
          </>
        ) : (
          <p className="hint">Waiting for the host to start the game.</p>
        )}
        <button className="btn ghost wide" onClick={onLeave}>
          {isHost ? "Close room" : "Leave room"}
        </button>
      </div>
    </main>
  );
}
