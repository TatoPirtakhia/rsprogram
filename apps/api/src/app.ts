import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { verify } from "argon2";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { z, ZodError } from "zod";
import {
  loginSchema,
  querySchema,
  preferencesSchema,
  type Dataset,
  type Source,
  type Receipt,
  type BankTransaction,
} from "@biz/shared";
import type { Repository, Session } from "./database/repository.js";
import { dashboard, paginate, reconcile } from "./modules/finance.js";
import { SyncService } from "./jobs/scheduler.js";
import { previewCsv, type ImportPreview } from "./modules/imports.js";
import { MemoryPushStore } from "./database/push-store.js";
import { PushService, type PushTokenStore } from "./modules/push.js";
import { fiscalSummary } from "./modules/fiscal-summary.js";
import { localDate } from "@biz/shared";
import type { LocalProfileStore } from "./modules/local-profiles.js";
import { registerLocalProfiles } from "./modules/local-profile-routes.js";
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; sid: string; bid: string };
    user: { sub: string; sid: string; bid: string };
  }
}
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
export async function createApp(
  repo: Repository,
  options: {
    jwtSecret: string;
    logger?: boolean;
    corsOrigin?: string;
    devices?: PushTokenStore;
    localProfiles?: LocalProfileStore;
  },
) {
  const app = Fastify({
    logger: options.logger
      ? {
          redact: [
            "req.headers.authorization",
            "req.headers.x-preview-token",
            "req.headers.cookie",
            "body.password",
            "body.refreshToken",
          ],
        }
      : false,
    bodyLimit: 1_000_000,
  });
  await app.register(cors, {
    origin: options.corsOrigin ?? "http://localhost:8081",
  });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  await app.register(jwt, {
    secret: options.jwtSecret,
    sign: { expiresIn: "15m", iss: "bizmonitor", aud: "bizmonitor-mobile" },
    verify: { allowedIss: "bizmonitor", allowedAud: "bizmonitor-mobile" },
  });
  await app.register(swagger, {
    openapi: {
      info: { title: "BizMonitor GE Demo API", version: "1.0.0" },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });
  app.setErrorHandler((error, _req, reply) => {
    const e = error as Error & { statusCode?: number };
    const code =
      error instanceof ZodError
        ? "VALIDATION_ERROR"
        : e.message === "UNSUPPORTED"
          ? "UNSUPPORTED"
          : e.statusCode === 401
            ? "UNAUTHORIZED"
            : e.message === "BUSINESS_NOT_FOUND"
              ? "NOT_FOUND"
              : e.message === "ALREADY_LINKED"
                ? "CONFLICT"
                : e.statusCode && e.statusCode < 500
                  ? "REQUEST_ERROR"
                  : "INTERNAL_ERROR";
    const status =
      code === "VALIDATION_ERROR"
        ? 400
        : code === "UNSUPPORTED"
          ? 422
          : code === "UNAUTHORIZED"
            ? 401
            : code === "NOT_FOUND"
              ? 404
              : code === "CONFLICT"
                ? 409
                : (e.statusCode ?? 500);
    if (status >= 500)
      app.log.error(
        { err: { name: e.name, message: "Request failed" } },
        "Request failed",
      );
    reply.code(status).send({
      data: null,
      error: {
        code,
        message: status >= 500 ? "Unable to complete request" : code,
      },
      meta: { source: "demo", updatedAt: null, integrationState: "error" },
    });
  });
  const envelope = (
    data: unknown,
    source: Source = "demo",
    updatedAt: string | null = new Date().toISOString(),
  ) => ({
    data,
    error: null,
    meta: {
      source,
      updatedAt,
      integrationState: source === "demo" ? "simulated" : "imported",
    },
  });
  const sync = new SyncService(repo);
  const devices = options.devices ?? new MemoryPushStore();
  const push = new PushService(repo, devices);
  const previews = new Map<
    string,
    { businessUid: string; preview: ImportPreview }
  >();
  app.get("/health", async () => ({ status: "ok", mode: "demo" }));
  if (options.localProfiles)
    await registerLocalProfiles(
      app,
      options.localProfiles,
      options.corsOrigin ?? "http://localhost:8081",
    );
  app.post(
    "/api/v1/auth/login",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        body: {
          type: "object",
          required: ["username", "password"],
          properties: {
            username: { type: "string" },
            password: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const input = loginSchema.parse(req.body);
      const user = await repo.user(input.username.toLowerCase());
      if (!user || !(await verify(user.passwordHash, input.password)))
        return reply.code(401).send(envelopeError("INVALID_CREDENTIALS"));
      const refresh = randomBytes(32).toString("hex");
      const session: Session = {
        uid: randomUUID(),
        userUid: user.uid,
        businessUid: user.businessUid,
        refreshHash: digest(refresh),
        expiresAt: new Date(Date.now() + 30 * 86400000)
          .toISOString()
          .slice(0, 23)
          .replace("T", " "),
        revoked: false,
      };
      await repo.saveSession(session);
      await repo.audit(user.uid, user.businessUid, "auth.login");
      return envelope({
        accessToken: app.jwt.sign({
          sub: user.uid,
          sid: session.uid,
          bid: user.businessUid,
        }),
        refreshToken: `${session.uid}.${refresh}`,
      });
    },
  );
  app.post("/api/v1/auth/refresh", async (req, reply) => {
    const { refreshToken } = z
      .object({ refreshToken: z.string().max(200) })
      .parse(req.body);
    const [uid, secret] = refreshToken.split(".");
    const s = await repo.session(uid);
    if (
      !s ||
      s.revoked ||
      Date.parse(s.expiresAt.replace(" ", "T") + "Z") <= Date.now() ||
      !secret
    )
      return reply.code(401).send(envelopeError("SESSION_EXPIRED"));
    const newSecret = randomBytes(32).toString("hex");
    const valid = timingSafeEqual(
      Buffer.from(s.refreshHash),
      Buffer.from(digest(secret)),
    );
    if (
      !valid ||
      !(await repo.rotateSession(uid, digest(secret), digest(newSecret)))
    ) {
      await repo.revoke(uid);
      return reply.code(401).send(envelopeError("TOKEN_REUSE"));
    }
    return envelope({
      accessToken: app.jwt.sign({
        sub: s.userUid,
        sid: uid,
        bid: s.businessUid,
      }),
      refreshToken: `${uid}.${newSecret}`,
    });
  });
  await app.register(
    async (protectedApp) => {
      protectedApp.addHook("onRequest", async (req) => {
        await req.jwtVerify();
        const s = await repo.session(req.user.sid);
        if (
          !s ||
          s.revoked ||
          s.userUid !== req.user.sub ||
          s.businessUid !== req.user.bid ||
          Date.parse(s.expiresAt.replace(" ", "T") + "Z") <= Date.now()
        )
          throw Object.assign(new Error("UNAUTHORIZED"), { statusCode: 401 });
      });
      const data = async (req: { user: { bid: string } }) => {
        const d = await repo.load(req.user.bid);
        if (!d) throw new Error("BUSINESS_NOT_FOUND");
        return d;
      };
      protectedApp.post("/auth/logout", async (req) => {
        await repo.revoke(req.user.sid);
        return envelope({ loggedOut: true });
      });
      protectedApp.get("/me", async (req) =>
        envelope({ uid: req.user.sub, businessUid: req.user.bid }),
      );
      protectedApp.get("/businesses", async (req) =>
        envelope([(await data(req)).business]),
      );
      protectedApp.get("/businesses/:uid", async (req, reply) => {
        if ((req.params as { uid: string }).uid !== req.user.bid)
          return reply.code(404).send(envelopeError("NOT_FOUND"));
        return envelope((await data(req)).business);
      });
      protectedApp.get("/dashboard/summary", async (req) => {
        const d = await data(req);
        return envelope(dashboard(d), "demo", d.integrations[0].lastSuccessAt);
      });
      protectedApp.get("/dashboard/sales-chart", async (req) =>
        envelope(dashboard(await data(req)).chart),
      );
      for (const [path, key] of Object.entries({
        "/fiscal/registers": "registers",
        "/banking/accounts": "accounts",
        "/banking/settlements": "settlements",
        "/taxes/debts": "debts",
        "/taxes/obligations": "obligations",
        "/taxes/declarations": "declarations",
        "/taxes/calendar": "obligations",
        "/integrations": "integrations",
        "/notifications": "notifications",
        "/reconciliations": "reconciliations",
        "/settings": "preferences",
        "/diagnostics": "logs",
      }))
        protectedApp.get(path, async (req) =>
          envelope((await data(req))[key as keyof Dataset]),
        );
      for (const kind of ["receipts", "transactions"] as const)
        protectedApp.get(
          kind === "receipts" ? "/fiscal/receipts" : "/banking/transactions",
          async (req) => {
            const q = querySchema.parse(req.query);
            const d = await data(req);
            const records =
              kind === "receipts"
                ? d.receipts.filter(
                    (r) => !q.register || r.registerUid === q.register,
                  )
                : d.transactions;
            const source = z
              .enum(["demo", "import"])
              .default("demo")
              .parse((req.query as { source?: string }).source);
            const result = paginate(
              records.filter((r) => r.source === source),
              q,
            );
            return {
              ...envelope(result, source),
              meta: {
                ...envelope(null, source).meta,
                pagination: {
                  page: q.page,
                  limit: q.limit,
                  total: result.total,
                },
              },
            };
          },
        );
      protectedApp.get("/fiscal/receipts/:uid", async (req, reply) => {
        const r = (await data(req)).receipts.find(
          (r) => r.uid === (req.params as { uid: string }).uid,
        );
        return r
          ? envelope(r, r.source, r.syncedAt)
          : reply.code(404).send(envelopeError("NOT_FOUND"));
      });
      protectedApp.get("/fiscal/daily-summary", async (req) =>
        envelope(dashboard(await data(req)).chart),
      );
      protectedApp.get("/fiscal/summary", async (req) => {
        const q = querySchema.parse(req.query);
        const source = z
          .enum(["demo", "import"])
          .default("demo")
          .parse((req.query as { source?: string }).source);
        const d = await data(req);
        const records = d.receipts.filter(
          (r) =>
            r.source === source &&
            (!q.register || r.registerUid === q.register) &&
            (!q.from || localDate(new Date(r.occurredAt)) >= q.from) &&
            (!q.to || localDate(new Date(r.occurredAt)) <= q.to) &&
            JSON.stringify(r).toLowerCase().includes(q.search.toLowerCase()),
        );
        return envelope(
          fiscalSummary(records),
          source,
          records
            .map((r) => r.syncedAt)
            .sort()
            .at(-1) ?? null,
        );
      });
      protectedApp.get("/reconciliations/candidates", async (req) => {
        const d = await data(req);
        const matches = d.receipts
          .filter(
            (r) =>
              r.status === "sale" &&
              !d.reconciliations.some((l) => l.receiptUid === r.uid),
          )
          .flatMap((r) =>
            d.transactions
              .filter(
                (tx) =>
                  tx.direction === "incoming" &&
                  tx.source === r.source &&
                  tx.amount === r.amount &&
                  Math.abs(
                    Date.parse(tx.occurredAt) - Date.parse(r.occurredAt),
                  ) <=
                    3 * 86400000 &&
                  !d.reconciliations.some((l) => l.transactionUid === tx.uid),
              )
              .map((tx) => ({
                receiptUid: r.uid,
                transactionUid: tx.uid,
                reason: "equal amount within 3 days; manual review required",
              })),
          );
        return envelope(matches.slice(0, 100));
      });
      protectedApp.post("/reconciliations", async (req) => {
        const input = z
          .object({
            receiptUid: z.uuid(),
            transactionUid: z.uuid(),
            note: z.string().min(1).max(500),
          })
          .parse(req.body);
        const linked = await repo.mutate(req.user.bid, (d) => {
          const link = {
            uid: randomUUID(),
            ...reconcile(d, input.receiptUid, input.transactionUid, input.note),
            createdAt: new Date().toISOString(),
          };
          d.reconciliations.push(link);
          return link;
        });
        await repo.audit(req.user.sub, req.user.bid, "reconciliation.create");
        return envelope(linked);
      });
      protectedApp.post("/integrations/:uid/sync", async (req) => {
        const result = await sync.sync(
          req.user.bid,
          (req.params as { uid: string }).uid,
        );
        await repo.audit(req.user.sub, req.user.bid, "integration.sync");
        return envelope(result);
      });
      protectedApp.get("/integrations/:uid/status", async (req, reply) => {
        const i = (await data(req)).integrations.find(
          (i) => i.uid === (req.params as { uid: string }).uid,
        );
        return i
          ? envelope(i)
          : reply.code(404).send(envelopeError("NOT_FOUND"));
      });
      protectedApp.patch("/notifications/:uid/read", async (req) =>
        envelope(
          await repo.mutate(req.user.bid, (d) => {
            const n = d.notifications.find(
              (n) => n.uid === (req.params as { uid: string }).uid,
            );
            if (!n)
              throw Object.assign(new Error("NOT_FOUND"), { statusCode: 404 });
            n.read = true;
            return n;
          }),
        ),
      );
      protectedApp.patch("/settings", async (req) => {
        const value = preferencesSchema.parse(req.body);
        return envelope(
          await repo.mutate(req.user.bid, (d) => (d.preferences = value)),
        );
      });
      protectedApp.patch("/business", async (req) => {
        const value = z
          .object({ name: z.string().min(2).max(200) })
          .parse(req.body);
        return envelope(
          await repo.mutate(req.user.bid, (d) => {
            d.business.name = value.name;
            return d.business;
          }),
        );
      });
      protectedApp.post("/imports/preview", async (req) => {
        const input = z
          .object({
            csv: z.string().max(800_000),
            kind: z.enum(["receipts", "transactions"]),
          })
          .parse(req.body);
        const preview = previewCsv(input.csv, input.kind, await data(req));
        for (const [key, item] of previews)
          if (Date.now() - Date.parse(item.preview.createdAt) > 900000)
            previews.delete(key);
        if (previews.size >= 100)
          throw Object.assign(new Error("IMPORT_CAPACITY"), {
            statusCode: 429,
          });
        previews.set(preview.uid, { businessUid: req.user.bid, preview });
        return envelope(preview, "import");
      });
      protectedApp.post("/imports/:uid/confirm", async (req, reply) => {
        const stored = previews.get((req.params as { uid: string }).uid);
        if (
          !stored ||
          stored.businessUid !== req.user.bid ||
          stored.preview.confirmed ||
          Date.now() - Date.parse(stored.preview.createdAt) > 900000
        )
          return reply.code(404).send(envelopeError("IMPORT_NOT_FOUND"));
        const p = stored.preview;
        const inserted = await repo.mutate(req.user.bid, (d) => {
          let count = 0;
          for (const row of p.rows) {
            const collection =
              p.kind === "receipts" ? d.receipts : d.transactions;
            if (
              collection.some(
                (r) => r.source === "import" && r.externalId === row.externalId,
              )
            )
              continue;
            if (p.kind === "receipts") d.receipts.push(row as Receipt);
            else d.transactions.push(row as BankTransaction);
            count++;
          }
          return count;
        });
        p.confirmed = true;
        await repo.audit(req.user.sub, req.user.bid, "import.confirm");
        return envelope({ inserted }, "import");
      });
      protectedApp.post("/imports/container", async (req) => {
        const input = z
          .object({
            kind: z.enum(["register", "account"]),
            name: z.string().min(2).max(100),
          })
          .parse(req.body);
        return envelope(
          await repo.mutate(req.user.bid, (d) => {
            const p = {
              source: "import" as const,
              sourceAt: new Date().toISOString(),
              syncedAt: new Date().toISOString(),
              uid: randomUUID(),
            };
            if (input.kind === "register") {
              const r = {
                ...p,
                name: input.name,
                externalId: p.uid,
                status: "active",
              };
              d.registers.push(r);
              return r;
            }
            const a = {
              ...p,
              bank: input.name,
              iban: "User import",
              balance: null,
              currency: "GEL" as const,
            };
            d.accounts.push(a);
            return a;
          }),
          "import",
        );
      });
      protectedApp.post("/notifications/device", async (req) => {
        const { token } = z
          .object({
            token: z
              .string()
              .regex(/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/),
          })
          .parse(req.body);
        await devices.save(req.user.bid, req.user.sub, token);
        await repo.mutate(req.user.bid, (d) => {
          d.preferences.pushEnabled = true;
        });
        return envelope({ registered: true });
      });
      protectedApp.get("/account/export", async (req) =>
        envelope(await data(req)),
      );
      protectedApp.delete("/account", async (req) => {
        const { confirmation } = z
          .object({ confirmation: z.literal("DELETE") })
          .parse(req.body);
        if (confirmation === "DELETE")
          await repo.deleteAccount(req.user.sub, req.user.bid);
        return envelope({ deleted: true });
      });
    },
    { prefix: "/api/v1" },
  );
  return { app, sync, push };
}
function envelopeError(code: string) {
  return {
    data: null,
    error: { code, message: code },
    meta: { source: "demo", updatedAt: null, integrationState: "error" },
  };
}
