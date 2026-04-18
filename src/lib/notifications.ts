// Lightweight wrapper around the browser Notification API.
// Only fires when the tab is hidden (otherwise the user already sees it).
let permissionAsked = false;

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

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

/** Request permission proactively (idempotent). Safe to call on app start. */
export async function primeNotificationPermission(): Promise<void> {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  if (permissionAsked) return;
  await ensurePermission();
}

export interface NotifyDoneOptions {
  /** Message ID to scroll to when the user clicks the notification. */
  messageId?: string;
}

export async function notifyDone(title: string, body: string, opts: NotifyDoneOptions = {}) {
  if (typeof document !== "undefined" && !document.hidden) return;
  const ok = await ensurePermission();
  if (!ok) return;
  try {
    const n = new Notification(title, {
      body: body.slice(0, 140),
      icon: "/favicon.svg",
      tag: "ochat-done",
    });
    n.onclick = () => {
      try { window.focus(); } catch { /* ignore */ }
      // Best-effort: scroll the corresponding message into view + flash.
      if (opts.messageId) {
        const tryScroll = (attempt = 0) => {
          const el = document.querySelector<HTMLElement>(
            `[data-message-id="${CSS.escape(opts.messageId!)}"]`,
          );
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.classList.add("ring-2", "ring-primary", "ring-offset-2", "rounded-md");
            setTimeout(() => {
              el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "rounded-md");
            }, 1800);
          } else if (attempt < 6) {
            // Tab might still be loading the conversation — retry briefly.
            setTimeout(() => tryScroll(attempt + 1), 250);
          }
        };
        tryScroll();
      }
      n.close();
    };
  } catch {
    // ignore
  }
}
