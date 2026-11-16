import { describe, it, expect } from "vitest";
import {
  lineGroups, countLines, litCells, validateEntry, isCompleteBoard, randomFill, emptyDraft,
  nextFreeNumber, callKey, linesToWinOptions,
} from "./bingoLogic";
import {
  makeRoom, applyJoin, applyStart, applyReady, applyCall, applyReport, applyForfeit, applyRematch,
  applyGuestLeave, normalizeRoom,
} from "./roomLogic";
import type { Player, RoomData } from "../types";

const calledOf = (...nums: number[]) => Object.fromEntries(nums.map((n, i) => [callKey(n), i + 1]));
const ordered = (n: number) => Array.from({ length: n * n }, (_, i) => i + 1);

describe("lines", () => {
  it("counts all lines", () => {
    expect(lineGroups(5, true)).toHaveLength(12);
    expect(lineGroups(5, false)).toHaveLength(10);
    expect(lineGroups(10, true)).toHaveLength(22);
  });
  it("counts completed rows, columns and diagonals", () => {
    const cells = ordered(5);
    expect(countLines(cells, calledOf(1, 2, 3, 4, 5), 5, true)).toBe(1); // row 0
    expect(countLines(cells, calledOf(1, 2, 3, 4, 5, 6, 11, 16, 21), 5, true)).toBe(2); // row 0 + col 0
    expect(countLines(cells, calledOf(1, 7, 13, 19, 25), 5, true)).toBe(1); // diagonal
    expect(countLines(cells, calledOf(1, 7, 13, 19, 25), 5, false)).toBe(0); // diagonals off
    expect(countLines(cells, calledOf(5, 9, 13, 17, 21), 5, true)).toBe(1); // anti-diagonal
  });
  it("lights up cells of completed lines", () => {
    const lit = litCells(ordered(5), calledOf(1, 2, 3, 4, 5), 5, true);
    expect([...lit].sort()).toEqual([0, 1, 2, 3, 4]);
  });
  it("offers quick / standard / long", () => {
    expect(linesToWinOptions(7).map((o) => o.value)).toEqual([5, 7, 9]);
  });
});

describe("board setup", () => {
  it("auto-numbers 1, 2, 3 on each click", () => {
    const d = emptyDraft(5);
    expect(nextFreeNumber(d, 5)).toBe(1);
    d[10] = 1;
    d[3] = 2;
    expect(nextFreeNumber(d, 5)).toBe(3);
    d[3] = null; // remove a number: it becomes free again
    expect(nextFreeNumber(d, 5)).toBe(2);
  });
  it("rejects duplicates, out of range and non-numbers", () => {
    const d = emptyDraft(5);
    d[0] = 7;
    expect(validateEntry(d, 1, "7", 5).ok).toBe(false); // duplicate
    expect(validateEntry(d, 0, "7", 5).ok).toBe(true); // same box keeps its own number
    expect(validateEntry(d, 1, "26", 5).ok).toBe(false);
    expect(validateEntry(d, 1, "0", 5).ok).toBe(false);
    expect(validateEntry(d, 1, "abc", 5).ok).toBe(false);
    expect(validateEntry(d, 1, "-3", 5).ok).toBe(false);
    expect(validateEntry(d, 1, "25", 5)).toEqual({ ok: true, value: 25 });
  });
  it("random fill produces a valid board for every size", () => {
    for (const n of [5, 6, 7, 8, 9, 10]) {
      const d = emptyDraft(n);
      d[0] = n * n;
      expect(isCompleteBoard(randomFill(d, n), n)).toBe(true);
    }
  });
  it("incomplete or duplicated boards are not complete", () => {
    expect(isCompleteBoard(emptyDraft(5), 5)).toBe(false);
    const d = randomFill(emptyDraft(5), 5);
    d[0] = d[1];
    expect(isCompleteBoard(d, 5)).toBe(false);
  });
});

function startedRoom(opts = { gridSize: 5, linesToWin: 5, diagonals: true }): RoomData {
  const host = "A";
  let room = makeRoom(host, "Asha", opts, 1000);
  const guest: Player = { id: "B", name: "Bikram", joinedAt: 2000, ready: false, online: true };
  room = applyJoin(room, guest)!;
  room = applyStart(room, "A", () => 0)!; // A goes first
  room = applyReady(room, "A")!;
  room = applyReady(room, "B")!;
  return room;
}

describe("room flow", () => {
  it("only allows two players and only while waiting", () => {
    const room = makeRoom("A", "Asha", { gridSize: 5, linesToWin: 5, diagonals: true });
    const withB = applyJoin(room, { id: "B", name: "B", joinedAt: 1, ready: false, online: true })!;
    expect(applyJoin(withB, { id: "C", name: "C", joinedAt: 2, ready: false, online: true })).toBeNull();
    expect(applyGuestLeave(withB, "B")!.players["B"]).toBeUndefined();
  });
  it("only the host can start, and only with two players", () => {
    const room = makeRoom("A", "Asha", { gridSize: 5, linesToWin: 5, diagonals: true });
    expect(applyStart(room, "A")).toBeNull();
    const withB = applyJoin(room, { id: "B", name: "B", joinedAt: 1, ready: false, online: true })!;
    expect(applyStart(withB, "B")).toBeNull();
    expect(applyStart(withB, "A")!.status).toBe("setup");
  });
  it("starts playing only when both players are ready", () => {
    let room = makeRoom("A", "Asha", { gridSize: 5, linesToWin: 5, diagonals: true });
    room = applyJoin(room, { id: "B", name: "B", joinedAt: 1, ready: false, online: true })!;
    room = applyStart(room, "A", () => 0.9)!; // B first
    room = applyReady(room, "A")!;
    expect(room.status).toBe("setup");
    room = applyReady(room, "B")!;
    expect(room.status).toBe("playing");
    expect(room.turnId).toBe("B");
  });
  it("rejects calls out of turn, repeated numbers, bad numbers and calls while checking", () => {
    const room = startedRoom();
    expect(applyCall(room, "B", 5)).toBeNull();
    expect(applyCall(room, "A", 0)).toBeNull();
    expect(applyCall(room, "A", 26)).toBeNull();
    expect(applyCall(room, "A", 1.5)).toBeNull();
    const called = applyCall(room, "A", 5)!;
    expect(called.awaiting).toBe(true);
    expect(applyCall(called, "A", 6)).toBeNull(); // still checking
    expect(applyCall(called, "B", 6)).toBeNull();
  });
  it("passes the turn after both players report and nobody has won", () => {
    let room = applyCall(startedRoom(), "A", 5)!;
    room = applyReport(room, "A", 1, false)!;
    expect(room.awaiting).toBe(true);
    expect(applyReport(room, "B", 99, false)).toBeNull(); // stale report
    room = applyReport(room, "B", 1, false)!;
    expect(room.awaiting).toBe(false);
    expect(room.turnId).toBe("B");
    expect(applyCall(room, "B", 5)).toBeNull(); // already called
    expect(applyCall(room, "B", 6)).not.toBeNull();
  });
  it("one player reaching the target wins", () => {
    let room = applyCall(startedRoom(), "A", 5)!;
    room = applyReport(room, "B", 1, false)!;
    room = applyReport(room, "A", 1, true)!;
    expect(room.status).toBe("finished");
    expect(room.winnerIds).toEqual(["A"]);
    expect(room.endReason).toBe("lines");
  });
  it("both reaching the target on the same number is a draw", () => {
    let room = applyCall(startedRoom(), "A", 5)!;
    room = applyReport(room, "A", 1, true)!;
    room = applyReport(room, "B", 1, true)!;
    expect(room.status).toBe("finished");
    expect([...room.winnerIds!].sort()).toEqual(["A", "B"]);
  });
  it("forfeit gives the win to the other player", () => {
    const room = applyForfeit(startedRoom(), "A")!;
    expect(room.status).toBe("finished");
    expect(room.winnerIds).toEqual(["B"]);
    expect(room.endReason).toBe("forfeit");
    expect(applyForfeit(room, "A")).toBeNull();
  });
  it("rematch starts a new round and swaps who goes first", () => {
    let room = applyCall(startedRoom(), "A", 5)!;
    room = applyReport(room, "A", 1, true)!;
    room = applyReport(room, "B", 1, false)!;
    const next = applyRematch(room, "B")!;
    expect(next.status).toBe("setup");
    expect(next.round).toBe(2);
    expect(next.firstTurnId).toBe("B");
    expect(next.called).toEqual({});
    expect(Object.values(next.players).every((p) => !p.ready)).toBe(true);
    expect(applyRematch(startedRoom(), "A")).toBeNull(); // not finished
  });
  it("normalizes rooms after Firebase strips empty values", () => {
    const room = normalizeRoom({ gridSize: 6, status: "playing", hostId: "A", players: { A: { name: "Asha" } } });
    expect(room.called).toEqual({});
    expect(room.reports).toEqual({});
    expect(room.winnerIds).toBeNull();
    expect(room.diagonals).toBe(true);
    expect(room.players["A"].online).toBe(true);
  });
  it("clamps room options", () => {
    const room = makeRoom("A", "  ", { gridSize: 40, linesToWin: 99, diagonals: false });
    expect(room.gridSize).toBe(10);
    expect(room.linesToWin).toBe(12);
    expect(room.players["A"].name).toBe("Player 1");
    expect(room.diagonals).toBe(true); // diagonals always count
  });
});