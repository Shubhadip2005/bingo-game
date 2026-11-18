/** Everything that talks to Firebase. Game rules live in roomLogic.ts. */
import { ref, get, set, remove, runTransaction, onValue, onDisconnect } from "firebase/database";
import { db } from "../firebase";
import type { BoardNotice, Player, RoomData, RoomNotices, RoomOptions } from "../types";
import {
  applyCall, applyGuestLeave, applyJoin, applyLeave, applyReady, applyRematch, applyReport,
  applyStart, cleanName, makeRoom, normalizeRoom,
} from "./roomLogic";
import { generateRoomId } from "./session";

const roomRef = (roomId: string) => ref(db, `rooms/${roomId}`);
const boardRef = (roomId: string, round: number, uid: string) => ref(db, `boards/${roomId}/${round}/${uid}`);

/** Run a pure transition inside a Firebase transaction. Resolves true if it was applied. */
async function tx(roomId: string, change: (room: RoomData) => RoomData | null): Promise<boolean> {
  const result = await runTransaction(roomRef(roomId), (current) => {
    if (current === null) return current; // not cached yet: Firebase retries with the real value
    const next = change(normalizeRoom(current));
    return next === null ? undefined : next; // undefined = abort, the action is not allowed
  });
  return result.committed && result.snapshot.exists();
}

// ---------- rooms ----------

export async function createRoom(uid: string, name: string, opts: RoomOptions): Promise<string> {
  let roomId = generateRoomId();
  for (let attempt = 0; ; attempt++) {
    const snap = await get(roomRef(roomId));
    if (!snap.exists()) break;
    if (attempt >= 7) throw new Error("Could not find a free room code.");
    roomId = generateRoomId();
  }
  await set(roomRef(roomId), makeRoom(uid, name, opts));
  return roomId;
}

export type JoinResult = { ok: true } | { ok: false; error: string };

export async function joinRoom(roomId: string, uid: string, name: string): Promise<JoinResult> {
  const snap = await get(roomRef(roomId));
  if (!snap.exists()) return { ok: false, error: "Room not found. Check the code and try again." };
  const room = normalizeRoom(snap.val());
  if (room.players[uid]) return { ok: true };
  if (room.status !== "waiting") return { ok: false, error: "That game has already started." };
  if (Object.keys(room.players).length >= room.maxPlayers) return { ok: false, error: "That room is full." };

  const player: Player = {
    id: uid, name: cleanName(name, "Player"), joinedAt: Date.now(), ready: false, online: true, left: false,
  };
  const applied = await tx(roomId, (r) => applyJoin(r, player));
  return applied ? { ok: true } : { ok: false, error: "Couldn't join. The room may be full or already started." };
}

/** Host closes the room, a guest just steps out. Only meaningful while waiting. */
export async function leaveLobby(roomId: string, uid: string, isHost: boolean): Promise<void> {
  if (isHost) await remove(roomRef(roomId));
  else await tx(roomId, (r) => applyGuestLeave(r, uid));
}

export const startGame = (roomId: string, uid: string) => tx(roomId, (r) => applyStart(r, uid));
export const markReady = (roomId: string, uid: string) => tx(roomId, (r) => applyReady(r, uid));
export const callNumber = (roomId: string, uid: string, num: number) => tx(roomId, (r) => applyCall(r, uid, num));
export const reportLines = (roomId: string, uid: string, count: number, won: boolean) =>
  tx(roomId, (r) => applyReport(r, uid, count, won));
/** Leave a game in progress, or remove a player who went offline. The game goes on for everyone else. */
export const leaveGame = (roomId: string, playerId: string) => tx(roomId, (r) => applyLeave(r, playerId));
export const rematch = (roomId: string, uid: string) => tx(roomId, (r) => applyRematch(r, uid));

export function subscribeToRoom(
  roomId: string,
  onRoom: (room: RoomData | null) => void,
  onError: (message: string) => void
): () => void {
  return onValue(
    roomRef(roomId),
    (snap) => onRoom(snap.exists() ? normalizeRoom(snap.val()) : null),
    () => onError("Couldn't open this room. Check your connection and the Firebase rules.")
  );
}

// ---------- private boards ----------
// Boards live outside the room (boards/<room>/<round>/<uid>). The database rules only let
// the owner read their board until the room status becomes "finished".

export async function submitBoard(roomId: string, round: number, uid: string, cells: number[]): Promise<void> {
  const existing = await get(boardRef(roomId, round, uid));
  if (existing.exists()) return; // boards are write-once per round
  await set(boardRef(roomId, round, uid), { cells, createdAt: Date.now() });
}

export const toCells = (raw: unknown): number[] =>
  (Array.isArray(raw) ? raw : Object.values((raw ?? {}) as Record<string, unknown>)).map(Number);

export const toNotice = (raw: unknown): BoardNotice | null => {
  const v = raw as { at?: unknown; a?: unknown; b?: unknown } | null | undefined;
  return v && v.a !== undefined && v.b !== undefined ? { at: Number(v.at) || 0, a: Number(v.a), b: Number(v.b) } : null;
};

export async function fetchBoard(roomId: string, round: number, uid: string): Promise<number[] | null> {
  try {
    const snap = await get(boardRef(roomId, round, uid));
    if (!snap.exists()) return null;
    return toCells(snap.val()?.cells);
  } catch {
    return null; // not allowed yet (another player's board during the game) or offline
  }
}

/** Live view of my own board, so a correction made by an admin shows up straight away. */
export function subscribeToBoard(
  roomId: string,
  round: number,
  uid: string,
  onBoard: (board: { cells: number[]; notice: BoardNotice | null }) => void
): () => void {
  return onValue(
    boardRef(roomId, round, uid),
    (snap) => {
      if (!snap.exists()) return;
      const v = snap.val();
      onBoard({ cells: toCells(v.cells), notice: toNotice(v.notice) });
    },
    () => undefined
  );
}

/** Notices for a room (admin viewing, corrections, messages). Read-only for players. */
export function subscribeToNotices(roomId: string, onNotices: (notices: RoomNotices) => void): () => void {
  return onValue(
    ref(db, `roomNotices/${roomId}`),
    (snap) => {
      const v = snap.val() ?? {};
      onNotices({
        watching: typeof v.watching === "number" ? v.watching : null,
        note: v.note ? { at: Number(v.note.at) || 0 } : null,
        message: v.message?.text ? { text: String(v.message.text), at: Number(v.message.at) || 0 } : null,
      });
    },
    () => undefined
  );
}

// ---------- presence ----------

/** Marks the player online while connected and offline when the connection drops. */
export function startPresence(roomId: string, uid: string): () => void {
  const onlineRef = ref(db, `rooms/${roomId}/players/${uid}/online`);
  const unsubscribe = onValue(ref(db, ".info/connected"), (snap) => {
    if (snap.val() !== true) return;
    onDisconnect(onlineRef)
      .set(false)
      .then(() => set(onlineRef, true))
      .catch(() => undefined);
  });
  return () => {
    unsubscribe();
    onDisconnect(onlineRef).cancel().catch(() => undefined);
    set(onlineRef, false).catch(() => undefined);
  };
}
