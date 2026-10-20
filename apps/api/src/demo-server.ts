import { randomUUID } from "node:crypto";
import { hash, argon2id } from "argon2";
import { MemoryRepository } from "./database/repository.js";
import { createDemo } from "./providers/demo.js";
import { createApp } from "./app.js";
import { LocalProfileStore } from "./modules/local-profiles.js";
import { fileURLToPath } from "node:url";
if (process.env.NODE_ENV === "production")
  throw new Error("Ephemeral demo server forbidden in production");
const repo = new MemoryRepository();
const d = createDemo();
repo.datasets.set(d.business.uid, d);
repo.users.push({
  uid: randomUUID(),
  email: "demo@bizmonitor.ge",
  username: "demo",
  passwordHash: await hash("DemoPass!2026", { type: argon2id }),
  businessUid: d.business.uid,
});
const { app } = await createApp(repo, {
  jwtSecret: randomUUID() + randomUUID(),
  logger: true,
  localProfiles: new LocalProfileStore(
    fileURLToPath(new URL("../data/", import.meta.url)),
  ),
});
await app.listen({ port: 3001, host: "127.0.0.1" });
console.log(
  "Local RS profiles: persisted in apps/api/data/rs-profiles.sqlite; no application login required.",
);
