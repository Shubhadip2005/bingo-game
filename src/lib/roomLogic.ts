/**
 * Pure game-state transitions. Every function takes the current room and returns the
 * next room, or null when the action is not allowed. roomActions.ts runs these inside
 * Firebase transactions, so two players acting at the same moment can never corrupt
 * the game.
 */
import type { Player, RoomData, RoomOptions } from "../types";
import { callKey, isCalled } from "./bingoLogic";

export const cleanName = (name: string, fallback: string): string => name.trim().slice(0, 20) || fallback;

/** Firebase drops empty objects and nulls, so fill the defaults back in. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeRoom(raw: any): RoomData {
  const players: RoomData["players"] = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const [id, p] of Object.entries<any>(raw.players ?? {})) {
    players[id] = {
      id,
      name: String(p?.name ?? "Player"),
      joinedAt: Number(p?.joinedAt) || 0,
      ready: !!p?.ready,
      online: p?.online !== false,
    };
  }
  const gridSize = Number(raw.gridSize) || 5;
  return {
    gridSize,
    linesToWin: Number(raw.linesToWin) || gridSize,
    diagonals: raw.diagonals !== false,
    status: raw.status ?? "waiting",
    hostId: raw.hostId ?? "",
    round: Number(raw.round) || 1,
    players,
    turnId: raw.turnId ?? null,
    firstTurnId: raw.firstTurnId ?? null,
    called: raw.called ?? {},
    callCount: Number(raw.callCount) || 0,
    lastCall: raw.lastCall ?? null,
    awaiting: !!raw.awaiting,
    reports: raw.reports ?? {},
    winnerIds: raw.winnerIds ?? null,
    endReason: raw.endReason ?? null,
    createdAt: Number(raw.createdAt) || 0,
  };
}

export function makeRoom(hostId: string, hostName: string, opts: RoomOptions, now = Date.now()): RoomData {
  const gridSize = Math.min(10, Math.max(5, Math.round(opts.gridSize)));
  const linesToWin = Math.min(gridSize + 2, Math.max(3, Math.round(opts.linesToWin)));
  const host: Player = { id: hostId, name: cleanName(hostName, "Player 1"), joinedAt: now, ready: false, online: true };
  return {
    gridSize,
    linesToWin,
    diagonals: true, // rows, columns and both diagonals always count
    status: "waiting",
    hostId,
    round: 1,
    players: { [hostId]: host },
    turnId: null,
    firstTurnId: null,
    called: {},
    callCount: 0,
    lastCall: null,
    awaiting: false,
    reports: {},
    winnerIds: null,
    endReason: null,
    createdAt: now,
  };
}

export function otherPlayerId(room: RoomData, uid: string | null): string | null {
  return Object.keys(room.players).find((id) => id !== uid) ?? null;
}

function resetRound(room: RoomData): RoomData {
  const players: RoomData["players"] = {};
  for (const [id, p] of Object.entries(room.players)) players[id] = { ...p, ready: false };
  return {
    ...room,
    players,
    turnId: null,
    called: {},
    callCount: 0,
    lastCall: null,
    awaiting: false,
    reports: {},
    winnerIds: null,
    endReason: null,
  };
}

export function applyJoin(room: RoomData, player: Player): RoomData | null {
  if (room.players[player.id]) return room;
  if (room.status !== "waiting") return null;
  if (Object.keys(room.players).length >= 2) return null;
  return { ...room, players: { ...room.players, [player.id]: player } };
}

export function applyGuestLeave(room: RoomData, uid: string): RoomData | null {
  if (room.status !== "waiting" || uid === room.hostId || !room.players[uid]) return null;
  const players = { ...room.players };
  delete players[uid];
  return { ...room, players };
}

export function applyStart(room: RoomData, requesterId: string, rand: () => number = Math.random): RoomData | null {
  if (room.status !== "waiting" || room.hostId !== requesterId) return null;
  const ids = Object.keys(room.players);
  if (ids.length !== 2) return null;
  return { ...resetRound(room), status: "setup", firstTurnId: ids[rand() < 0.5 ? 0 : 1] };
}

/** A player confirmed their board. When both are ready the match begins. */
export function applyReady(room: RoomData, uid: string): RoomData | null {
  if (room.status !== "setup" || !room.players[uid]) return null;
  const players = { ...room.players, [uid]: { ...room.players[uid], ready: true } };
  const ids = Object.keys(players);
  const everyoneReady = ids.length === 2 && ids.every((id) => players[id].ready);
  if (!everyoneReady) return { ...room, players };
  return { ...room, players, status: "playing", turnId: room.firstTurnId ?? ids[0], awaiting: false };
}

/** The player whose turn it is picks a number. It is marked for both players. */
export function applyCall(room: RoomData, uid: string, num: number): RoomData | null {
  if (room.status !== "playing" || room.turnId !== uid || room.awaiting) return null;
  if (!Number.isInteger(num) || num < 1 || num > room.gridSize * room.gridSize) return null;
  if (isCalled(room.called, num)) return null;
  const callCount = room.callCount + 1;
  return {
    ...room,
    called: { ...room.called, [callKey(num)]: callCount },
    callCount,
    lastCall: { number: num, by: uid },
    awaiting: true,
  };
}

/**
 * Each player reports how many lines their own (hidden) board has after the latest call.
 * The report that arrives last settles the call: someone reached the target -> finished
 * (both reached it on the same number -> draw), otherwise the turn passes.
 */
export function applyReport(room: RoomData, uid: string, count: number, won: boolean): RoomData | null {
  if (room.status !== "playing" || !room.awaiting || count !== room.callCount || !room.players[uid]) return null;
  const reports = { ...room.reports, [uid]: { count, won } };
  const ids = Object.keys(room.players);
  const complete = ids.length === 2 && ids.every((id) => reports[id]?.count === room.callCount);
  if (!complete) return { ...room, reports };

  const winners = ids.filter((id) => reports[id].won);
  if (winners.length > 0) {
    return { ...room, reports, awaiting: false, status: "finished", winnerIds: winners, endReason: "lines" };
  }
  return { ...room, reports, awaiting: false, turnId: otherPlayerId(room, room.turnId) };
}

/** `loserId` leaves (or is declared gone), so the other player wins. */
export function applyForfeit(room: RoomData, loserId: string): RoomData | null {
  if ((room.status !== "setup" && room.status !== "playing") || !room.players[loserId]) return null;
  const winner = otherPlayerId(room, loserId);
  if (!winner) return null;
  return { ...room, status: "finished", awaiting: false, winnerIds: [winner], endReason: "forfeit" };
}

/** Play again: new round, empty boards, and the other player gets the first call. */
export function applyRematch(room: RoomData, uid: string): RoomData | null {
  if (room.status !== "finished" || !room.players[uid]) return null;
  if (Object.keys(room.players).length !== 2) return null;
  const first = otherPlayerId(room, room.firstTurnId) ?? Object.keys(room.players)[0];
  return { ...resetRound(room), status: "setup", round: room.round + 1, firstTurnId: first };
}
