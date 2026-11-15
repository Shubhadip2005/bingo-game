import { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { clearName, getName, saveName } from "./lib/session";
import Welcome from "./components/Welcome";
import Home from "./components/Home";
import RoomPage from "./components/RoomPage";

export default function App() {
  const { uid, error } = useAuth();
  const [name, setName] = useState(getName());
  const [editingName, setEditingName] = useState(false);

  if (!name || editingName) {
    return (
      <Welcome
        initialName={name}
        onEnter={(n) => {
          saveName(n);
          setName(n);
          setEditingName(false);
        }}
      />
    );
  }

  if (error) {
    return (
      <main className="page">
        <div className="card">
          <h2 className="title">Can't connect</h2>
          <p className="error">{error}</p>
        </div>
      </main>
    );
  }

  if (!uid) {
    return (
      <main className="page">
        <p className="center-msg">Connecting…</p>
      </main>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Home
            uid={uid}
            name={name}
            onChangeName={() => {
              clearName();
              setEditingName(true);
            }}
          />
        }
      />
      <Route path="/room/:roomId" element={<RoomPage uid={uid} name={name} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
