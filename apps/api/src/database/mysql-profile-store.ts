import { randomUUID } from "node:crypto";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import {
  rsProfileSchema,
  type RsProfile,
  type RsResponse,
} from "../modules/local-profiles.js";
import {
  encryptCredential,
  decryptCredential,
} from "../modules/credentials.js";
import type { PortalMessage } from "../providers/rs-portal-inbox-client.js";
import type { ProfileStore } from "../modules/local-profile-routes.js";
interface Stored extends RsProfile {
  encryptedPassword: string;
  inboxMessages?: PortalMessage[];
  seenIds?: string[];
  readIds?: string[];
  inboxBaseline?: boolean;
}
const notFound = () =>
  Object.assign(new Error("PROFILE_NOT_FOUND"), { statusCode: 404 });
const publicProfile = (p: Stored): RsProfile => ({
  uid: p.uid,
  name: p.name,
  username: p.username,
  taxpayerId: p.taxpayerId,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  lastSuccessAt: p.lastSuccessAt,
  lastAttemptAt: p.lastAttemptAt,
  connectionState: p.connectionState,
  errorCode: p.errorCode,
  response: p.response,
  portalDebt: p.portalDebt,
  debt: p.debt,
  debtError: p.debtError,
  debtAttemptAt: p.debtAttemptAt,
  inboxCheckedAt: p.inboxCheckedAt,
  inboxError: p.inboxError,
});
const parse = (row: RowDataPacket): Stored => JSON.parse(String(row.payload));
export class MysqlProfileStore implements ProfileStore {
  constructor(
    private pool: Pool,
    private key: string,
  ) {
    if (!/^[a-f\d]{64}$/i.test(key))
      throw new Error(
        "CREDENTIAL_ENCRYPTION_KEY must be 64 hexadecimal characters",
      );
  }
  async initialize() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS rs_profiles (
      uid CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      username VARCHAR(254) COLLATE utf8mb4_bin NOT NULL UNIQUE,
      payload LONGTEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS rs_push_tokens (
      token VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      created_at VARCHAR(30) NOT NULL
    ) ENGINE=InnoDB`);
  }
  private async read(
    uid: string,
    conn: Pool | PoolConnection = this.pool,
    lock = false,
  ) {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT payload FROM rs_profiles WHERE uid=?${lock ? " FOR UPDATE" : ""}`,
      [uid],
    );
    if (!rows[0]) throw notFound();
    return parse(rows[0]);
  }
  private async change<T>(uid: string, mutate: (p: Stored) => T): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const p = await this.read(uid, conn, true);
      const result = mutate(p);
      await conn.execute(
        "UPDATE rs_profiles SET username=?,payload=? WHERE uid=?",
        [p.username, JSON.stringify(p), uid],
      );
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
  async list() {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT payload FROM rs_profiles ORDER BY username",
    );
    return rows.map((r) => publicProfile(parse(r)));
  }
  async get(uid: string) {
    return publicProfile(await this.read(uid));
  }
  async save(input: z.infer<typeof rsProfileSchema>, uid?: string) {
    const value = rsProfileSchema.parse(input);
    const id = uid ?? randomUUID();
    const make = (previous?: Stored): Stored => {
      const now = new Date().toISOString();
      return {
        uid: id,
        name: value.name,
        username: value.username,
        taxpayerId: value.taxpayerId,
        encryptedPassword: encryptCredential(
          value.password,
          this.key,
          `rs-profile:${id}`,
        ),
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        lastSuccessAt: null,
        lastAttemptAt: null,
        connectionState: "not_checked",
        errorCode: null,
        response: null,
      };
    };
    try {
      if (uid)
        return await this.change(uid, (p) => {
          const next = make(p);
          for (const k of Object.keys(p))
            delete (p as unknown as Record<string, unknown>)[k];
          Object.assign(p, next);
          return publicProfile(p);
        });
      const p = make();
      await this.pool.execute(
        "INSERT INTO rs_profiles(uid,username,payload) VALUES (?,?,?)",
        [id, p.username, JSON.stringify(p)],
      );
      return publicProfile(p);
    } catch (e) {
      if ((e as { code?: string }).code === "ER_DUP_ENTRY")
        throw Object.assign(new Error("PROFILE_EXISTS"), { statusCode: 409 });
      throw e;
    }
  }
  async credentials(uid: string) {
    const p = await this.read(uid);
    return {
      username: p.username,
      password: decryptCredential(
        p.encryptedPassword,
        this.key,
        `rs-profile:${uid}`,
      ),
    };
  }
  async result(
    uid: string,
    response: RsResponse | null,
    errorCode: string | null,
  ) {
    return this.change(uid, (p) => {
      p.lastAttemptAt = new Date().toISOString();
      p.updatedAt = p.lastAttemptAt;
      p.errorCode = errorCode;
      p.connectionState = errorCode ? "error" : "received";
      if (response) {
        p.response = response;
        p.lastSuccessAt = response.fetchedAt;
      }
      return publicProfile(p);
    });
  }
  async delete(uid: string) {
    const [r] = await this.pool.execute("DELETE FROM rs_profiles WHERE uid=?", [
      uid,
    ]);
    if (!(r as { affectedRows: number }).affectedRows) throw notFound();
  }
  async debtResult(uid: string, debt: RsProfile["debt"], error: string | null) {
    return this.change(uid, (p) => {
      p.debtAttemptAt = new Date().toISOString();
      p.debtError = error;
      if (debt) p.debt = debt;
      return publicProfile(p);
    });
  }
  async portalResult(
    uid: string,
    debt: RsProfile["portalDebt"] | null,
    error: string | null,
  ) {
    return this.change(uid, (p) => {
      p.debtAttemptAt = new Date().toISOString();
      p.debtError = error;
      if (debt) p.portalDebt = debt;
      return publicProfile(p);
    });
  }
  async inboxResult(
    uid: string,
    messages: PortalMessage[] | null,
    error: string | null,
  ) {
    return this.change(uid, (p) => {
      p.inboxError = error;
      const fresh: PortalMessage[] = [];
      if (messages) {
        const seen = new Set(p.seenIds ?? []);
        const baseline = !!p.inboxBaseline;
        for (const m of messages) {
          if (!seen.has(m.id) && baseline) fresh.push(m);
          seen.add(m.id);
        }
        p.seenIds = [...seen];
        p.inboxBaseline = true;
        p.inboxMessages = messages;
        p.inboxCheckedAt = new Date().toISOString();
      }
      return fresh;
    });
  }
  private inboxView(p: Stored) {
    const read = new Set(p.readIds ?? []);
    return {
      checkedAt: p.inboxCheckedAt ?? null,
      error: p.inboxError ?? null,
      messages: (p.inboxMessages ?? []).map((m) => ({
        ...m,
        read: m.read || read.has(m.id),
      })),
    };
  }
  async inbox(uid: string) {
    return this.inboxView(await this.read(uid));
  }
  async markInboxRead(uid: string, ids?: string[]) {
    return this.change(uid, (p) => {
      const known = new Set((p.inboxMessages ?? []).map((m) => m.id));
      const read = new Set(p.readIds ?? []);
      for (const id of ids ?? known) if (known.has(id)) read.add(id);
      p.readIds = [...read];
      return this.inboxView(p);
    });
  }
  async savePushToken(token: string) {
    await this.pool.execute(
      "INSERT IGNORE INTO rs_push_tokens(token,created_at) VALUES (?,?)",
      [token, new Date().toISOString()],
    );
  }
  async pushTokens() {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT token FROM rs_push_tokens",
    );
    return rows.map((r) => String(r.token));
  }
  async removePushToken(token: string) {
    await this.pool.execute("DELETE FROM rs_push_tokens WHERE token=?", [
      token,
    ]);
  }
  async close() {
    await this.pool.end();
  }
}
