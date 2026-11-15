# Bingo Duel

A real-time, two-player Bingo game. Each player secretly arranges their own board, then both call
numbers in turn. A called number is marked on **both** boards. First to complete the required number of
lines wins. If both get there on the same number, it's a draw. When the game ends, both boards are
revealed along with the order the numbers were called.

Built with Vite, React, TypeScript and Firebase (Realtime Database + Anonymous Auth).

## Rules

1. Enter your name, then **create** a room or **join** one with its 5-letter code (or invite link).
2. The creator picks a board size (5x5 = 25 boxes up to 10x10 = 100 boxes), how many lines are needed
   (Quick = N-2, Standard = N, Long = N+2) and whether diagonals count. Two players only.
3. When the second player has joined, the creator presses **Start game**.
4. Both players arrange their own board: tap an empty box to place the next number (1, 2, 3 ...),
   tap a placed number to change or remove it. Every number from 1 to N x N must be used exactly once.
   Press **I'm ready**. The board is then locked.
5. Players take turns picking any uncalled number from their own board. It is marked on both boards.
6. Rows, columns (and diagonals, if enabled) fully marked count as lines. First to the target wins;
   both reaching it on the same number is a draw.
7. After the game both boards are shown, with call order numbers. **Play again** starts a new round
   and the other player calls first.

## Set up Firebase (one time, about 5 minutes)

1. <https://console.firebase.google.com> -> **Add project**.
2. **Build -> Realtime Database -> Create database** (any region). Start in locked mode.
3. **Build -> Authentication -> Get started -> Sign-in method -> Anonymous -> Enable.**
4. Realtime Database -> **Rules** tab: paste the contents of `database.rules.json` and **Publish**.
5. **Project settings -> General -> Your apps -> Web (</>)**: register an app and copy the config values.
   The database URL is shown at the top of the Realtime Database page
   (`https://<project>-default-rtdb.<region>.firebasedatabase.app`).
6. Copy `.env.example` to `.env` and fill in the five values.

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL in **two browser tabs**. In development each tab is a separate player, so you can
test a full match alone. (In production a player is remembered per browser, so use two devices or
two browsers.)

```bash
npm test          # unit tests for the board and game rules
npm run build     # type-check and build to dist/
```

## Deploy on Vercel

1. Push this folder to a GitHub repository (`.env` is git-ignored, never commit it).
2. Vercel -> **Add New -> Project** -> import the repo. Framework preset: **Vite**.
3. **Environment Variables**: add the same five `VITE_FIREBASE_*` values from your `.env`.
4. Deploy. `vercel.json` makes invite links like `/room/ABCDE` work on refresh.
5. If sign-in ever fails with an `unauthorized-domain` error, add your Vercel domain under
   Firebase Console -> Authentication -> Settings -> Authorized domains.

## How it works

```
src/
  lib/bingoLogic.ts   pure board rules: lines, unique-number checks, random fill
  lib/roomLogic.ts    pure game state machine: join, start, ready, call, report, forfeit, rematch
  lib/roomActions.ts  Firebase reads/writes; runs roomLogic inside transactions
  lib/bingo.test.ts   tests for both logic files
  hooks/              useAuth (anonymous sign-in), useRoom (live room subscription)
  components/         Welcome, Home, Lobby, SetupBoard, PlayBoard, Result, RoomPage, BoardGrid
```

Room states: `waiting` -> `setup` -> `playing` -> `finished` (then `setup` again on a rematch).

**Hidden boards.** Public game state lives at `rooms/<code>`. Each board lives separately at
`boards/<code>/<round>/<uid>`. The database rules only let the owner read their board until the room
is `finished`, so the opponent can't peek, not even from the browser's network tab. Boards are
write-once per round, so nobody can edit a board after pressing Ready.

**Calling a number.** The player whose turn it is runs a transaction that marks the number and sets
`awaiting`. Each client then counts the lines on its own private board and reports the number. The report
that arrives last settles the call atomically: someone reached the target -> finished (both -> draw),
otherwise the turn passes.

**Fair play.** A modified client could report a false line count. When the game ends both boards are
revealed and the result screen recounts lines from the real boards, so a false win is visible.
For a stricter setup, move the settle step into a Cloud Function.

## Ideas for later

- Turn timer that auto-picks a number for a slow player.
- Delete old rooms and boards automatically (a scheduled Cloud Function, or by hand in the console).
- Reactions or quick chat, sound effects, win streak across rematches.
