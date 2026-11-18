/**
 * Pure game-state transitions for 2 to 5 players. Every function takes the current room and
 * returns the next room, or null when the action is not allowed. roomActions.ts runs these
 * inside Firebase transactions, so players acting at the same moment can never corrupt the game.
 */
import type { Player, RoomData, RoomOptions } from "../types";
import { MAX_GRID, MIN_GRID, callKey, isCalled, shuffled } from "./bingoLogic";

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

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
      left: !!p?.left,
    };
  }
  const gridSize = Number(raw.gridSize) || MIN_GRID;
  const rawOrder = raw.order;
  const order = (Array.isArray(rawOrder) ? rawOrder : Object.values(rawOrder ?? {})).map(String);
  return {
    ver: Number(raw.ver) || 1,
    gridSize,
    linesToWin: Number(raw.linesToWin) || gridSize,
    diagonals: raw.diagonals !== false,
    maxPlayers: Number(raw.maxPlayers) || MIN_PLAYERS,
    status: raw.status ?? "waiting",
    hostId: raw.hostId ?? "",
    round: Number(raw.round) || 1,
    players,
    order,
    turnId: raw.turnId ?? null,
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
  const gridSize = Math.min(MAX_GRID, Math.max(MIN_GRID, Math.round(opts.gridSize)));
  const linesToWin = Math.min(gridSize + 2, Math.max(3, Math.round(opts.linesToWin)));
  const maxPlayers = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.round(opts.maxPlayers)));
  const host: Player = {
    id: hostId, name: cleanName(hostName, "Player 1"), joinedAt: now, ready: false, online: true, left: false,
  };
  return {
    ver: 2,
    gridSize,
    linesToWin,
    diagonals: true, // rows, columns and both diagonals always count
    maxPlayers,
    status: "waiting",
    hostId,
    round: 1,
    players: { [hostId]: host },
    order: [],
    turnId: null,
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

// ---------- helpers ----------

/** Players still in the game (not left). */
export const activeIds = (room: RoomData): string[] =>
  Object.keys(room.players).filter((id) => !room.players[id].left);

/** Turn order without players who left. */
export const activeOrder = (room: RoomData): string[] =>
  room.order.filter((id) => room.players[id] && !room.players[id].left);

/** The next player after `fromId` who is still in the game. */
export function nextActive(room: RoomData, fromId: string): string | null {
  const order = room.order;
  const start = order.indexOf(fromId);
  for (let step = 1; step <= order.length; step++) {
    const id = order[(start + step) % order.length];
    if (room.players[id] && !room.players[id].left) return id;
  }
  return null;
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

// ---------- lobby ----------

export function applyJoin(room: RoomData, player: Player): RoomData | null {
  if (room.players[player.id]) return room;
  if (room.status !== "waiting") return null;
  if (Object.keys(room.players).length >= room.maxPlayers) return null;
  return { ...room, players: { ...room.players, [player.id]: player } };
}

export function applyGuestLeave(room: RoomData, uid: string): RoomData | null {
  if (room.status !== "waiting" || uid === room.hostId || !room.players[uid]) return null;
  const players = { ...room.players };
  delete players[uid];
  return { ...room, players };
}

/** Host starts once at least two players are in. The turn order is shuffled. */
export function applyStart(room: RoomData, requesterId: string, rand: () => number = Math.random): RoomData | null {
  if (room.status !== "waiting" || room.hostId !== requesterId) return null;
  const ids = Object.keys(room.players);
  if (ids.length < MIN_PLAYERS || ids.length > room.maxPlayers) return null;
  return { ...resetRound(room), status: "setup", order: shuffled(ids, rand) };
}

// ---------- setup ----------

/** A player confirmed their board. When every remaining player is ready the match begins. */
export function applyReady(room: RoomData, uid: string): RoomData | null {
  if (room.status !== "setup" || !room.players[uid] || room.players[uid].left) return null;
  const next: RoomData = { ...room, players: { ...room.players, [uid]: { ...room.players[uid], ready: true } } };
  const active = activeIds(next);
  const everyoneReady = active.length >= MIN_PLAYERS && active.every((id) => next.players[id].ready);
  if (!everyoneReady) return next;
  return { ...next, status: "playing", turnId: activeOrder(next)[0] ?? active[0], awaiting: false };
}

// ---------- playing ----------

/** The player whose turn it is picks a number. It is marked for everyone. */
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
 * Once every remaining player has reported for the latest call, settle it: anyone who reached
 * the target wins (several at once = a draw between them), otherwise the turn passes on.
 */
function settleCall(room: RoomData): RoomData {
  const active = activeIds(room);
  const complete = active.every((id) => room.reports[id]?.count === room.callCount);
  if (!complete) return room;
  const winners = active.filter((id) => room.reports[id].won);
  if (winners.length > 0) {
    return { ...room, awaiting: false, status: "finished", winnerIds: winners, endReason: "lines" };
  }
  return { ...room, awaiting: false, turnId: nextActive(room, room.turnId ?? "") };
}

/**
 * Each player reports only whether their own (hidden) board has reached the target after the
 * latest call. The line count itself is never shared.
 */
export function applyReport(room: RoomData, uid: string, count: number, won: boolean): RoomData | null {
  if (room.status !== "playing" || !room.awaiting || count !== room.callCount) return null;
  if (!room.players[uid] || room.players[uid].left) return null;
  return settleCall({ ...room, reports: { ...room.reports, [uid]: { count, won } } });
}

// ---------- leaving ----------

/**
 * A player leaves (or is removed because they went offline). The game carries on for everyone
 * else; if only one player is left, that player wins.
 */
export function applyLeave(room: RoomData, uid: string): RoomData | null {
  if (room.status !== "setup" && room.status !== "playing") return null;
  const player = room.players[uid];
  if (!player || player.left) return null;

  const next: RoomData = { ...room, players: { ...room.players, [uid]: { ...player, left: true, online: false } } };
  const active = activeIds(next);

  if (active.length < MIN_PLAYERS) {
    return { ...next, status: "finished", awaiting: false, winnerIds: active, endReason: "forfeit" };
  }
  if (next.status === "setup") {
    const everyoneReady = active.every((id) => next.players[id].ready);
    return everyoneReady
      ? { ...next, status: "playing", turnId: activeOrder(next)[0] ?? active[0], awaiting: false }
      : next;
  }
  if (next.awaiting) return settleCall(next); // the leaver's report is no longer needed
  if (next.turnId === uid) return { ...next, turnId: nextActive(next, uid) };
  return next;
}

// ---------- rematch ----------

/** Play again: new round, empty boards, a different player calls first. Players who left or went offline are dropped. */
export function applyRematch(room: RoomData, uid: string): RoomData | null {
  if (room.status !== "finished" || !room.players[uid] || room.players[uid].left) return null;
  const remaining = activeIds(room).filter((id) => id === uid || room.players[id].online);
  if (remaining.length < MIN_PLAYERS) return null;

  const players: RoomData["players"] = {};
  for (const id of remaining) players[id] = room.players[id];

  const kept = room.order.filter((id) => players[id]);
  const rotated = kept.length > 0 ? [...kept.slice(1), kept[0]] : [];
  for (const id of remaining) if (!rotated.includes(id)) rotated.push(id);

  return { ...resetRound({ ...room, players }), status: "setup", round: room.round + 1, order: rotated };
}
