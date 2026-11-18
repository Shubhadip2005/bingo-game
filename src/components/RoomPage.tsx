import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { BoardNotice, Player, RoomNotices } from "../types";
import { useRoom } from "../hooks/useRoom";
import { countLines } from "../lib/bingoLogic";
import {
  joinRoom, leaveGame, leaveLobby, reportLines, startPresence, subscribeToBoard, subscribeToNotices,
} from "../lib/roomActions";
import Lobby from "./Lobby";
import SetupBoard from "./SetupBoard";
import PlayBoard from "./PlayBoard";
import Result from "./Result";
import NoticeBar from "./NoticeBar";

interface Props {
  uid: string;
  name: string;
}

interface StoredBoard {
  roomId: string;
  round: number;
  cells: number[];
  notice: BoardNotice | null;
}

export default function RoomPage({ uid, name }: Props) {
  const { roomId: rawId = "" } = useParams();
  const roomId = rawId.toUpperCase();
  const navigate = useNavigate();
  const { room, error } = useRoom(roomId);

  const me: Player | undefined = room?.players[uid];
  const isPlayer = !!me && !me.left;

  const [stored, setStored] = useState<StoredBoard | null>(null);
  const [notices, setNotices] = useState<RoomNotices | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [tick, setTick] = useState(0);
  const lastReport = useRef({ key: "", at: 0 });

  // My own board for the current round (private; kept live so corrections show up straight away).
  const mine = stored && room && stored.roomId === roomId && stored.round === room.round ? stored : null;
  const myCells = mine?.cells ?? null;
  const myNotice = mine?.notice ?? null;

  // Show me as online while I'm in the room.
  useEffect(() => {
    if (!isPlayer) return;
    return startPresence(roomId, uid);
  }, [roomId, uid, isPlayer]);

  // Follow my board once it has been submitted.
  const round = room?.round;
  const boardActive = isPlayer && !!room && (room.status === "playing" || (room.status === "setup" && !!me?.ready));
  useEffect(() => {
    if (!boardActive || round === undefined) return;
    return subscribeToBoard(roomId, round, uid, (board) => setStored({ roomId, round, ...board }));
  }, [boardActive, roomId, round, uid]);

  // Notices about this room (an admin viewing, corrections, messages).
  useEffect(() => {
    if (!isPlayer) return;
    return subscribeToNotices(roomId, setNotices);
  }, [roomId, isPlayer]);

  // While a call is being checked, re-run the report effect every few seconds in case a write failed.
  useEffect(() => {
    if (room?.status !== "playing" || !room.awaiting) return;
    const timer = setInterval(() => setTick((t) => t + 1), 3000);
    return () => clearInterval(timer);
  }, [room?.status, room?.awaiting]);

  // After every call, report whether MY board has reached the target. The last report settles the call.
  useEffect(() => {
    if (!room || !isPlayer || !myCells) return;
    if (room.status !== "playing" || !room.awaiting) return;
    if (room.reports[uid]?.count === room.callCount) return;
    const key = `${roomId}:${room.round}:${room.callCount}`;
    const now = Date.now();
    if (lastReport.current.key === key && now - lastReport.current.at < 2500) return;
    lastReport.current = { key, at: now };
    const lines = countLines(myCells, room.called, room.gridSize, room.diagonals);
    reportLines(roomId, uid, room.callCount, lines >= room.linesToWin).catch(() => undefined);
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
      else if (room.status === "setup" || room.status === "playing") await leaveGame(roomId, uid);
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
          <p className="hint">This room doesn't exist or was closed. Check the code, or create a new room.</p>
          <button className="btn primary" onClick={() => navigate("/")}>
            Back to home
          </button>
        </div>
      </main>
    );
  }

  if (!isPlayer) {
    const canJoin = room.status === "waiting" && Object.keys(room.players).length < room.maxPlayers;
    return (
      <main className="page">
        <div className="card">
          <p className="label">Room {roomId}</p>
          <h2 className="title">{canJoin ? "Join this game" : "You can't join this game"}</h2>
          <p className="hint">
            {canJoin
              ? `${room.gridSize}×${room.gridSize} board, first to ${room.linesToWin} lines, up to ${room.maxPlayers} players. You'll join as ${name}.`
              : "The room is full, or the match has already started."}
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

  const bar = <NoticeBar notices={notices} myNotice={myNotice} />;

  switch (room.status) {
    case "waiting":
      return (
        <>
          {bar}
          <Lobby room={room} roomId={roomId} uid={uid} onLeave={handleLeave} />
        </>
      );
    case "setup":
      return (
        <>
          {bar}
          <SetupBoard
            key={room.round}
            room={room}
            roomId={roomId}
            uid={uid}
            myCells={myCells}
            onSubmitted={(cells) => setStored({ roomId, round: room.round, cells, notice: null })}
            onLeave={handleLeave}
          />
        </>
      );
    case "playing":
      return (
        <>
          {bar}
          <PlayBoard room={room} roomId={roomId} uid={uid} myCells={myCells} onLeave={handleLeave} />
        </>
      );
    default:
      return (
        <>
          {bar}
          <Result room={room} roomId={roomId} uid={uid} />
        </>
      );
  }
}
