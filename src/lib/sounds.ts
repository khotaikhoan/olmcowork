/**
 * Sound Effects — lightweight UI sounds generated via Web Audio API.
 * No assets, no network, no deps. Toggle persisted in localStorage.
 *
 * Sounds:
 *   - "ting"   : soft chime when AI finishes a reply
 *   - "send"   : subtle blip when user sends a message
 *   - "error"  : low buzz on failure
 *   - "click"  : crisp tick for chip/button (used sparingly)
 */

const LS_KEY = "chat.sound_enabled";
const LS_VOLUME = "chat.sound_volume"; // 0..1
const LS_BG_ONLY = "chat.sound_background_only"; // "1" = mute when tab visible

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") {
      void audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundEnabled(v: boolean): void {
  try {
    localStorage.setItem(LS_KEY, v ? "1" : "0");
    window.dispatchEvent(new CustomEvent("sound:changed", { detail: { enabled: v } }));
  } catch { /* ignore */ }
}

export function getSoundVolume(): number {
  try {
    const raw = localStorage.getItem(LS_VOLUME);
    if (raw == null) return 0.5;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
  } catch {
    return 0.5;
  }
}

export function setSoundVolume(v: number): void {
  const clamped = Math.max(0, Math.min(1, v));
  try {
    localStorage.setItem(LS_VOLUME, String(clamped));
    window.dispatchEvent(new CustomEvent("sound:changed", { detail: { volume: clamped } }));
  } catch { /* ignore */ }
}

/** When true, sounds only play if tab is hidden/minimized (not actively focused). */
export function isBackgroundOnly(): boolean {
  try {
    return localStorage.getItem(LS_BG_ONLY) === "1";
  } catch {
    return false;
  }
}

export function setBackgroundOnly(v: boolean): void {
  try {
    localStorage.setItem(LS_BG_ONLY, v ? "1" : "0");
    window.dispatchEvent(new CustomEvent("sound:changed", { detail: { backgroundOnly: v } }));
  } catch { /* ignore */ }
}

/** True when the tab is currently visible AND focused (user is looking at it). */
function isTabActive(): boolean {
  if (typeof document === "undefined") return false;
  const visible = document.visibilityState === "visible";
  const focused = typeof document.hasFocus === "function" ? document.hasFocus() : true;
  return visible && focused;
}

/** Internal — play a tone with envelope. */
function tone(opts: {
  freq: number;
  durationMs: number;
  type?: OscillatorType;
  volume?: number;
  attackMs?: number;
  releaseMs?: number;
  freqEnd?: number;
}): void {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const dur = opts.durationMs / 1000;
  const attack = (opts.attackMs ?? 5) / 1000;
  const release = (opts.releaseMs ?? Math.max(40, opts.durationMs * 0.6)) / 1000;
  const baseVol = (opts.volume ?? 0.18) * getSoundVolume();

  const osc = ctx.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, now);
  if (opts.freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.freqEnd), now + dur);
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(baseVol, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur + release);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur + release + 0.05);
}

export type SoundName = "ting" | "send" | "error" | "click";

/**
 * Play a named UI sound. No-op if disabled or audio unsupported.
 * Options:
 *   - force: bypass the "background only" gate (e.g. for the Test buttons).
 */
export function playSound(name: SoundName, opts?: { force?: boolean }): void {
  if (!isSoundEnabled()) return;
  // Respect "background only" preference: skip when user is actively looking at the tab.
  if (!opts?.force && isBackgroundOnly() && isTabActive()) return;

  switch (name) {
    case "ting":
      tone({ freq: 659.25, durationMs: 80, type: "sine", volume: 0.22, releaseMs: 240 });
      setTimeout(
        () => tone({ freq: 880, durationMs: 80, type: "sine", volume: 0.22, releaseMs: 320 }),
        90,
      );
      break;
    case "send":
      tone({
        freq: 520,
        freqEnd: 780,
        durationMs: 70,
        type: "sine",
        volume: 0.14,
        releaseMs: 80,
      });
      break;
    case "error":
      tone({
        freq: 220,
        freqEnd: 110,
        durationMs: 180,
        type: "sawtooth",
        volume: 0.12,
        releaseMs: 100,
      });
      break;
    case "click":
      tone({ freq: 1200, durationMs: 25, type: "square", volume: 0.08, releaseMs: 30 });
      break;
  }
}
