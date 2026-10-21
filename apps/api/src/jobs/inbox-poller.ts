import type { ProfileStore } from "../modules/local-profile-routes.js";
import type { PortalMessage } from "../providers/rs-portal-inbox-client.js";
import { RsRequestError } from "../providers/soap-transport.js";
export interface PushMessage {
  title: string;
  body: string;
  data: Record<string, string>;
}
export type PushSender = (messages: PushMessage[]) => Promise<void>;
export interface InboxClient {
  getMessages(
    credentials: { username: string; password: string },
    taxpayerId: string,
  ): Promise<PortalMessage[]>;
}
// Sends to every registered device and forgets tokens Expo reports as
// no longer registered.
export function expoPushSender(store: ProfileStore): PushSender {
  return async (messages) => {
    const tokens = await store.pushTokens();
    if (!tokens.length || !messages.length) return;
    const batch = messages.flatMap((m) =>
      tokens.map((to) => ({ to, sound: "default", ...m })),
    );
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("PUSH_DELIVERY_FAILED");
    const result = (await response.json()) as {
      data?: { status: string; details?: { error?: string } }[];
    };
    for (const [i, ticket] of (result.data ?? []).entries()) {
      if (ticket.details?.error === "DeviceNotRegistered")
        await store.removePushToken(batch[i].to);
    }
  };
}
export function inboxPush(
  profile: { uid: string; name: string },
  fresh: PortalMessage[],
): PushMessage {
  return {
    title: profile.name,
    body:
      fresh.length === 1
        ? fresh[0].subject
        : `${fresh.length} ახალი შეტყობინება RS-დან`,
    data: { profileUid: profile.uid },
  };
}
// One pass over every profile that has a taxpayer ID. Profiles run one at a
// time so the portal never sees parallel logins from this server.
export async function checkInboxes(
  store: ProfileStore,
  client: InboxClient,
  send: PushSender,
) {
  const pushes: PushMessage[] = [];
  for (const profile of await store.list()) {
    if (!profile.taxpayerId) continue;
    try {
      const messages = await client.getMessages(
        await store.credentials(profile.uid),
        profile.taxpayerId,
      );
      const fresh = new Set(
        (await store.inboxResult(profile.uid, messages, null)).map((m) => m.id),
      );
      if (fresh.size)
        pushes.push(
          inboxPush(
            profile,
            messages.filter((m) => fresh.has(m.id)),
          ),
        );
    } catch (error) {
      await store.inboxResult(
        profile.uid,
        null,
        error instanceof RsRequestError ? error.code : "RS_CONNECTION_FAILED",
      );
    }
  }
  await send(pushes);
  return pushes;
}
export function startInboxPoller(
  store: ProfileStore,
  client: InboxClient,
  send: PushSender,
  intervalMs = 10 * 60 * 1000,
  log: (message: string) => void = console.log,
) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const pushes = await checkInboxes(store, client, send);
      if (pushes.length) log(`RS inbox: sent ${pushes.length} notification(s)`);
    } catch (error) {
      log(`RS inbox check failed: ${(error as Error).message}`);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
