import type { Dataset } from "@biz/shared";
import type { Repository } from "../database/repository.js";
export interface PushTokenStore {
  save(businessUid: string, userUid: string, token: string): Promise<void>;
  list(businessUid: string): Promise<string[]>;
}
export class PushService {
  constructor(
    private repo: Repository,
    private devices: PushTokenStore,
  ) {}
  async dispatch(businessUid: string) {
    const d = await this.repo.load(businessUid);
    if (!d || !d.preferences.pushEnabled) return;
    const tokens = await this.devices.list(businessUid);
    if (!tokens.length) return;
    for (const notice of d.notifications) {
      const n = notice as typeof notice & { pushedAt?: string };
      if (n.read || n.pushedAt) continue;
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.EXPO_ACCESS_TOKEN
            ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(
          tokens.map((to) => ({
            to,
            sound: "default",
            title: "BizMonitor GE",
            body: d.preferences.detailedNotifications
              ? n.body
              : "გახსენით აპი შეტყობინების სანახავად.",
            data: { notificationUid: n.uid },
          })),
        ),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("PUSH_DELIVERY_FAILED");
      const result = (await response.json()) as { data?: { status: string }[] };
      if (
        result.data?.length !== tokens.length ||
        !result.data?.every((ticket) => ticket.status === "ok")
      )
        throw new Error("PUSH_TICKET_REJECTED");
      await this.repo.mutate(businessUid, (latest: Dataset) => {
        const record = latest.notifications.find((r) => r.uid === n.uid) as
          typeof n | undefined;
        if (record) record.pushedAt = new Date().toISOString();
      });
    }
  }
}
