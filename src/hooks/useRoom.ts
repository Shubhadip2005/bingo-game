import { useEffect, useState } from "react";
import type { RoomData } from "../types";
import { subscribeToRoom } from "../lib/roomActions";

/** room: undefined = loading, null = does not exist. */
export function useRoom(roomId: string): { room: RoomData | null | undefined; error: string | null } {
  const [room, setRoom] = useState<RoomData | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRoom(undefined);
    setError(null);
    return subscribeToRoom(roomId, setRoom, setError);
  }, [roomId]);

  return { room, error };
}
