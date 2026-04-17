// Lightweight wrapper around the browser Notification API.
// Only fires when the tab is hidden (otherwise the user already sees it).
let permissionAsked = false;

export async function ensurePermission(): Promise<boolean> {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  if (permissionAsked) return false;
  permissionAsked = true;
  try {
    const r = await Notification.requestPermission();
    return r === "granted";
  } catch {
    return false;
  }
}

export async function notifyDone(title: string, body: string) {
  if (typeof document !== "undefined" && !document.hidden) return;
  const ok = await ensurePermission();
  if (!ok) return;
  try {
    const n = new Notification(title, {
      body: body.slice(0, 140),
      icon: "/favicon.ico",
      tag: "ollama-cowork-done",
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // ignore
  }
}
