import { fetch as nativeFetch } from "expo/fetch";
import { localDate } from "@biz/shared";
import { deviceStore, publicProfile } from "./store";
import { RsZReportClient, zReportRangeSchema } from "./zreport";
import { readPortal } from "./portal-session";
import { parseBudgetAccounting, parsePortalMessages } from "./portal-parsers";
import type {
  RsProfile,
  RsZReportResponse,
  RsInbox,
  RsInboxMessage,
} from "../../features/rs-profiles/types";
const reports = new RsZReportClient(nativeFetch as unknown as typeof fetch);
const running = new Set<string>();
export async function deviceApi<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
  const match = path.match(
    /^\/local\/profiles(?:\/([a-f0-9-]{36})(?:\/(password|sync|debt|inbox)(\/read)?)?)?$/i,
  );
  if (!match) throw new Error("DEVICE_ROUTE_UNAVAILABLE");
  const [, uid, action, read] = match;
  let result: unknown;
  if (!uid) {
    if (method === "GET") result = await deviceStore.list();
    else if (method === "POST") result = await deviceStore.save(body);
    else throw new Error("DEVICE_ROUTE_UNAVAILABLE");
  } else if (!action) {
    if (method === "GET") result = publicProfile(await deviceStore.read(uid));
    else if (method === "PATCH") result = await deviceStore.save(body, uid);
    else if (method === "DELETE") {
      await deviceStore.delete(uid);
      result = { deleted: true };
    } else throw new Error("DEVICE_ROUTE_UNAVAILABLE");
  } else if (action === "password" && method === "POST")
    result = { password: (await deviceStore.read(uid)).password };
  else if (action === "inbox" && method === "GET" && !read)
    result = (await deviceStore.read(uid)).inbox;
  else if (action === "inbox" && method === "POST" && read) {
    result = (
      await deviceStore.update(uid, (p) => {
        p.inbox.messages = p.inbox.messages.map((m) =>
          !body.ids || body.ids.includes(m.id) ? { ...m, read: true } : m,
        );
      })
    ).inbox;
  } else if (method === "POST" && !read) {
    const key = uid + ":" + action;
    if (running.has(key)) throw new Error("SYNC_IN_PROGRESS");
    running.add(key);
    try {
      const profile = await deviceStore.read(uid);
      if (action === "sync") {
        const today = localDate();
        const range = zReportRangeSchema.parse({
          from: today,
          to: today,
          ...body,
        });
        let response: RsZReportResponse | undefined;
        let error: string | null = null;
        try {
          response = await reports.getProfileInformation(profile, range);
        } catch (e) {
          error = errorCode(e);
        }
        result = publicProfile(
          await deviceStore.update(
            uid,
            (p) => {
              p.lastAttemptAt = new Date().toISOString();
              p.errorCode = error;
              p.connectionState = error ? "error" : "received";
              if (response) {
                p.response = response;
                p.lastSuccessAt = response.fetchedAt;
              }
            },
            profile.revision,
          ),
        );
      } else if (action === "debt") {
        let debt: RsProfile["portalDebt"];
        let error: string | null = null;
        try {
          if (!profile.taxpayerId) throw new Error("RS_TAXPAYER_ID_REQUIRED");
          debt = {
            ...parseBudgetAccounting(
              await readPortal(profile, profile.taxpayerId, "debt"),
              localDate(),
            ),
            source: "RS_PORTAL" as const,
            sourceUrl: "https://eservices.rs.ge/Accounting.aspx",
            checkedAt: new Date().toISOString(),
          };
        } catch (e) {
          error = errorCode(e);
        }
        result = publicProfile(
          await deviceStore.update(
            uid,
            (p) => {
              p.debtAttemptAt = new Date().toISOString();
              p.debtError = error;
              if (debt) p.portalDebt = debt;
            },
            profile.revision,
          ),
        );
      } else if (action === "inbox") {
        let messages: RsInboxMessage[] | undefined;
        let error: string | null = null;
        try {
          if (!profile.taxpayerId) throw new Error("RS_TAXPAYER_ID_REQUIRED");
          messages = parsePortalMessages(
            await readPortal(profile, profile.taxpayerId, "inbox"),
          );
        } catch (e) {
          error = errorCode(e);
        }
        result = (
          await deviceStore.update(
            uid,
            (p) => {
              p.inbox.error = error;
              if (messages) {
                const readIds = new Set(
                  p.inbox.messages.filter((m) => m.read).map((m) => m.id),
                );
                p.inbox.messages = messages.map((m) => ({
                  ...m,
                  read: m.read || readIds.has(m.id),
                }));
                p.inbox.checkedAt = new Date().toISOString();
              }
            },
            profile.revision,
          )
        ).inbox satisfies RsInbox;
      } else throw new Error("DEVICE_ROUTE_UNAVAILABLE");
    } finally {
      running.delete(key);
    }
  } else throw new Error("DEVICE_ROUTE_UNAVAILABLE");
  return result as T;
}
function errorCode(error: unknown) {
  return error instanceof Error && /^RS_[A-Z_]+$/.test(error.message)
    ? error.message
    : "RS_CONNECTION_FAILED";
}
