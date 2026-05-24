import {
  cacheName,
  fallbackAsset,
  shellAssets,
  shouldCacheResponse,
  shouldHandleRequest,
} from "./strategy.js";

interface ServiceWorkerLifecycleEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface ServiceWorkerFetchEvent extends Event {
  request: Request;
  respondWith(response: Promise<Response>): void;
}

interface ServiceWorkerScope {
  location: Location;
  clients: {
    claim(): Promise<void>;
  };
  skipWaiting(): Promise<void>;
  addEventListener(
    type: "install" | "activate",
    listener: (event: ServiceWorkerLifecycleEvent) => void,
  ): void;
  addEventListener(type: "fetch", listener: (event: ServiceWorkerFetchEvent) => void): void;
}

declare const self: ServiceWorkerScope;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.addAll(shellAssets))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== cacheName).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!shouldHandleRequest(request, self.location.origin)) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (shouldCacheResponse(response)) {
          const copy = response.clone();
          caches.open(cacheName).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => getCachedResponse(request)),
  );
});

async function getCachedResponse(request: Request) {
  return (await caches.match(request)) ?? (await caches.match(fallbackAsset)) ?? Response.error();
}
