export const cacheName = "mikrodocs-shell-v3";
export const fallbackAsset = "./index.html";
export const shellAssets = [
  "./",
  fallbackAsset,
  "./assets/main.js",
  "./assets/styles.css",
  "./manifest.webmanifest",
];

export function shouldHandleRequest(request: Request, origin: string) {
  if (request.method !== "GET") {
    return false;
  }

  return new URL(request.url).origin === origin;
}

export function shouldCacheResponse(response: Response) {
  return response.ok;
}
