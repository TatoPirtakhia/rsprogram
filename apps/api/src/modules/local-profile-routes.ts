import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import {
  LocalProfileStore,
  rsProfileSchema,
  type RsResponse,
} from "./local-profiles.js";
import {
  RsZReportClient,
  defaultReportRange,
  zReportRangeSchema,
  type ZReportRange,
} from "../providers/rs-zreport-client.js";
import { RsRequestError } from "../providers/soap-transport.js";
import { RsPortalDebtClient } from "../providers/rs-portal-debt-client.js";
import { RsPortalInboxClient } from "../providers/rs-portal-inbox-client.js";
import type { InboxClient } from "../jobs/inbox-poller.js";
const result = (data: unknown) => ({
  data,
  error: null,
  meta: {
    source: "live",
    updatedAt: new Date().toISOString(),
    integrationState: "local",
  },
});
export function localOnly(req: FastifyRequest, allowedOrigin: string) {
  const ip = req.ip.replace("::ffff:", "");
  const host = req.hostname;
  const origin = req.headers.origin;
  const previewHost = process.env.RS_PREVIEW_HOST;
  const previewToken = process.env.RS_PREVIEW_TOKEN;
  const supplied = req.headers["x-preview-token"];
  if (
    process.env.NODE_ENV !== "production" &&
    previewHost &&
    previewToken &&
    previewToken.length >= 32 &&
    host === previewHost &&
    (!origin ||
      origin === allowedOrigin ||
      origin === `http://${previewHost}:8081`) &&
    typeof supplied === "string" &&
    Buffer.byteLength(supplied) === Buffer.byteLength(previewToken) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(previewToken))
  )
    return;
  if (
    !["127.0.0.1", "::1"].includes(ip) ||
    !["localhost", "127.0.0.1", "[::1]", "::1"].includes(host) ||
    (origin && origin !== allowedOrigin)
  )
    throw Object.assign(new Error("LOCAL_ACCESS_ONLY"), { statusCode: 403 });
}
export async function registerLocalProfiles(
  app: FastifyInstance,
  store: LocalProfileStore,
  allowedOrigin: string,
  client: {
    getProfileInformation(
      credentials: { username: string; password: string },
      range: ZReportRange,
    ): Promise<RsResponse>;
  } = new RsZReportClient(),
  debtClient = new RsPortalDebtClient(),
  inboxClient: InboxClient = new RsPortalInboxClient(),
) {
  const running = new Set<string>();
  const debtRunning = new Set<string>();
  const inboxRunning = new Set<string>();
  await app.register(
    async (local) => {
      local.addHook("onRequest", async (req) => localOnly(req, allowedOrigin));
      local.get("/profiles", async () => result(store.list()));
      local.post("/push-token", async (req) => {
        const { token } = z
          .object({
            token: z
              .string()
              .max(200)
              .regex(/^Expo(?:nent)?PushToken\[[\w-]+\]$/),
          })
          .parse(req.body);
        store.savePushToken(token);
        return result({ registered: true });
      });
      local.post("/profiles/:uid/password", async (req, reply) => {
        const uid = z.uuid().parse((req.params as { uid: string }).uid);
        reply.header("Cache-Control", "no-store");
        return result({ password: store.credentials(uid).password });
      });
      local.post("/profiles/:uid/debt", async (req, reply) => {
        const uid = z.uuid().parse((req.params as { uid: string }).uid);
        const profile = store.get(uid);
        if (!profile.taxpayerId)
          return result(store.debtResult(uid, null, "RS_TAXPAYER_ID_REQUIRED"));
        if (debtRunning.has(uid))
          return reply.code(409).send({ error: { code: "SYNC_IN_PROGRESS" } });
        debtRunning.add(uid);
        try {
          const debt = await debtClient.getDebt(
            store.credentials(uid),
            profile.taxpayerId,
          );
          return result(store.portalResult(uid, debt, null));
        } catch (error) {
          return result(
            store.portalResult(
              uid,
              null,
              error instanceof RsRequestError
                ? error.code
                : "RS_CONNECTION_FAILED",
            ),
          );
        } finally {
          debtRunning.delete(uid);
        }
      });
      local.get("/profiles/:uid/inbox", async (req) =>
        result(
          store.inbox(z.uuid().parse((req.params as { uid: string }).uid)),
        ),
      );
      // Body { ids } marks those messages read; an empty body marks all.
      local.post("/profiles/:uid/inbox/read", async (req) => {
        const uid = z.uuid().parse((req.params as { uid: string }).uid);
        const { ids } = z
          .object({
            ids: z
              .array(z.string().regex(/^\d{1,20}$/))
              .max(500)
              .optional(),
          })
          .parse(req.body ?? {});
        return result(store.markInboxRead(uid, ids));
      });
      local.post("/profiles/:uid/inbox", async (req, reply) => {
        const uid = z.uuid().parse((req.params as { uid: string }).uid);
        const profile = store.get(uid);
        if (!profile.taxpayerId) {
          store.inboxResult(uid, null, "RS_TAXPAYER_ID_REQUIRED");
          return result(store.inbox(uid));
        }
        if (inboxRunning.has(uid))
          return reply.code(409).send({ error: { code: "SYNC_IN_PROGRESS" } });
        inboxRunning.add(uid);
        try {
          store.inboxResult(
            uid,
            await inboxClient.getMessages(
              store.credentials(uid),
              profile.taxpayerId,
            ),
            null,
          );
        } catch (error) {
          store.inboxResult(
            uid,
            null,
            error instanceof RsRequestError
              ? error.code
              : "RS_CONNECTION_FAILED",
          );
        } finally {
          inboxRunning.delete(uid);
        }
        return result(store.inbox(uid));
      });
      local.post("/profiles", async (req) =>
        result(store.save(rsProfileSchema.parse(req.body))),
      );
      local.get("/profiles/:uid", async (req) =>
        result(store.get(z.uuid().parse((req.params as { uid: string }).uid))),
      );
      local.patch("/profiles/:uid", async (req) =>
        result(
          store.save(
            rsProfileSchema.parse(req.body),
            z.uuid().parse((req.params as { uid: string }).uid),
          ),
        ),
      );
      local.delete("/profiles/:uid", async (req) => {
        store.delete(z.uuid().parse((req.params as { uid: string }).uid));
        return result({ deleted: true });
      });
      local.post("/profiles/:uid/sync", async (req, reply) => {
        const uid = z.uuid().parse((req.params as { uid: string }).uid);
        const range = zReportRangeSchema.parse({
          ...defaultReportRange(),
          ...z
            .object({
              from: z.iso.date().optional(),
              to: z.iso.date().optional(),
            })
            .parse(req.body ?? {}),
        });
        const credentials = store.credentials(uid);
        if (running.has(uid))
          return reply.code(409).send({
            data: null,
            error: { code: "SYNC_IN_PROGRESS", message: "SYNC_IN_PROGRESS" },
            meta: {
              source: "live",
              updatedAt: null,
              integrationState: "error",
            },
          });
        running.add(uid);
        try {
          return result(
            store.result(
              uid,
              await client.getProfileInformation(credentials, range),
              null,
            ),
          );
        } catch (error) {
          const code =
            error instanceof RsRequestError
              ? error.code
              : "RS_CONNECTION_FAILED";
          return result(store.result(uid, null, code));
        } finally {
          running.delete(uid);
        }
      });
    },
    { prefix: "/api/v1/local" },
  );
}
