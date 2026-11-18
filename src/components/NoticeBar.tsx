import { useEffect, useState } from "react";
import type { BoardNotice, RoomNotices } from "../types";

const WATCH_WINDOW_MS = 60_000;

interface Props {
  notices: RoomNotices | null;
  /** set when an admin corrected THIS player's board */
  myNotice: BoardNotice | null;
}

interface Item {
  key: string;
  at: number;
  text: string;
  dismissible: boolean;
}

/** Tells players, openly, whenever an admin is looking at the game or has corrected a board. */
export default function NoticeBar({ notices, myNotice }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState<Record<string, number>>({});

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  const items: Item[] = [];
  // if (notices?.watching && now - notices.watching < WATCH_WINDOW_MS) {
  //   items.push({ key: "watching", at: 0, text: "An admin is viewing this game.", dismissible: false });
  // }
  // if (myNotice) {
  //   items.push({
  //     key: "swap",
  //     at: myNotice.at,
  //     text: `An admin swapped the numbers ${myNotice.a} and ${myNotice.b} on your board to fix a problem. Your lines have been updated.`,
  //     dismissible: true,
  //   });
  // } else if (notices?.note) {
  //   items.push({ key: "note", at: notices.note.at, text: "An admin made a correction to a board in this game.", dismissible: true });
  // }
  // if (notices?.message) {
  //   items.push({ key: "message", at: notices.message.at, text: `Message from the admin: ${notices.message.text}`, dismissible: true });
  // }

  const visible = items.filter((i) => !i.dismissible || i.at > (dismissed[i.key] ?? 0));
  if (visible.length === 0) return null;

  return (
    <div className="notice-stack" role="status">
      {visible.map((i) => (
        <div key={i.key} className="notice">
          <span>{i.text}</span>
          {i.dismissible && (
            <button className="notice-x" onClick={() => setDismissed((d) => ({ ...d, [i.key]: i.at }))}>
              Dismiss
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
