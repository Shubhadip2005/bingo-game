import { useState } from "react";

interface Props {
  initialName?: string;
  onEnter: (name: string) => void;
}

export default function Welcome({ initialName = "", onEnter }: Props) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim().slice(0, 20);
    if (clean.length < 2) {
      setError("Enter a name with at least 2 characters.");
      return;
    }
    onEnter(clean);
  }

  return (
    <main className="page">
      <header className="hero">
        <div className="balls" aria-hidden="true">
          {["B", "I", "N", "G", "O"].map((l) => (
            <span key={l} className="ball">
              {l}
            </span>
          ))}
        </div>
        <h1 className="logo">Bingo Duel</h1>
        <p className="tagline">
          2 to 5 players, one secret board each. Call numbers in turn and finish your lines before everyone else does.
        </p>
      </header>

      <form className="card" onSubmit={submit}>
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          className="input"
          autoFocus
          maxLength={20}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="What should your opponent call you?"
        />
        {error && <p className="error">{error}</p>}
        <button className="btn primary" type="submit">
          Enter
        </button>
      </form>
    </main>
  );
}
