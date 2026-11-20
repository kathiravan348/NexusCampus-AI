/**
 * Stand-in for `virtual:pwa-register` in Vitest (the PWA plugin only provides it in Vite dev/build).
 * Tests replace it with `vi.mock("virtual:pwa-register", …)` when they need callbacks.
 */
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return () => Promise.resolve();
}
