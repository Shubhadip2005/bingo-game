import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GRID_SIZES, linesToWinOptions } from "../lib/bingoLogic";
import { createRoom, joinRoom } from "../lib/roomActions";

interface Props {
  uid: string;
  name: string;
  onChangeName: () => void;
}

export default function Home({ uid, name, onChangeName }: Props) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [gridSize, setGridSize] = useState(5);
  const [lineMode, setLineMode] = useState(1); // index into linesToWinOptions: 1 = Standard
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lineOptions = linesToWinOptions(gridSize);
  const linesToWin = lineOptions[lineMode].value;

  function switchMode(next: "create" | "join") {
    setMode(next);
    setError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const roomId = await createRoom(uid, name, { gridSize, linesToWin, diagonals: true });
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
            <p className="label">Board size</p>
            <div className="seg six">
              {GRID_SIZES.map((n) => (
                <button
                  type="button"
                  key={n}
                  className={n === gridSize ? "seg-btn active" : "seg-btn"}
                  onClick={() => setGridSize(n)}
                >
                  <span className="seg-main">
                    {n}×{n}
                  </span>
                  <span className="seg-sub">{n * n} boxes</span>
                </button>
              ))}
            </div>

            <p className="label">Lines needed to win</p>
            <div className="seg three">
              {lineOptions.map((o, i) => (
                <button
                  type="button"
                  key={o.label}
                  className={i === lineMode ? "seg-btn active" : "seg-btn"}
                  onClick={() => setLineMode(i)}
                >
                  <span className="seg-main">{o.label}</span>
                  <span className="seg-sub">{o.value} lines</span>
                </button>
              ))}
            </div>

            <p className="hint">
              The first player to complete {linesToWin} lines wins. Rows, columns and diagonals all count. If you both
              get there on the same number, it's a draw.
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
