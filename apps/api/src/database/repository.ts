import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type { Dataset } from "@biz/shared";
import { readDataset, writeDataset } from "./domain-storage.js";
export interface Session {
  uid: string;
  userUid: string;
  businessUid: string;
  refreshHash: string;
  expiresAt: string;
  revoked: boolean;
}
export interface User {
  uid: string;
  email: string;
  username: string;
  passwordHash: string;
  businessUid: string;
}
export interface Repository {
  user(username: string): Promise<User | null>;
  session(uid: string): Promise<Session | null>;
  saveSession(s: Session): Promise<void>;
  rotateSession(
    uid: string,
    oldHash: string,
    newHash: string,
  ): Promise<boolean>;
  revoke(uid: string): Promise<void>;
  load(businessUid: string): Promise<Dataset | null>;
  mutate<T>(businessUid: string, fn: (data: Dataset) => T): Promise<T>;
  deleteAccount(userUid: string, businessUid: string): Promise<void>;
  audit(userUid: string, businessUid: string, action: string): Promise<void>;
}
export class MysqlRepository implements Repository {
  constructor(private pool: Pool) {}
  async user(username: string) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT u.uid,u.email,u.username,u.password_hash,b.business_uid FROM users u JOIN business_users b ON b.user_uid=u.uid WHERE u.username=? LIMIT 1",
      [username],
    );
    const r = rows[0];
    return r
      ? {
          uid: r.uid,
          email: r.email,
          username: r.username,
          passwordHash: r.password_hash,
          businessUid: r.business_uid,
        }
      : null;
  }
  async session(uid: string) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT s.*,r.token_hash FROM user_sessions s JOIN refresh_tokens r ON r.session_uid=s.uid WHERE s.uid=?",
      [uid],
    );
    const r = rows[0];
    return r
      ? {
          uid: r.uid,
          userUid: r.user_uid,
          businessUid: r.business_uid,
          refreshHash: r.token_hash,
          expiresAt: r.expires_at,
          revoked: !!r.revoked,
        }
      : null;
  }
  async saveSession(s: Session) {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      await c.execute(
        "INSERT INTO user_sessions (uid,user_uid,business_uid,expires_at,revoked) VALUES (?,?,?,?,0)",
        [s.uid, s.userUid, s.businessUid, s.expiresAt],
      );
      await c.execute(
        "INSERT INTO refresh_tokens (uid,session_uid,business_uid,token_hash) VALUES (UUID(),?,?,?)",
        [s.uid, s.businessUid, s.refreshHash],
      );
      await c.commit();
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
  async rotateSession(uid: string, oldHash: string, newHash: string) {
    const [result] = await this.pool.execute<import("mysql2").ResultSetHeader>(
      "UPDATE refresh_tokens r JOIN user_sessions s ON s.uid=r.session_uid SET r.token_hash=? WHERE s.uid=? AND r.token_hash=? AND s.revoked=0 AND s.expires_at>UTC_TIMESTAMP()",
      [newHash, uid, oldHash],
    );
    return result.affectedRows === 1;
  }
  async revoke(uid: string) {
    await this.pool.execute("UPDATE user_sessions SET revoked=1 WHERE uid=?", [
      uid,
    ]);
  }
  async load(businessUid: string) {
    return readDataset(this.pool, businessUid);
  }
  async mutate<T>(businessUid: string, fn: (data: Dataset) => T): Promise<T> {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      await c.execute("SELECT uid FROM businesses WHERE uid=? FOR UPDATE", [
        businessUid,
      ]);
      const d = await readDataset(c, businessUid);
      if (!d) throw new Error("BUSINESS_NOT_FOUND");
      const result = fn(d);
      await this.persist(c, businessUid, d);
      await c.commit();
      return result;
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
  async persist(c: PoolConnection, businessUid: string, d: Dataset) {
    await writeDataset(c, businessUid, d);
  }
  async audit(userUid: string, businessUid: string, action: string) {
    await this.pool.execute(
      "INSERT INTO audit_logs (uid,business_uid,user_uid,action) VALUES (UUID(),?,?,?)",
      [businessUid, userUid, action],
    );
  }
  async deleteAccount(userUid: string, businessUid: string) {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      await c.execute("DELETE FROM businesses WHERE uid=?", [businessUid]);
      await c.execute("DELETE FROM users WHERE uid=?", [userUid]);
      await c.commit();
    } catch (e) {
      await c.rollback();
      throw e;
    } finally {
      c.release();
    }
  }
}
// Tests use the same interface without external accounts or a running database.
export class MemoryRepository implements Repository {
  users: User[] = [];
  sessions = new Map<string, Session>();
  datasets = new Map<string, Dataset>();
  async user(username: string) {
    return (
      this.users.find((u) => u.username.toLowerCase() === username) ?? null
    );
  }
  async session(uid: string) {
    return this.sessions.get(uid) ?? null;
  }
  async saveSession(s: Session) {
    this.sessions.set(s.uid, { ...s });
  }
  async rotateSession(uid: string, oldHash: string, newHash: string) {
    const s = this.sessions.get(uid);
    if (!s || s.revoked || s.refreshHash !== oldHash) return false;
    s.refreshHash = newHash;
    return true;
  }
  async revoke(uid: string) {
    const s = this.sessions.get(uid);
    if (s) s.revoked = true;
  }
  async load(uid: string) {
    return this.datasets.get(uid) ?? null;
  }
  async mutate<T>(uid: string, fn: (data: Dataset) => T) {
    const d = this.datasets.get(uid);
    if (!d) throw new Error("BUSINESS_NOT_FOUND");
    return fn(d);
  }
  async audit(_userUid: string, _businessUid: string, _action: string) {}
  async deleteAccount(userUid: string, businessUid: string) {
    this.datasets.delete(businessUid);
    this.users = this.users.filter((u) => u.uid !== userUid);
    for (const s of this.sessions.values())
      if (s.userUid === userUid) s.revoked = true;
  }
}
