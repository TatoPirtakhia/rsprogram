import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import cors from "@fastify/cors";
import { config } from "dotenv";
import { resolve } from "node:path";
import { z, ZodError } from "zod";
import mysql from "mysql2/promise";
import { MysqlProfileStore } from "./database/mysql-profile-store.js";
import { registerLocalProfiles } from "./modules/local-profile-routes.js";
import { startInboxPoller, expoPushSender } from "./jobs/inbox-poller.js";
import { RsPortalInboxClient } from "./providers/rs-portal-inbox-client.js";
config({ path: resolve(process.cwd(), ".env"), quiet: true });
export function hostingConfiguration(source: NodeJS.ProcessEnv = process.env) {
  const env = z
    .object({
      NODE_ENV: z.literal("production").default("production"),
      PUBLIC_ORIGIN: z.url().refine((v) => {
        const u = new URL(v);
        return (
          u.protocol === "https:" &&
          !u.username &&
          !u.password &&
          u.pathname === "/" &&
          !u.search &&
          !u.hash
        );
      }, "Use an HTTPS origin without a path"),
      CONNECTION_KEY: z
        .string()
        .min(32)
        .max(2048)
        .regex(/^[A-Za-z0-9_-]+$/),
      CREDENTIAL_ENCRYPTION_KEY: z.string().regex(/^[a-f\d]{64}$/i),
      MYSQL_HOST: z.string().min(1),
      MYSQL_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
      MYSQL_DATABASE: z.string().min(1),
      MYSQL_USER: z.string().min(1),
      MYSQL_PASSWORD: z.string().min(1),
      MYSQL_SSL_CA: z.string().optional(),
      HOST: z.string().default("127.0.0.1"),
      PORT: z.coerce.number().int().min(1).max(65535).default(3000),
      RS_INBOX_POLL: z.enum(["0", "1"]).default("0"),
      RS_INBOX_INTERVAL_MINUTES: z.coerce.number().int().min(5).default(10),
    })
    .parse(source);
  if (
    /CHANGE|REPLACE|EXAMPLE/i.test(env.CONNECTION_KEY) ||
    /^0+$/.test(env.CREDENTIAL_ENCRYPTION_KEY)
  )
    throw new Error("Generate real keys before starting the server");
  return env;
}
export async function start() {
  const env = hostingConfiguration();
  const pool = mysql.createPool({
    host: env.MYSQL_HOST,
    port: env.MYSQL_PORT,
    database: env.MYSQL_DATABASE,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    ...(env.MYSQL_SSL_CA
      ? { ssl: { ca: env.MYSQL_SSL_CA, rejectUnauthorized: true } }
      : {}),
    connectionLimit: 4,
    charset: "utf8mb4",
    timezone: "Z",
    multipleStatements: false,
  });
  const store = new MysqlProfileStore(pool, env.CREDENTIAL_ENCRYPTION_KEY);
  try {
    await store.initialize();
  } catch (e) {
    await pool.end();
    throw e;
  }
  const app = Fastify({
    bodyLimit: 1_000_000,
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.x-preview-token",
        "req.headers.cookie",
        "body.password",
      ],
    },
  });
  // The installed iPhone client sends JSON Content-Type even for an empty DELETE.
  const parseJson = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      if (req.method === "DELETE" && body.length === 0)
        return done(null, undefined);
      parseJson(req, body.toString(), done);
    },
  );
  app.addHook("onRequest", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
  });
  await app.register(cors, { origin: new URL(env.PUBLIC_ORIGIN).origin });
  await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  app.setErrorHandler((error, _req, reply) => {
    const e = error as Error & { statusCode?: number };
    const status = error instanceof ZodError ? 400 : (e.statusCode ?? 500);
    const code =
      status === 400
        ? "VALIDATION_ERROR"
        : status === 401
          ? "UNAUTHORIZED"
          : status === 404
            ? "NOT_FOUND"
            : status === 409
              ? "CONFLICT"
              : status === 429
                ? "RATE_LIMITED"
                : "INTERNAL_ERROR";
    if (status >= 500) app.log.error({ errorName: e.name }, "Request failed");
    void reply.code(status).send({
      data: null,
      error: { code, message: code },
      meta: { source: "live", updatedAt: null, integrationState: "error" },
    });
  });
  app.get("/health", async () => ({
    status: "ok",
    mode: "server-client",
    database: "mysql",
  }));
  await registerLocalProfiles(
    app,
    store,
    new URL(env.PUBLIC_ORIGIN).origin,
    undefined,
    undefined,
    undefined,
    { connectionKey: env.CONNECTION_KEY, publicOrigin: env.PUBLIC_ORIGIN },
  );
  let stopPoll = () => {};
  app.addHook("onClose", async () => {
    stopPoll();
    await store.close();
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      void app.close();
    });
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (e) {
    await app.close();
    throw e;
  }
  if (env.RS_INBOX_POLL === "1")
    stopPoll = startInboxPoller(
      store,
      new RsPortalInboxClient(),
      expoPushSender(store),
      env.RS_INBOX_INTERVAL_MINUTES * 60000,
    );
  return app;
}
