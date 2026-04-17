// Conversation pinning persisted in localStorage (no DB schema change needed).
const KEY = "chat.pins";

export function getPins(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function isPinned(id: string): boolean {
  return getPins().includes(id);
}

export function togglePin(id: string): boolean {
  const pins = getPins();
  const i = pins.indexOf(id);
  if (i >= 0) {
    pins.splice(i, 1);
    localStorage.setItem(KEY, JSON.stringify(pins));
    return false;
  }
  pins.unshift(id);
  localStorage.setItem(KEY, JSON.stringify(pins));
  return true;
}
