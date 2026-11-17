import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MAX_GRID, MIN_GRID, linesToWinOptions, type LineKey } from "../lib/bingoLogic";
import { createRoom, joinRoom } from "../lib/roomActions";
import { MAX_PLAYERS, MIN_PLAYERS } from "../lib/roomLogic";

interface Props {
  uid: string;
  name: string;
  onChangeName: () => void;
}

const PLAYER_CHOICES = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i);

export default function Home({ uid, name, onChangeName }: Props) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [gridSize, setGridSize] = useState(5);
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [lineKey, setLineKey] = useState<LineKey>("standard");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lineOptions = linesToWinOptions(gridSize);
  const chosen = lineOptions.find((o) => o.key === lineKey) ?? lineOptions.find((o) => o.key === "standard")!;
  const linesToWin = chosen.value;

  function switchMode(next: "create" | "join") {
    setMode(next);
    setError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const roomId = await createRoom(uid, name, { gridSize, linesToWin, diagonals: true, maxPlayers });
      navigate(`/room/${roomId}`);
    } catch (err) {
      console.error(err);
      setError("Couldn't create the room. Check your connection and the Firebase setup, then try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    const roomId = code.trim().toUpperCase();
    if (!roomId) {
      setError("Enter the room code your friend shared.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await joinRoom(roomId, uid, name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      navigate(`/room/${roomId}`);
    } catch (err) {
      console.error(err);
      setError("Couldn't join the room. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <header className="hero compact">
        <h1 className="logo small">Bingo Duel</h1>
        <p className="tagline">
          Playing as <strong>{name}</strong>.{" "}
          <button type="button" className="link" onClick={onChangeName}>
            Change name
          </button>
        </p>
      </header>

      <div className="card">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={mode === "create"} className={mode === "create" ? "tab active" : "tab"} onClick={() => switchMode("create")}>
            Create room
          </button>
          <button role="tab" aria-selected={mode === "join"} className={mode === "join" ? "tab active" : "tab"} onClick={() => switchMode("join")}>
            Join room
          </button>
        </div>

        {mode === "create" ? (
          <form onSubmit={handleCreate}>
            <label className="label" htmlFor="size">
              Board size: {gridSize}×{gridSize}, {gridSize * gridSize} boxes
            </label>
            <input
              id="size"
              type="range"
              className="range"
              min={MIN_GRID}
              max={MAX_GRID}
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
            />
            <div className="range-ends">
              <span>{MIN_GRID}×{MIN_GRID}</span>
              <span>{MAX_GRID}×{MAX_GRID}</span>
            </div>

            <p className="label">Players (up to)</p>
            <div className="seg four">
              {PLAYER_CHOICES.map((p) => (
                <button
                  type="button"
                  key={p}
                  className={p === maxPlayers ? "seg-btn active" : "seg-btn"}
                  onClick={() => setMaxPlayers(p)}
                >
                  <span className="seg-main">{p}</span>
                  <span className="seg-sub">players</span>
                </button>
              ))}
            </div>

            <p className="label">Lines needed to win</p>
            <div className="seg" style={{ gridTemplateColumns: `repeat(${lineOptions.length}, 1fr)` }}>
              {lineOptions.map((o) => (
                <button
                  type="button"
                  key={o.key}
                  className={o.value === linesToWin ? "seg-btn active" : "seg-btn"}
                  onClick={() => setLineKey(o.key)}
                >
                  <span className="seg-main">{o.label}</span>
                  <span className="seg-sub">{o.value} lines</span>
                </button>
              ))}
            </div>

            <p className="hint">
              The first player to complete {linesToWin} lines wins. Rows, columns and diagonals all count. If several
              players get there on the same number, they draw. The host can start once at least 2 players have joined.
            </p>

            {error && <p className="error">{error}</p>}
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create room"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin}>
            <label className="label" htmlFor="code">
              Room code
            </label>
            <input
              id="code"
              className="input code"
              value={code}
              maxLength={6}
              autoCapitalize="characters"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="K7QXM"
            />
            {error && <p className="error">{error}</p>}
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "Joining…" : "Join room"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
