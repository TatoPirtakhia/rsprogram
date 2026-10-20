// Web preview retains no sensitive data on disk. Native resolves cache.native.ts (SQLCipher).
let snapshot: string | null = null;
export const protectedCache = {
  async read() {
    return snapshot;
  },
  async write(payload: string) {
    snapshot = payload;
  },
  async clear() {
    snapshot = null;
  },
};
