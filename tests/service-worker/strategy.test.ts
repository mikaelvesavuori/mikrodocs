import { describe, expect, it } from "vitest";

import {
  cacheName,
  fallbackAsset,
  shellAssets,
  shouldCacheResponse,
  shouldHandleRequest,
} from "../../src/serviceWorker/strategy.js";

describe("service worker strategy", () => {
  it("names the cache and lists the shell assets", () => {
    expect(cacheName).toMatch(/^mikrodocs-shell-v\d+$/);
    expect(fallbackAsset).toBe("./index.html");
    expect(shellAssets).toContain("./assets/main.js");
    expect(shellAssets).toContain("./assets/styles.css");
  });

  it("handles only same-origin GET requests", () => {
    expect(
      shouldHandleRequest(new Request("https://docs.local/assets/main.js"), "https://docs.local"),
    ).toBe(true);
    expect(
      shouldHandleRequest(
        new Request("https://docs.local/api", { method: "POST" }),
        "https://docs.local",
      ),
    ).toBe(false);
    expect(shouldHandleRequest(new Request("https://cdn.local/app.js"), "https://docs.local")).toBe(
      false,
    );
  });

  it("caches only successful responses", () => {
    expect(shouldCacheResponse(new Response("ok", { status: 200 }))).toBe(true);
    expect(shouldCacheResponse(new Response("missing", { status: 404 }))).toBe(false);
  });
});
