import { describe, it, expect } from "vitest";
import {
  lineGroups, countLines, litCells, validateEntry, isCompleteBoard, randomFill, sequentialFill, emptyDraft,
  nextFreeNumber, callKey, linesToWinOptions,
} from "./bingoLogic";
import {
  makeRoom, applyJoin, applyStart, applyReady, applyCall, applyReport, applyLeave, applyRematch,
  applyGuestLeave, normalizeRoom, nextActive,
} from "./roomLogic";
import type { Player, RoomData } from "../types";

const calledOf = (...nums: number[]) => Object.fromEntries(nums.map((n, i) => [callKey(n), i + 1]));
const ordered = (n: number) => Array.from({ length: n * n }, (_, i) => i + 1);
const player = (id: string, joinedAt = 1): Player => ({ id, name: id, joinedAt, ready: false, online: true, left: false });
const OPTS = { gridSize: 5, linesToWin: 5, diagonals: true, maxPlayers: 2 };

describe("lines", () => {
  it("counts all lines, up to 25x25", () => {
    expect(lineGroups(5, true)).toHaveLength(12);
    expect(lineGroups(5, false)).toHaveLength(10);
    expect(lineGroups(10, true)).toHaveLength(22);
    expect(lineGroups(25, true)).toHaveLength(52);
  });
  it("counts completed rows, columns and diagonals", () => {
    const cells = ordered(5);
    expect(countLines(cells, calledOf(1, 2, 3, 4, 5), 5, true)).toBe(1);
    expect(countLines(cells, calledOf(1, 2, 3, 4, 5, 6, 11, 16, 21), 5, true)).toBe(2);
    expect(countLines(cells, calledOf(1, 7, 13, 19, 25), 5, true)).toBe(1);
    expect(countLines(cells, calledOf(1, 7, 13, 19, 25), 5, false)).toBe(0);
    expect(countLines(cells, calledOf(5, 9, 13, 17, 21), 5, true)).toBe(1);
  });
  it("works on a 25x25 board", () => {
    const cells = ordered(25);
    const row0 = Array.from({ length: 25 }, (_, i) => i + 1);
    expect(countLines(cells, calledOf(...row0), 25, true)).toBe(1);
    expect(countLines(cells, calledOf(...row0.slice(0, 24)), 25, true)).toBe(0);
  });
  it("lights up cells of completed lines", () => {
    const lit = litCells(ordered(5), calledOf(1, 2, 3, 4, 5), 5, true);
    expect([...lit].sort()).toEqual([0, 1, 2, 3, 4]);
  });
  it("offers line targets that suit the board size", () => {
    expect(linesToWinOptions(5).map((o) => o.value)).toEqual([3, 5, 7]);
    expect(linesToWinOptions(7).map((o) => o.value)).toEqual([4, 5, 7, 9]);
    expect(linesToWinOptions(25).map((o) => o.value)).toEqual([13, 23, 25, 27]);
    expect(linesToWinOptions(25).map((o) => o.key)).toEqual(["short", "quick", "standard", "long"]);
  });
});

describe("board setup", () => {
  it("auto-numbers 1, 2, 3 on each click", () => {
    const d = emptyDraft(5);
    expect(nextFreeNumber(d, 5)).toBe(1);
    d[10] = 1;
    d[3] = 2;
    expect(nextFreeNumber(d, 5)).toBe(3);
    d[3] = null;
    expect(nextFreeNumber(d, 5)).toBe(2);
  });
  it("rejects duplicates, out of range and non-numbers", () => {
    const d = emptyDraft(5);
    d[0] = 7;
    expect(validateEntry(d, 1, "7", 5).ok).toBe(false);
    expect(validateEntry(d, 0, "7", 5).ok).toBe(true);
    expect(validateEntry(d, 1, "26", 5).ok).toBe(false);
    expect(validateEntry(d, 1, "0", 5).ok).toBe(false);
    expect(validateEntry(d, 1, "abc", 5).ok).toBe(false);
    expect(validateEntry(d, 1, "-3", 5).ok).toBe(false);
    expect(validateEntry(d, 1, "25", 5)).toEqual({ ok: true, value: 25 });
    expect(validateEntry(emptyDraft(25), 0, "625", 25)).toEqual({ ok: true, value: 625 });
  });
  it("random and sequential fill produce valid boards for every size 5 to 25", () => {
    for (let n = 5; n <= 25; n++) {
      const d = emptyDraft(n);
      d[0] = n * n;
      expect(isCompleteBoard(randomFill(d, n), n)).toBe(true);
      expect(isCompleteBoard(sequentialFill(d, n), n)).toBe(true);
    }
  });
  it("incomplete or duplicated boards are not complete", () => {
    expect(isCompleteBoard(emptyDraft(5), 5)).toBe(false);
    const d = randomFill(emptyDraft(5), 5);
    d[0] = d[1];
    expect(isCompleteBoard(d, 5)).toBe(false);
  });
});

/** Room with `ids` joined, started in join order (rand 0.999 keeps the order), everyone ready. */
function playingRoom(ids: string[], overrides: Partial<typeof OPTS> = {}): RoomData {
  let room = makeRoom(ids[0], ids[0], { ...OPTS, maxPlayers: Math.max(2, ids.length), ...overrides }, 1000);
  ids.slice(1).forEach((id, i) => (room = applyJoin(room, player(id, 2 + i))!));
  room = applyStart(room, ids[0], () => 0.999)!;
  for (const id of ids) room = applyReady(room, id)!;
  return room;
}

/** Everyone reports for the current call; `winners` report true. */
function settle(room: RoomData, winners: string[] = []): RoomData {
  let r = room;
  for (const id of Object.keys(room.players)) {
    if (room.players[id].left) continue;
    r = applyReport(r, id, room.callCount, winners.includes(id))!;
  }
  return r;
}

describe("lobby", () => {
  it("allows up to maxPlayers and only while waiting", () => {
    let room = makeRoom("A", "Asha", { ...OPTS, maxPlayers: 3 });
    room = applyJoin(room, player("B"))!;
    room = applyJoin(room, player("C"))!;
    expect(applyJoin(room, player("D"))).toBeNull();
    expect(applyGuestLeave(room, "C")!.players["C"]).toBeUndefined();
    expect(applyGuestLeave(room, "A")).toBeNull(); // host can't just step out
  });
  it("a 2-player room is full after one guest", () => {
    const room = applyJoin(makeRoom("A", "Asha", OPTS), player("B"))!;
    expect(applyJoin(room, player("C"))).toBeNull();
  });
  it("only the host can start, and only with at least two players", () => {
    const solo = makeRoom("A", "Asha", { ...OPTS, maxPlayers: 4 });
    expect(applyStart(solo, "A")).toBeNull();
    const two = applyJoin(solo, player("B"))!;
    expect(applyStart(two, "B")).toBeNull();
    expect(applyStart(two, "A")!.status).toBe("setup");
  });
  it("host can start with fewer players than the maximum", () => {
    let room = makeRoom("A", "Asha", { ...OPTS, maxPlayers: 5 });
    room = applyJoin(room, player("B"))!;
    room = applyJoin(room, player("C"))!;
    const started = applyStart(room, "A", () => 0.999)!;
    expect(started.order).toEqual(["A", "B", "C"]);
  });
  it("clamps options", () => {
    const room = makeRoom("A", "  ", { gridSize: 99, linesToWin: 99, diagonals: false, maxPlayers: 9 });
    expect(room.gridSize).toBe(25);
    expect(room.linesToWin).toBe(27);
    expect(room.maxPlayers).toBe(5);
    expect(room.players["A"].name).toBe("Player 1");
    expect(room.diagonals).toBe(true);
    expect(makeRoom("A", "A", { ...OPTS, gridSize: 1, maxPlayers: 1 }).gridSize).toBe(5);
    expect(makeRoom("A", "A", { ...OPTS, maxPlayers: 1 }).maxPlayers).toBe(2);
  });
});

describe("setup", () => {
  it("starts playing only when every player is ready", () => {
    let room = makeRoom("A", "Asha", { ...OPTS, maxPlayers: 3 });
    room = applyJoin(room, player("B"))!;
    room = applyJoin(room, player("C"))!;
    room = applyStart(room, "A", () => 0.999)!;
    room = applyReady(room, "A")!;
    room = applyReady(room, "B")!;
    expect(room.status).toBe("setup");
    room = applyReady(room, "C")!;
    expect(room.status).toBe("playing");
    expect(room.turnId).toBe("A");
  });
  it("a player leaving during setup can let the rest begin", () => {
    let room = makeRoom("A", "Asha", { ...OPTS, maxPlayers: 3 });
    room = applyJoin(room, player("B"))!;
    room = applyJoin(room, player("C"))!;
    room = applyStart(room, "A", () => 0.999)!;
    room = applyReady(room, "A")!;
    room = applyReady(room, "B")!;
    room = applyLeave(room, "C")!; // C never finished their board
    expect(room.status).toBe("playing");
    expect(room.turnId).toBe("A");
  });
});

describe("playing", () => {
  it("rejects calls out of turn, repeated numbers, bad numbers and calls while checking", () => {
    const room = playingRoom(["A", "B"]);
    expect(applyCall(room, "B", 5)).toBeNull();
    expect(applyCall(room, "A", 0)).toBeNull();
    expect(applyCall(room, "A", 26)).toBeNull();
    expect(applyCall(room, "A", 1.5)).toBeNull();
    const called = applyCall(room, "A", 5)!;
    expect(called.awaiting).toBe(true);
    expect(applyCall(called, "A", 6)).toBeNull();
    expect(applyCall(called, "B", 6)).toBeNull();
  });
  it("passes the turn around the table after everyone reports", () => {
    let room = playingRoom(["A", "B", "C"]);
    const seen: string[] = [];
    for (let num = 1; num <= 6; num++) {
      seen.push(room.turnId!);
      room = settle(applyCall(room, room.turnId!, num)!);
      expect(room.status).toBe("playing");
    }
    expect(seen).toEqual(["A", "B", "C", "A", "B", "C"]);
  });
  it("waits for every player's report, and ignores stale ones", () => {
    let room = applyCall(playingRoom(["A", "B", "C"]), "A", 5)!;
    room = applyReport(room, "A", 1, false)!;
    room = applyReport(room, "B", 1, false)!;
    expect(room.awaiting).toBe(true);
    expect(applyReport(room, "C", 99, false)).toBeNull();
    room = applyReport(room, "C", 1, false)!;
    expect(room.awaiting).toBe(false);
    expect(room.turnId).toBe("B");
    expect(applyCall(room, "B", 5)).toBeNull(); // already called
  });
  it("one player reaching the target wins", () => {
    const room = settle(applyCall(playingRoom(["A", "B", "C"]), "A", 5)!, ["B"]);
    expect(room.status).toBe("finished");
    expect(room.winnerIds).toEqual(["B"]);
    expect(room.endReason).toBe("lines");
  });
  it("several players reaching the target on the same number is a draw between them", () => {
    const room = settle(applyCall(playingRoom(["A", "B", "C", "D"]), "A", 5)!, ["B", "D"]);
    expect(room.status).toBe("finished");
    expect([...room.winnerIds!].sort()).toEqual(["B", "D"]);
  });
  it("supports five players", () => {
    const room = settle(applyCall(playingRoom(["A", "B", "C", "D", "E"]), "A", 5)!, ["E"]);
    expect(room.winnerIds).toEqual(["E"]);
  });
});

describe("leaving", () => {
  it("the game goes on when someone leaves and others remain", () => {
    let room = playingRoom(["A", "B", "C"]);
    room = applyLeave(room, "B")!;
    expect(room.status).toBe("playing");
    room = settle(applyCall(room, "A", 5)!);
    expect(room.turnId).toBe("C"); // B is skipped
  });
  it("passes the turn on if the player whose turn it is leaves", () => {
    let room = playingRoom(["A", "B", "C"]);
    room = applyLeave(room, "A")!;
    expect(room.turnId).toBe("B");
  });
  it("settles a pending call when the missing reporter leaves", () => {
    let room = applyCall(playingRoom(["A", "B", "C"]), "A", 5)!;
    room = applyReport(room, "A", 1, false)!;
    room = applyReport(room, "B", 1, false)!;
    room = applyLeave(room, "C")!; // C never reported
    expect(room.awaiting).toBe(false);
    expect(room.turnId).toBe("B");
  });
  it("a leaver's win no longer counts", () => {
    let room = applyCall(playingRoom(["A", "B", "C"]), "A", 5)!;
    room = applyReport(room, "C", 1, true)!;
    room = applyLeave(room, "C")!;
    room = applyReport(room, "A", 1, false)!;
    room = applyReport(room, "B", 1, false)!;
    expect(room.status).toBe("playing");
  });
  it("the last player standing wins", () => {
    let room = playingRoom(["A", "B", "C"]);
    room = applyLeave(room, "A")!;
    room = applyLeave(room, "B")!;
    expect(room.status).toBe("finished");
    expect(room.winnerIds).toEqual(["C"]);
    expect(room.endReason).toBe("forfeit");
    expect(applyLeave(room, "C")).toBeNull();
  });
  it("nextActive skips players who left", () => {
    const room = applyLeave(playingRoom(["A", "B", "C"]), "B")!;
    expect(nextActive(room, "A")).toBe("C");
    expect(nextActive(room, "C")).toBe("A");
  });
});

describe("rematch", () => {
  it("starts a new round, rotates who goes first and clears ready flags", () => {
    const finished = settle(applyCall(playingRoom(["A", "B", "C"]), "A", 5)!, ["A"]);
    const next = applyRematch(finished, "B")!;
    expect(next.status).toBe("setup");
    expect(next.round).toBe(2);
    expect(next.order).toEqual(["B", "C", "A"]);
    expect(next.called).toEqual({});
    expect(Object.values(next.players).every((p) => !p.ready)).toBe(true);
    expect(applyRematch(playingRoom(["A", "B"]), "A")).toBeNull(); // not finished
  });
  it("drops players who left or went offline", () => {
    let finished = settle(applyCall(playingRoom(["A", "B", "C", "D"]), "A", 5)!, ["A"]);
    finished = { ...finished, players: { ...finished.players, C: { ...finished.players.C, online: false } } };
    const next = applyRematch(finished, "A")!;
    expect(Object.keys(next.players).sort()).toEqual(["A", "B", "D"]);
  });
  it("needs at least two players", () => {
    let finished = settle(applyCall(playingRoom(["A", "B"]), "A", 5)!, ["A"]);
    finished = { ...finished, players: { ...finished.players, B: { ...finished.players.B, online: false } } };
    expect(applyRematch(finished, "A")).toBeNull();
  });
});

describe("normalizeRoom", () => {
  it("fills defaults after Firebase strips empty values", () => {
    const room = normalizeRoom({ gridSize: 6, status: "playing", hostId: "A", players: { A: { name: "Asha" } } });
    expect(room.called).toEqual({});
    expect(room.reports).toEqual({});
    expect(room.order).toEqual([]);
    expect(room.winnerIds).toBeNull();
    expect(room.diagonals).toBe(true);
    expect(room.maxPlayers).toBe(2);
    expect(room.players["A"].online).toBe(true);
    expect(room.players["A"].left).toBe(false);
  });
  it("reads the turn order whether Firebase returns an array or an object", () => {
    expect(normalizeRoom({ players: {}, order: ["A", "B"] }).order).toEqual(["A", "B"]);
    expect(normalizeRoom({ players: {}, order: { 0: "A", 1: "B" } }).order).toEqual(["A", "B"]);
  });
});

describe("room version", () => {
  it("new rooms are marked as version 2 and old rooms read as version 1", () => {
    expect(makeRoom("A", "Asha", OPTS).ver).toBe(2);
    expect(normalizeRoom({ gridSize: 5, players: {} }).ver).toBe(1);
  });
});
