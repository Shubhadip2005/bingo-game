/**
 * Pure board logic: lines, validation, helpers for filling a board.
 * No Firebase and no React in here, so it is easy to test.
 */

export const GRID_SIZES = [5, 6, 7, 8, 9, 10];

/** Firebase turns integer-keyed objects into arrays, so keys are prefixed with "n". */
export const callKey = (num: number): string => `n${num}`;

export function isCalled(called: Record<string, number>, num: number): boolean {
  return typeof called[callKey(num)] === "number";
}

/** Every line on an n x n board as lists of cell indexes (row-major). */
export function lineGroups(n: number, diagonals: boolean): number[][] {
  const groups: number[][] = [];
  for (let r = 0; r < n; r++) groups.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) groups.push(Array.from({ length: n }, (_, r) => r * n + c));
  if (diagonals) {
    groups.push(Array.from({ length: n }, (_, i) => i * n + i));
    groups.push(Array.from({ length: n }, (_, i) => i * n + (n - 1 - i)));
  }
  return groups;
}

export function completedLines(
  cells: number[],
  called: Record<string, number>,
  n: number,
  diagonals: boolean
): number[][] {
  return lineGroups(n, diagonals).filter((group) => group.every((i) => isCalled(called, cells[i])));
}

export function countLines(
  cells: number[],
  called: Record<string, number>,
  n: number,
  diagonals: boolean
): number {
  return completedLines(cells, called, n, diagonals).length;
}

/** Cell indexes that belong to at least one completed line (used for highlighting). */
export function litCells(
  cells: number[],
  called: Record<string, number>,
  n: number,
  diagonals: boolean
): Set<number> {
  const lit = new Set<number>();
  for (const group of completedLines(cells, called, n, diagonals)) group.forEach((i) => lit.add(i));
  return lit;
}

/** "Lines to win" choices for a grid size. Standard = n lines (5 lines on 5x5 = B-I-N-G-O). */
export function linesToWinOptions(n: number): { label: string; value: number }[] {
  return [
    { label: "Quick", value: n - 2 },
    { label: "Standard", value: n },
    { label: "Long", value: n + 2 },
  ];
}

// ---------- board setup helpers ----------

export type Draft = (number | null)[];

export function isCompleteBoard(draft: Draft, n: number): draft is number[] {
  if (draft.length !== n * n) return false;
  const seen = new Set<number>();
  for (const v of draft) {
    if (v === null || !Number.isInteger(v) || v < 1 || v > n * n || seen.has(v)) return false;
    seen.add(v);
  }
  return true;
}

export function unusedNumbers(draft: Draft, n: number): number[] {
  const used = new Set(draft.filter((v): v is number => v !== null));
  const free: number[] = [];
  for (let k = 1; k <= n * n; k++) if (!used.has(k)) free.push(k);
  return free;
}

/** Smallest number not on the board yet: 1 for the first click, 2 for the next, and so on. */
export function nextFreeNumber(draft: Draft, n: number): number | null {
  return unusedNumbers(draft, n)[0] ?? null;
}

export type EntryResult = { ok: true; value: number } | { ok: false; error: string };

/** Check a number typed into box `index`: whole number, in range, and unique. */
export function validateEntry(draft: Draft, index: number, raw: string, n: number): EntryResult {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return { ok: false, error: "Type a whole number." };
  const value = Number(text);
  if (value < 1 || value > n * n) return { ok: false, error: `Use a number from 1 to ${n * n}.` };
  if (draft.some((v, i) => i !== index && v === value)) {
    return { ok: false, error: `${value} is already in another box. Every number must be unique.` };
  }
  return { ok: true, value };
}

export function shuffled<T>(items: T[], rand: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Fill every empty box with the unused numbers in random order. */
export function randomFill(draft: Draft, n: number, rand: () => number = Math.random): Draft {
  const pool = shuffled(unusedNumbers(draft, n), rand);
  return draft.map((v) => (v === null ? (pool.pop() as number) : v));
}

export function emptyDraft(n: number): Draft {
  return Array.from({ length: n * n }, () => null);
}
