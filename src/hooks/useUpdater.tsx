import { useEffect, useState, useCallback } from "react";

export type UpdaterState =
  | { state: "idle"; currentVersion?: string | null }
  | { state: "disabled"; currentVersion?: string | null }
  | { state: "checking"; currentVersion?: string | null }
  | { state: "none"; currentVersion?: string | null }
  | { state: "available"; version?: string; currentVersion?: string | null; manualOnly?: boolean; releaseUrl?: string | null }
  | { state: "downloading"; percent?: number; bytesPerSecond?: number; transferred?: number; total?: number; version?: string; currentVersion?: string | null }
  | { state: "ready"; version?: string; currentVersion?: string | null }
  | { state: "error"; message?: string; currentVersion?: string | null };

interface BridgeUpdater {
  checkUpdates?: () => Promise<{ ok: boolean; output: string }>;
  installUpdate?: () => Promise<{ ok: boolean; output: string }>;
  getUpdaterState?: () => Promise<UpdaterState>;
  onUpdaterStatus?: (cb: (s: UpdaterState) => void) => () => void;
}

export function useUpdater() {
  const [status, setStatus] = useState<UpdaterState>({ state: "idle" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const b = (typeof window !== "undefined" ? (window as any).bridge : undefined) as
      | BridgeUpdater
      | undefined;
    if (!b?.onUpdaterStatus) return;
    b.getUpdaterState?.().then((s) => s && setStatus(s)).catch(() => {});
    const off = b.onUpdaterStatus((s) => setStatus(s));
    return () => off?.();
  }, []);

  const check = useCallback(async () => {
    const b = (window as any).bridge as BridgeUpdater | undefined;
    if (!b?.checkUpdates) return;
    setBusy(true);
    try {
      await b.checkUpdates();
    } finally {
      setBusy(false);
    }
  }, []);

  const install = useCallback(async () => {
    const b = (window as any).bridge as BridgeUpdater | undefined;
    if (!b?.installUpdate) return;
    await b.installUpdate();
  }, []);

  const available =
    typeof window !== "undefined" && !!(window as any).bridge?.onUpdaterStatus;

  return { status, busy, check, install, available };
}
