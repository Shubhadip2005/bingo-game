export type RoomStatus = "waiting" | "setup" | "playing" | "finished";
export type EndReason = "lines" | "forfeit";

export interface Player {
  id: string;
  name: string;
  joinedAt: number;
  ready: boolean;
  online: boolean;
}

/** A player's report of how many lines they have completed after a given call. */
export interface Report {
  count: number;
  won: boolean;
}

export interface LastCall {
  number: number;
  by: string;
}

export interface RoomOptions {
  gridSize: number;
  linesToWin: number;
  diagonals: boolean;
}

export interface RoomData extends RoomOptions {
  status: RoomStatus;
  hostId: string;
  round: number;
  players: Record<string, Player>;
  turnId: string | null;
  firstTurnId: string | null;
  /** callKey(number) -> order in which it was called (1, 2, 3 ...) */
  called: Record<string, number>;
  callCount: number;
  lastCall: LastCall | null;
  /** true while both players are confirming their line counts for the latest call */
  awaiting: boolean;
  reports: Record<string, Report>;
  winnerIds: string[] | null;
  endReason: EndReason | null;
  createdAt: number;
}
