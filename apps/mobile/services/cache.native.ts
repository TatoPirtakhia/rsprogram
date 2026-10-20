import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import Constants, { ExecutionEnvironment } from "expo-constants";
const expoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
let previewSnapshot: string | null = null;
let database: Promise<SQLite.SQLiteDatabase> | null = null;
async function open() {
  if (!database)
    database = (async () => {
      let key = await SecureStore.getItemAsync("biz.cache.key");
      if (!key) {
        key = Array.from(await Crypto.getRandomBytesAsync(32))
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
        await SecureStore.setItemAsync("biz.cache.key", key, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      }
      const db = await SQLite.openDatabaseAsync("biz-cache.db");
      await db.execAsync(`PRAGMA key = '${key}';`);
      const cipher = await db.getFirstAsync<Record<string, string>>(
        "PRAGMA cipher_version",
      );
      if (!cipher || !Object.values(cipher).some(Boolean))
        throw new Error(
          "Encrypted cache requires a SQLCipher development build",
        );
      await db.execAsync(
        "CREATE TABLE IF NOT EXISTS query_cache (uid TEXT PRIMARY KEY, payload TEXT NOT NULL)",
      );
      return db;
    })();
  return database;
}
export const protectedCache = {
  async read(): Promise<string | null> {
    if (expoGo) return previewSnapshot;
    const db = await open();
    return (
      (
        await db.getFirstAsync<{ payload: string }>(
          "SELECT payload FROM query_cache WHERE uid = ?",
          "snapshot",
        )
      )?.payload ?? null
    );
  },
  async write(payload: string) {
    if (expoGo) {
      previewSnapshot = payload;
      return;
    }
    const db = await open();
    await db.runAsync(
      "INSERT OR REPLACE INTO query_cache(uid,payload) VALUES (?,?)",
      "snapshot",
      payload,
    );
  },
  async clear() {
    if (expoGo) {
      previewSnapshot = null;
      return;
    }
    const db = await open();
    await db.runAsync("DELETE FROM query_cache");
  },
};
