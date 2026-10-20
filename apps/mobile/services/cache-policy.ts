import type { DehydratedState } from "@tanstack/react-query";
export const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
export interface CacheSnapshot {
  owner: string;
  savedAt: number;
  queries: Partial<DehydratedState>;
}
export function validCache(
  snapshot: CacheSnapshot,
  owner: string,
  now = Date.now(),
) {
  return (
    snapshot.owner === owner &&
    now - snapshot.savedAt < CACHE_MAX_AGE &&
    now >= snapshot.savedAt
  );
}
