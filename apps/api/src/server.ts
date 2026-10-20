import { configuration } from "./config/index.js";
import { createPool } from "./database/pool.js";
import { MysqlRepository } from "./database/repository.js";
import { createApp } from "./app.js";
import { DEMO_BUSINESS } from "./providers/demo.js";
import { MysqlPushStore } from "./database/push-store.js";
const env = configuration();
const pool = createPool(env.DATABASE_URL);
await pool.query("SELECT 1");
const { app, sync, push } = await createApp(new MysqlRepository(pool), {
  jwtSecret: env.JWT_SECRET,
  logger: true,
  corsOrigin: env.CORS_ORIGIN,
  devices: new MysqlPushStore(pool),
});
const fiscal = setInterval(
  () => {
    void sync
      .sync(DEMO_BUSINESS, "rs-demo")
      .catch(() => app.log.warn("Scheduled demo fiscal sync failed"));
  },
  15 * 60 * 1000,
);
const banking = setInterval(
  () => {
    void sync
      .sync(DEMO_BUSINESS, "bank-demo")
      .catch(() => app.log.warn("Scheduled demo bank sync failed"));
  },
  30 * 60 * 1000,
);
const notifications = setInterval(() => {
  void push
    .dispatch(DEMO_BUSINESS)
    .catch(() => app.log.warn("Push delivery failed"));
}, 60000);
app.addHook("onClose", async () => {
  clearInterval(fiscal);
  clearInterval(banking);
  clearInterval(notifications);
  await pool.end();
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void app.close();
  });
await app.listen({ port: env.PORT, host: env.HOST });
