import { randomUUID } from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { PushTokenStore } from "../modules/push.js";
export class MysqlPushStore implements PushTokenStore {
  constructor(private pool: Pool) {}
  async save(businessUid: string, userUid: string, token: string) {
    await this.pool.execute(
      "INSERT INTO push_devices(uid,business_uid,user_uid,token) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE business_uid=VALUES(business_uid),user_uid=VALUES(user_uid)",
      [randomUUID(), businessUid, userUid, token],
    );
  }
  async list(businessUid: string) {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT token FROM push_devices WHERE business_uid=?",
      [businessUid],
    );
    return rows.map((r) => r.token as string);
  }
}
export class MemoryPushStore implements PushTokenStore {
  private items = new Map<string, Set<string>>();
  async save(businessUid: string, _userUid: string, token: string) {
    const set = this.items.get(businessUid) ?? new Set<string>();
    set.add(token);
    this.items.set(businessUid, set);
  }
  async list(businessUid: string) {
    return [...(this.items.get(businessUid) ?? [])];
  }
}
