// Web Speech API wrapper for voice input.
// Returns a controller you can start/stop. Falls back gracefully if unsupported.

export interface VoiceController {
  start: () => void;
  stop: () => void;
  supported: boolean;
}

type SpeechRecognitionCtor = new () => any;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isVoiceInputSupported(): boolean {
  return getRecognitionCtor() !== null;
}

export interface VoiceOptions {
  lang?: string; // e.g. "vi-VN", "en-US"
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (err: string) => void;
  onEnd?: () => void;
}

export function createVoiceController(opts: VoiceOptions): VoiceController {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    return {
      supported: false,
      start: () => opts.onError?.("Trình duyệt không hỗ trợ Web Speech API"),
      stop: () => {},
    };
  }
  const rec = new Ctor();
  rec.lang = opts.lang ?? "vi-VN";
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (e: any) => {
    let interim = "";
    let final = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const t = res[0]?.transcript ?? "";
      if (res.isFinal) final += t;
      else interim += t;
    }
    if (interim && opts.onInterim) opts.onInterim(interim);
    if (final) opts.onFinal(final);
  };
  rec.onerror = (e: any) => opts.onError?.(String(e.error || "speech_error"));
  rec.onend = () => opts.onEnd?.();

  return {
    supported: true,
    start: () => {
      try {
        rec.start();
      } catch (e: any) {
        opts.onError?.(String(e?.message || e));
      }
    },
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    },
  };
}
