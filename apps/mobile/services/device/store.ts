import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { z } from "zod";
import type { RsProfile, RsInbox } from "../../features/rs-profiles/types";
export const profileInput = z.object({
  name: z.string().trim().min(1).max(200),
  username: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(1024),
  taxpayerId: z
    .string()
    .trim()
    .regex(/^(?:\d{9}|\d{11})?$/)
    .optional(),
});
export interface StoredProfile extends RsProfile {
  password: string;
  revision: string;
  inbox: RsInbox;
}
let opening: Promise<SQLite.SQLiteDatabase> | undefined;
async function open() {
  if (!opening)
    opening = (async () => {
      let key = await SecureStore.getItemAsync("biz.rs.device.key");
      if (!key) {
        key = Array.from(await Crypto.getRandomBytesAsync(32), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
        await SecureStore.setItemAsync("biz.rs.device.key", key, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      }
      if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("INVALID_DEVICE_KEY");
      const db = await SQLite.openDatabaseAsync("rs-device.db");
      await db.execAsync(`PRAGMA key = '${key}';`);
      const cipher = await db.getFirstAsync<Record<string, string>>(
        "PRAGMA cipher_version",
      );
      if (!cipher || !Object.values(cipher).some(Boolean))
        throw new Error("ENCRYPTED_STORAGE_REQUIRED");
      await db.execAsync(
        "CREATE TABLE IF NOT EXISTS profiles(uid TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, payload TEXT NOT NULL)",
      );
      return db;
    })().catch((error) => {
      opening = undefined;
      throw error;
    });
  return opening;
}
// SQLCipher keys are connection-local. Expo's exclusive helper opens an
// unkeyed connection and starts BEGIN before invoking its callback. Open and
// key our own connection before BEGIN, and serialize writers explicitly.
let writes: Promise<void> = Promise.resolve();
function writeTransaction<T>(
  task: (tx: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const result = writes.then(async () => {
    await open();
    const key = await SecureStore.getItemAsync("biz.rs.device.key");
    if (!key || !/^[a-f0-9]{64}$/.test(key))
      throw new Error("INVALID_DEVICE_KEY");
    const tx = await SQLite.openDatabaseAsync("rs-device.db", {
      useNewConnection: true,
    });
    try {
      await tx.execAsync(`PRAGMA key = '${key}';`);
      await tx.execAsync("BEGIN IMMEDIATE");
      try {
        const value = await task(tx);
        await tx.execAsync("COMMIT");
        return value;
      } catch (error) {
        await tx.execAsync("ROLLBACK").catch(() => {});
        throw error;
      }
    } finally {
      await tx.closeAsync();
    }
  });
  writes = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
export function publicProfile(value: StoredProfile): RsProfile {
  return {
    uid: value.uid,
    name: value.name,
    username: value.username,
    taxpayerId: value.taxpayerId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    lastSuccessAt: value.lastSuccessAt,
    lastAttemptAt: value.lastAttemptAt,
    connectionState: value.connectionState,
    errorCode: value.errorCode,
    response: value.response,
    portalDebt: value.portalDebt,
    debt: value.debt,
    debtError: value.debtError,
    debtAttemptAt: value.debtAttemptAt,
  };
}
export const deviceStore = {
  async list() {
    const rows = await (
      await open()
    ).getAllAsync<{ payload: string }>(
      "SELECT payload FROM profiles ORDER BY username",
    );
    return rows.map((r) => publicProfile(JSON.parse(r.payload)));
  },
  async read(uid: string): Promise<StoredProfile> {
    const row = await (
      await open()
    ).getFirstAsync<{ payload: string }>(
      "SELECT payload FROM profiles WHERE uid=?",
      uid,
    );
    if (!row) throw new Error("PROFILE_NOT_FOUND");
    return JSON.parse(row.payload);
  },
  async save(input: unknown, uid?: string) {
    const value = profileInput.parse(input);
    let saved!: StoredProfile;
    await writeTransaction(async (tx) => {
      const old = uid
        ? await tx.getFirstAsync<{ payload: string }>(
            "SELECT payload FROM profiles WHERE uid=?",
            uid,
          )
        : null;
      if (uid && !old) throw new Error("PROFILE_NOT_FOUND");
      const id = uid ?? Crypto.randomUUID();
      if (
        await tx.getFirstAsync(
          "SELECT uid FROM profiles WHERE username=? AND uid<>?",
          value.username,
          id,
        )
      )
        throw new Error("PROFILE_EXISTS");
      const now = new Date().toISOString();
      saved = {
        ...value,
        uid: id,
        revision: Crypto.randomUUID(),
        createdAt: old ? JSON.parse(old.payload).createdAt : now,
        updatedAt: now,
        lastSuccessAt: null,
        lastAttemptAt: null,
        connectionState: "not_checked",
        errorCode: null,
        response: null,
        inbox: { checkedAt: null, error: null, messages: [] },
      };
      await tx.runAsync(
        "INSERT INTO profiles(uid,username,payload) VALUES(?,?,?) ON CONFLICT(uid) DO UPDATE SET username=excluded.username,payload=excluded.payload",
        id,
        value.username,
        JSON.stringify(saved),
      );
    });
    return publicProfile(saved);
  },
  async update(
    uid: string,
    change: (profile: StoredProfile) => void,
    revision?: string,
  ) {
    let saved!: StoredProfile;
    await writeTransaction(async (tx) => {
      const row = await tx.getFirstAsync<{ payload: string }>(
        "SELECT payload FROM profiles WHERE uid=?",
        uid,
      );
      if (!row) throw new Error("PROFILE_NOT_FOUND");
      saved = JSON.parse(row.payload);
      if (revision && saved.revision !== revision)
        throw new Error("PROFILE_CHANGED");
      change(saved);
      await tx.runAsync(
        "UPDATE profiles SET payload=? WHERE uid=?",
        JSON.stringify(saved),
        uid,
      );
    });
    return saved;
  },
  async delete(uid: string) {
    await writeTransaction((tx) =>
      tx.runAsync("DELETE FROM profiles WHERE uid=?", uid),
    );
  },
};
