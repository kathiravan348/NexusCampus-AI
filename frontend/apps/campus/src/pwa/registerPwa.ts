import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

/** Service worker state for the shell (NEX-030). One registration per page load. */
export interface PwaState {
  readonly needRefresh: boolean;
  readonly offlineReady: boolean;
}

let state: PwaState = { needRefresh: false, offlineReady: false };
const listeners = new Set<() => void>();
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

function set(next: Partial<PwaState>): void {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function ensureRegistered(): void {
  if (updateSW) return;
  updateSW = registerSW({
    onNeedRefresh: () => set({ needRefresh: true }),
    onOfflineReady: () => set({ offlineReady: true }),
  });
}

function subscribe(listener: () => void): () => void {
  ensureRegistered();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `needRefresh` = a new version is waiting; `update()` activates it and reloads. */
export function usePwaUpdate() {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  return {
    ...current,
    update: () => void updateSW?.(true),
    dismissOfflineReady: () => set({ offlineReady: false }),
    dismissRefresh: () => set({ needRefresh: false }),
  };
}

/** Test helper: reset module state between tests. */
export function resetPwaForTests(): void {
  state = { needRefresh: false, offlineReady: false };
  updateSW = null;
  listeners.clear();
}
