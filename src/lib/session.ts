const NAME_KEY = "bingo:name";
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid mix-ups

export function getName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* private mode: the name just won't be remembered */
  }
}

export function clearName(): void {
  try {
    localStorage.removeItem(NAME_KEY);
  } catch {
    /* ignore */
  }
}

export function generateRoomId(length = 5): string {
  let id = "";
  for (let i = 0; i < length; i++) id += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  return id;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
