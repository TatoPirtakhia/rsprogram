import { describe, it, expect } from "vitest";
import { validCache, CACHE_MAX_AGE } from "../services/cache-policy";
import { protectedCache } from "../services/cache";
describe("offline cache", () => {
  it("rejects stale and cross-account snapshots", () => {
    const snapshot = { owner: "a", savedAt: 1000, queries: {} };
    expect(validCache(snapshot, "a", 2000)).toBe(true);
    expect(validCache(snapshot, "b", 2000)).toBe(false);
    expect(validCache(snapshot, "a", 1001 + CACHE_MAX_AGE)).toBe(false);
  });
  it("clears sensitive snapshots on logout", async () => {
    await protectedCache.write("private");
    expect(await protectedCache.read()).toBe("private");
    await protectedCache.clear();
    expect(await protectedCache.read()).toBeNull();
  });
});
