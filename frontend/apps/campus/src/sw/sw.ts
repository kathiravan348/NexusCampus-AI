/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

/**
 * The campus service worker (NEX-030, NEX-038): precached app shell, `/index.html` for navigations, and the
 * "new version" prompt via `SKIP_WAITING`. API responses are never cached here (O-3: data lives in @nexus/offline).
 */
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Parameters<typeof precacheAndRoute>[0];
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), { denylist: [/^\/api\//] }),
);

self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | null)?.type === "SKIP_WAITING") void self.skipWaiting();
});

/**
 * Mock builds only: the MSW worker lives in this same worker (one worker per scope), after the Workbox routes.
 * It sees only `/api/` requests, so the shell keeps coming from the precache, and it may not unregister this
 * worker when the last tab closes (that would drop the offline app).
 */
if (import.meta.env.VITE_DATA_MODE === "mock") {
  const addListener = self.addEventListener.bind(self);
  self.registration.unregister = () => Promise.resolve(false);
  self.addEventListener = ((
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ) => {
    if (type !== "fetch") return addListener(type, listener, options);
    return addListener(
      "fetch",
      (event) => {
        const { pathname } = new URL((event as FetchEvent).request.url);
        if (pathname.startsWith("/api/")) listener(event);
      },
      options,
    );
  }) as typeof self.addEventListener;
  importScripts("/mockServiceWorker.js");
  self.addEventListener = addListener;
}
