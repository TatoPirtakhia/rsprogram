import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";
config({
  path: fileURLToPath(new URL("../../../../.env", import.meta.url)),
  quiet: true,
});
export function configuration() {
  const env = z
    .object({
      NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
      PORT: z.coerce.number().default(3001),
      HOST: z.string().default("0.0.0.0"),
      DATABASE_URL: z
        .string()
        .default(
          "mysql://bizmonitor:local-development-only@localhost:3306/bizmonitor",
        ),
      JWT_SECRET: z.string().min(32),
      PROVIDER_MODE: z.literal("demo").default("demo"),
      CORS_ORIGIN: z.string().default("http://localhost:8081"),
    })
    .parse(process.env);
  if (
    env.NODE_ENV === "production" &&
    /replace|development|example/i.test(env.JWT_SECRET)
  )
    throw new Error("Production requires a strong JWT secret");
  return env;
}
