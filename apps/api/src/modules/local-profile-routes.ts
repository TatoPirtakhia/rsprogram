import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
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
) {
  const running = new Set<string>();
  await app.register(
    async (local) => {
      local.addHook("onRequest", async (req) => localOnly(req, allowedOrigin));
      local.get("/profiles", async () => result(store.list()));
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
