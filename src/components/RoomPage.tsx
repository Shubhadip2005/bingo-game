import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Player } from "../types";
import { useRoom } from "../hooks/useRoom";
import { countLines } from "../lib/bingoLogic";
import { fetchBoard, forfeit, joinRoom, leaveLobby, reportLines, startPresence } from "../lib/roomActions";
import Lobby from "./Lobby";
import SetupBoard from "./SetupBoard";
import PlayBoard from "./PlayBoard";
import Result from "./Result";

interface Props {
  uid: string;
  name: string;
}

export default function RoomPage({ uid, name }: Props) {
  const { roomId: rawId = "" } = useParams();
  const roomId = rawId.toUpperCase();
  const navigate = useNavigate();
  const { room, error } = useRoom(roomId);

  const me: Player | undefined = room?.players[uid];
  const isPlayer = !!me;

  const [stored, setStored] = useState<{ roomId: string; round: number; cells: number[] } | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [tick, setTick] = useState(0);
  const lastReport = useRef({ key: "", at: 0 });

  // My own board for the current round (private; loaded from the database after a refresh).
  const myCells = stored && room && stored.roomId === roomId && stored.round === room.round ? stored.cells : null;

  // Show me as online while I'm in the room.
  useEffect(() => {
    if (!isPlayer) return;
    return startPresence(roomId, uid);
  }, [roomId, uid, isPlayer]);

  // Reload my board after a refresh once it has been submitted.
  useEffect(() => {
    if (!room || !isPlayer || myCells) return;
    if (room.status === "waiting" || (room.status === "setup" && !me?.ready)) return;
    let dead = false;
    fetchBoard(roomId, room.round, uid).then((cells) => {
      if (!dead && cells) setStored({ roomId, round: room.round, cells });
    });
    return () => {
      dead = true;
    };
  }, [roomId, uid, room?.round, room?.status, me?.ready, isPlayer, myCells]); // eslint-disable-line react-hooks/exhaustive-deps

  // While a call is being checked, re-run the report effect every few seconds in case a write failed.
  useEffect(() => {
    if (room?.status !== "playing" || !room.awaiting) return;
    const timer = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(timer);
  }, [room?.status, room?.awaiting]);

  // After every call, report how many lines MY board has. The last report settles the call.
  useEffect(() => {
    if (!room || !isPlayer || !myCells) return;
    if (room.status !== "playing" || !room.awaiting) return;
    if (room.reports[uid]?.count === room.callCount) return;
    const key = `${roomId}:${room.round}:${room.callCount}`;
    const now = Date.now();
    if (lastReport.current.key === key && now - lastReport.current.at < 2500) return;
    lastReport.current = { key, at: now };
    const lines = countLines(myCells, room.called, room.gridSize, room.diagonals);
    reportLines(roomId, uid, room.callCount, lines).catch(() => undefined);
  }, [room, myCells, tick, isPlayer, roomId, uid]);

  async function handleJoin() {
    setJoining(true);
    setJoinError(null);
    try {
      const result = await joinRoom(roomId, uid, name);
      if (!result.ok) setJoinError(result.error);
    } catch {
      setJoinError("Couldn't join the room. Check your connection and try again.");
    } finally {
      setJoining(false);
    }
  }

  async function handleLeave() {
    if (!room) return;
    try {
      if (room.status === "waiting") await leaveLobby(roomId, uid, room.hostId === uid);
      else if (room.status === "setup" || room.status === "playing") await forfeit(roomId, uid);
    } catch (e) {
      console.error(e);
    }
    navigate("/");
  }

  if (error) {
    return (
      <main className="page">
        <p className="center-msg">{error}</p>
        <button className="btn ghost wide" onClick={() => navigate("/")}>
          Back to home
        </button>
      </main>
    );
  }
  if (room === undefined) {
    return (
      <main className="page">
        <p className="center-msg">Opening the room…</p>
      </main>
    );
  }
  if (room === null) {
    return (
      <main className="page">
        <div className="card">
          <h2 className="title">Room not found</h2>
          <p className="hint">This room doesn't exist or the host closed it. Check the code, or create a new room.</p>
          <button className="btn primary" onClick={() => navigate("/")}>
            Back to home
          </button>
        </div>
      </main>
    );
  }

  if (!isPlayer) {
    const canJoin = room.status === "waiting" && Object.keys(room.players).length < 2;
    return (
      <main className="page">
        <div className="card">
          <p className="label">Room {roomId}</p>
          <h2 className="title">{canJoin ? "Join this game" : "This game is full"}</h2>
          <p className="hint">
            {canJoin
              ? `${room.gridSize}×${room.gridSize} board, first to ${room.linesToWin} lines. You'll join as ${name}.`
              : "Two players are already in this room, or the match has started."}
          </p>
          {joinError && <p className="error">{joinError}</p>}
          {canJoin && (
            <button className="btn primary" onClick={handleJoin} disabled={joining}>
              {joining ? "Joining…" : "Join room"}
            </button>
          )}
          <button className="btn ghost wide" onClick={() => navigate("/")}>
            Back to home
          </button>
        </div>
      </main>
    );
  }

  switch (room.status) {
    case "waiting":
      return <Lobby room={room} roomId={roomId} uid={uid} onLeave={handleLeave} />;
    case "setup":
      return (
        <SetupBoard
          key={room.round}
          room={room}
          roomId={roomId}
          uid={uid}
          myCells={myCells}
          onSubmitted={(cells) => setStored({ roomId, round: room.round, cells })}
          onLeave={handleLeave}
        />
      );
    case "playing":
      return <PlayBoard room={room} roomId={roomId} uid={uid} myCells={myCells} onLeave={handleLeave} />;
    default:
      return <Result room={room} roomId={roomId} uid={uid} />;
  }
}
