import path from "node:path";

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

import { loadConfig } from "./config.js";
import { createPool, createRealtimeBridge, ChatEventHub, runSchema } from "./db/pool.js";
import { MemoryRateLimiter } from "./rate-limit.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerPublicRoutes } from "./routes/public.js";

async function main() {
  const config = loadConfig();
  const pool = createPool(config);
  await runSchema(pool);

  const hub = new ChatEventHub();
  const bridge = await createRealtimeBridge(config, hub);

  const app = Fastify({
    logger: true,
    trustProxy: true
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: true,
    credentials: true
  });

  await app.register(fastifyStatic, {
    root: config.widgetDistDir,
    prefix: "/widget/"
  });

  app.get("/health", async () => ({
    ok: true,
    uptime: process.uptime()
  }));

  app.get("/", async () => ({
    service: "chat-me-api",
    widgetBundle: path.join(config.widgetDistDir, "chat-me-widget.js")
  }));

  app.setErrorHandler((error, _request, reply) => {
    const statusCode = (error as Error & { statusCode?: number }).statusCode ?? 500;
    reply.status(statusCode).send({
      error: statusCode >= 500 ? "Internal server error" : error.message
    });
  });

  const publicLimiter = new MemoryRateLimiter();
  const loginLimiter = new MemoryRateLimiter();

  await registerPublicRoutes(app, {
    config,
    pool,
    hub,
    limiter: publicLimiter,
    publishEvent: bridge.publish
  });

  await registerAdminRoutes(app, {
    config,
    pool,
    hub,
    loginLimiter,
    publishEvent: bridge.publish
  });

  const close = async () => {
    await app.close();
    await bridge.close();
    await pool.end();
  };

  process.on("SIGINT", () => {
    void close();
  });
  process.on("SIGTERM", () => {
    void close();
  });

  await app.listen({
    host: config.host,
    port: config.port
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
