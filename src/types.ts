export type RoomStatus = "waiting" | "setup" | "playing" | "finished";
export type EndReason = "lines" | "forfeit";

export interface Player {
  id: string;
  name: string;
  joinedAt: number;
  ready: boolean;
  online: boolean;
  /** true once the player has left a game in progress (they are skipped from then on) */
  left: boolean;
}

/**
 * A player's report after a call: only whether they have reached the winning number of lines.
 * The actual line count is never shared, so nobody can see how close the opponent is.
 */
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
  /** 2 to 5 */
  maxPlayers: number;
}

export interface RoomData extends RoomOptions {
  /** 2 = created by a game version that shows players admin notices */
  ver: number;
  status: RoomStatus;
  hostId: string;
  round: number;
  players: Record<string, Player>;
  /** turn order for the current round; order[0] calls first */
  order: string[];
  turnId: string | null;
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

/** Shown only to the player whose board an admin corrected (stored on that player's private board). */
export interface BoardNotice {
  at: number;
  a: number;
  b: number;
}

/** Public notices for a room. Only admins can write these, players only read them. */
export interface RoomNotices {
  /** server time (ms) of the last moment an admin was viewing the game */
  watching: number | null;
  /** set when an admin corrected any board in this game */
  note: { at: number } | null;
  message: { text: string; at: number } | null;
}
