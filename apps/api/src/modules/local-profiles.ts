import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { RsDetailedDebtClient } from "../providers/rs-detailed-debt-client.js";
import { encryptCredential, decryptCredential } from "./credentials.js";
import type { PortalMessage } from "../providers/rs-portal-inbox-client.js";
export const rsProfileSchema = z.object({
  name: z.string().trim().min(1).max(200),
  username: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(1024),
  taxpayerId: z
    .string()
    .trim()
    .regex(/^(?:\d{9}|\d{11})?$/)
    .optional(),
});
export interface RsDebtResponse {
  fetchedAt: string;
  operation: "GetTPInfoDebt_RS";
  mappingStatus: "NOT_VERIFIED";
  rows: { code: string; debtAmount: string }[];
}
export interface ZReport {
  deviceNumber: string;
  reportDate: string;
  quantity: number;
  paidAmount: string;
  paidCash: string;
  paidOther: string;
  zNumber: string;
}
export interface RsZReportResponse {
  fetchedAt: string;
  operation: "Get_Z_Report_Details";
  from: string;
  to: string;
  outcome: "ok" | "no_records";
  reports: ZReport[];
  summary: {
    paidAmount: string;
    paidCash: string;
    paidOther: string;
    quantity: number;
    registerCount: number;
    reportCount: number;
  };
  chart: { date: string; amount: string }[];
}
export type RsResponse = RsDebtResponse | RsZReportResponse;
export interface RsProfile {
  portalDebt?: {
    total: string;
    balance: string;
    asOf: string;
    checkedAt: string;
    source: "RS_PORTAL";
    sourceUrl: string;
  };
  debt?: Awaited<ReturnType<RsDetailedDebtClient["getDebt"]>> | null;
  debtError?: string | null;
  debtAttemptAt?: string;
  taxpayerId?: string;
  inboxCheckedAt?: string;
  inboxError?: string | null;
  uid: string;
  name: string;
  username: string;
  createdAt: string;
  updatedAt: string;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  connectionState: "not_checked" | "received" | "error";
  errorCode: string | null;
  response: RsResponse | null;
}
interface StoredProfile extends RsProfile {
  encryptedPassword: string;
  inboxMessages?: PortalMessage[];
}
export class LocalProfileStore {
  private db: DatabaseSync;
  private key: string;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    const keyPath = join(directory, "credentials.key");
    try {
      this.key = readFileSync(keyPath, "utf8").trim();
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      this.key = randomBytes(32).toString("hex");
      writeFileSync(keyPath, this.key, { flag: "wx", mode: 0o600 });
    }
    if (!/^[a-f\d]{64}$/.test(this.key))
      throw new Error("Invalid local encryption key");
    this.db = new DatabaseSync(join(directory, "rs-profiles.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS rs_profiles(uid TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS rs_inbox_seen(uid TEXT NOT NULL, message_id TEXT NOT NULL, seen_at TEXT NOT NULL, PRIMARY KEY(uid, message_id)); CREATE TABLE IF NOT EXISTS rs_inbox_read(uid TEXT NOT NULL, message_id TEXT NOT NULL, PRIMARY KEY(uid, message_id)); CREATE TABLE IF NOT EXISTS push_tokens(token TEXT PRIMARY KEY, created_at TEXT NOT NULL);",
    );
  }
  private read(uid: string): StoredProfile {
    const row = this.db
      .prepare("SELECT payload FROM rs_profiles WHERE uid=?")
      .get(uid) as { payload: string } | undefined;
    if (!row)
      throw Object.assign(new Error("PROFILE_NOT_FOUND"), { statusCode: 404 });
    return JSON.parse(row.payload);
  }
  private public(value: StoredProfile): RsProfile {
    return {
      uid: value.uid,
      portalDebt: value.portalDebt,
      debt: value.debt,
      debtError: value.debtError,
      debtAttemptAt: value.debtAttemptAt,
      taxpayerId: value.taxpayerId,
      inboxCheckedAt: value.inboxCheckedAt,
      inboxError: value.inboxError,
      name: value.name,
      username: value.username,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      lastSuccessAt: value.lastSuccessAt,
      lastAttemptAt: value.lastAttemptAt,
      connectionState: value.connectionState,
      errorCode: value.errorCode,
      response: value.response,
    };
  }
  list(): RsProfile[] {
    return (
      this.db
        .prepare("SELECT payload FROM rs_profiles ORDER BY username")
        .all() as { payload: string }[]
    ).map((r) => this.public(JSON.parse(r.payload)));
  }
  get(uid: string) {
    return this.public(this.read(uid));
  }
  save(input: z.infer<typeof rsProfileSchema>, uid?: string) {
    const value = rsProfileSchema.parse(input);
    const previous = uid ? this.read(uid) : null;
    const duplicate = this.db
      .prepare("SELECT uid FROM rs_profiles WHERE username=? AND uid<>?")
      .get(value.username, uid ?? "");
    if (duplicate)
      throw Object.assign(new Error("PROFILE_EXISTS"), { statusCode: 409 });
    const id = uid ?? randomUUID();
    const now = new Date().toISOString();
    const profile: StoredProfile = {
      uid: id,
      taxpayerId: value.taxpayerId,
      name: value.name,
      username: value.username,
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
    this.db
      .prepare(
        "INSERT INTO rs_profiles(uid,username,payload) VALUES (?,?,?) ON CONFLICT(uid) DO UPDATE SET username=excluded.username,payload=excluded.payload",
      )
      .run(id, value.username, JSON.stringify(profile));
    return this.public(profile);
  }
  credentials(uid: string) {
    const profile = this.read(uid);
    return {
      username: profile.username,
      password: decryptCredential(
        profile.encryptedPassword,
        this.key,
        `rs-profile:${uid}`,
      ),
    };
  }
  result(uid: string, response: RsResponse | null, errorCode: string | null) {
    const profile = this.read(uid);
    profile.lastAttemptAt = new Date().toISOString();
    profile.updatedAt = profile.lastAttemptAt;
    profile.errorCode = errorCode;
    profile.connectionState = errorCode ? "error" : "received";
    if (response) {
      profile.response = response;
      profile.lastSuccessAt = response.fetchedAt;
    }
    this.db
      .prepare("UPDATE rs_profiles SET payload=? WHERE uid=?")
      .run(JSON.stringify(profile), uid);
    return this.public(profile);
  }
  delete(uid: string) {
    this.read(uid);
    this.db.prepare("DELETE FROM rs_profiles WHERE uid=?").run(uid);
    this.db.prepare("DELETE FROM rs_inbox_seen WHERE uid=?").run(uid);
    this.db.prepare("DELETE FROM rs_inbox_read WHERE uid=?").run(uid);
  }
  debtResult(uid: string, debt: RsProfile["debt"], error: string | null) {
    const profile = this.read(uid);
    profile.debtAttemptAt = new Date().toISOString();
    profile.debtError = error;
    if (debt) profile.debt = debt;
    this.db
      .prepare("UPDATE rs_profiles SET payload=? WHERE uid=?")
      .run(JSON.stringify(profile), uid);
    return this.public(profile);
  }
  portalResult(
    uid: string,
    debt: RsProfile["portalDebt"] | null,
    error: string | null,
  ) {
    const profile = this.read(uid);
    profile.debtAttemptAt = new Date().toISOString();
    profile.debtError = error;
    if (debt) profile.portalDebt = debt;
    this.db
      .prepare("UPDATE rs_profiles SET payload=? WHERE uid=?")
      .run(JSON.stringify(profile), uid);
    return this.public(profile);
  }
  // Records the portal inbox and returns messages not seen before. The first
  // successful check only sets the baseline, so existing messages never push.
  inboxResult(
    uid: string,
    messages: PortalMessage[] | null,
    error: string | null,
  ): PortalMessage[] {
    const profile = this.read(uid);
    profile.inboxError = error;
    const fresh: PortalMessage[] = [];
    if (messages) {
      profile.inboxCheckedAt = new Date().toISOString();
      profile.inboxMessages = messages;
      const known = new Set(
        (
          this.db
            .prepare("SELECT message_id FROM rs_inbox_seen WHERE uid=?")
            .all(uid) as { message_id: string }[]
        ).map((r) => r.message_id),
      );
      const baseline = !known.size;
      const insert = this.db.prepare(
        "INSERT OR IGNORE INTO rs_inbox_seen(uid,message_id,seen_at) VALUES (?,?,?)",
      );
      for (const m of messages) {
        if (known.has(m.id)) continue;
        insert.run(uid, m.id, profile.inboxCheckedAt);
        if (!baseline) fresh.push(m);
      }
      // An empty first inbox still counts as a baseline.
      if (baseline && !messages.length)
        insert.run(uid, "__baseline__", profile.inboxCheckedAt);
    }
    this.db
      .prepare("UPDATE rs_profiles SET payload=? WHERE uid=?")
      .run(JSON.stringify(profile), uid);
    return fresh;
  }
  // Inbox list kept from the last successful check (newest first). A message
  // is read when RS says so or when it was marked read in this app.
  inbox(uid: string) {
    const profile = this.read(uid);
    const read = new Set(
      (
        this.db
          .prepare("SELECT message_id FROM rs_inbox_read WHERE uid=?")
          .all(uid) as { message_id: string }[]
      ).map((r) => r.message_id),
    );
    return {
      checkedAt: profile.inboxCheckedAt ?? null,
      error: profile.inboxError ?? null,
      messages: (profile.inboxMessages ?? []).map((m) => ({
        ...m,
        read: m.read || read.has(m.id),
      })),
    };
  }
  // Marks the given messages, or every stored message, as read in this app.
  markInboxRead(uid: string, ids?: string[]) {
    const profile = this.read(uid);
    const known = new Set((profile.inboxMessages ?? []).map((m) => m.id));
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO rs_inbox_read(uid,message_id) VALUES (?,?)",
    );
    for (const id of ids ?? known) if (known.has(id)) insert.run(uid, id);
    return this.inbox(uid);
  }
  savePushToken(token: string) {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO push_tokens(token,created_at) VALUES (?,?)",
      )
      .run(token, new Date().toISOString());
  }
  pushTokens(): string[] {
    return (
      this.db.prepare("SELECT token FROM push_tokens").all() as {
        token: string;
      }[]
    ).map((r) => r.token);
  }
  removePushToken(token: string) {
    this.db.prepare("DELETE FROM push_tokens WHERE token=?").run(token);
  }
  close() {
    this.db.close();
  }
}
