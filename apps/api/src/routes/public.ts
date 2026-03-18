import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";

import {
  EnsureConversationInputSchema,
  SendMessageInputSchema,
  WidgetSessionInitInputSchema,
  pickLocale
} from "@chat-me/shared";

import { type AppConfig } from "../config.js";
import type { ChatEventHub, ChatRealtimeEvent } from "../db/pool.js";
import { dispatchDefaultAlerts } from "../notifications.js";
import { MemoryRateLimiter } from "../rate-limit.js";
import { getClientIp, getRequestOrigin } from "../security.js";
import {
  createVisitorMessage,
  ensureConversation,
  getProjectRowByKey,
  getVisitorConversation,
  insertAuditLog,
  listConversationMessages,
  upsertVisitor
} from "../services/chat-service.js";

function assert(condition: unknown, statusCode: number, message: string): asserts condition {
  if (!condition) {
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = statusCode;
    throw error;
  }
}

function isAllowedProjectOrigin(
  project: any,
  request: FastifyRequest,
  currentUrl?: string
): boolean {
  const allowedOrigins = project.allowed_origins ?? [];

  if (allowedOrigins.length === 0) {
    return true;
  }

  const candidates = new Set<string>();
  const requestOrigin = getRequestOrigin(request);

  if (requestOrigin) {
    candidates.add(requestOrigin.toLowerCase());
  }

  if (currentUrl) {
    try {
      const url = new URL(currentUrl);
      candidates.add(`${url.protocol}//${url.host}`.toLowerCase());
    } catch {
      return false;
    }
  }

  for (const candidate of candidates) {
    if (allowedOrigins.includes(candidate)) {
      return true;
    }
  }

  return false;
}

function writeSse(reply: FastifyReply, event: ChatRealtimeEvent): void {
  reply.raw.write(`event: ${event.type}\n`);
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

export async function registerPublicRoutes(
  app: FastifyInstance,
  context: {
    config: AppConfig;
    pool: Pool;
    hub: ChatEventHub;
    publishEvent(event: ChatRealtimeEvent): Promise<void>;
    limiter: MemoryRateLimiter;
  }
) {
  app.post("/v1/widget/session/init", async (request) => {
    const payload = WidgetSessionInitInputSchema.parse(request.body ?? {});
    const project = await getProjectRowByKey(context.pool, payload.projectKey);

    assert(project, 404, "Project not found");
    assert(project.status === "active", 403, "Project is not active");
    assert(isAllowedProjectOrigin(project, request, payload.currentUrl), 403, "Origin is not allowed");

    const visitorToken = payload.visitorToken || crypto.randomUUID();
    const visitor = await upsertVisitor(context.pool, {
      projectId: project.id,
      visitorToken,
      locale: pickLocale(payload.locale),
      name: payload.visitor?.name,
      email: payload.visitor?.email,
      phone: payload.visitor?.phone,
      metadata: payload.metadata
    });

    await insertAuditLog(context.pool, {
      action: "visitor.session.init",
      entityType: "visitor",
      entityId: String(visitor.id),
      payload: {
        projectKey: project.key
      }
    });

    return {
      visitorToken,
      project: {
        projectKey: project.key,
        displayName: project.display_name,
        allowedOrigins: project.allowed_origins ?? [],
        status: project.status,
        theme: {
          position: project.theme_config?.position ?? "bottom-right",
          borderRadius: project.theme_config?.borderRadius ?? 20,
          accentColor: project.theme_config?.accentColor,
          buttonLabel: project.theme_config?.buttonLabel
        },
        widget: {
          locale: project.widget_config?.locale ?? "ru",
          initialGreeting: project.widget_config?.initialGreeting,
          privacyUrl: project.widget_config?.privacyUrl,
          collectName: project.widget_config?.collectName ?? false,
          collectEmail: project.widget_config?.collectEmail ?? false,
          collectPhone: project.widget_config?.collectPhone ?? false
        }
      }
    };
  });

  app.post("/v1/widget/conversations/active", async (request) => {
    const payload = EnsureConversationInputSchema.parse(request.body ?? {});
    const project = await getProjectRowByKey(context.pool, payload.projectKey);

    assert(project, 404, "Project not found");
    assert(project.status === "active", 403, "Project is not active");
    assert(isAllowedProjectOrigin(project, request, payload.currentUrl), 403, "Origin is not allowed");

    const visitor = await upsertVisitor(context.pool, {
      projectId: project.id,
      visitorToken: payload.visitorToken,
      locale: project.widget_config?.locale ?? "ru",
      metadata: {}
    });
    const conversation = await ensureConversation(context.pool, {
      projectId: project.id,
      visitorId: visitor.id,
      currentUrl: payload.currentUrl,
      referrer: payload.referrer
    });
    const messages = await listConversationMessages(context.pool, {
      conversationId: conversation.conversationId
    });

    return {
      conversationId: conversation.conversationId,
      messages
    };
  });

  app.post("/v1/widget/messages", async (request) => {
    const payload = SendMessageInputSchema.parse(request.body ?? {});
    const project = await getProjectRowByKey(context.pool, payload.projectKey);

    assert(project, 404, "Project not found");
    assert(project.status === "active", 403, "Project is not active");
    assert(isAllowedProjectOrigin(project, request), 403, "Origin is not allowed");
    assert(payload.honeypot === "", 400, "Spam detected");

    const ip = getClientIp(request) ?? "unknown";
    const rateKey = `${payload.projectKey}:${payload.visitorToken}:${ip}`;
    assert(context.limiter.isAllowed(rateKey, 6, 30_000), 429, "Too many messages");

    const access = await getVisitorConversation(context.pool, payload);
    assert(access, 404, "Conversation not found");

    const message = await createVisitorMessage(context.pool, {
      conversationId: payload.conversationId,
      body: payload.body,
      metadata: payload.metadata
    });

    await context.publishEvent({
      type: "conversation.updated",
      conversationId: payload.conversationId,
      projectKey: payload.projectKey,
      messageId: message.id,
      occurredAt: new Date().toISOString()
    });

    await insertAuditLog(context.pool, {
      action: "visitor.message.create",
      entityType: "conversation",
      entityId: String(payload.conversationId),
      payload: {
        projectKey: payload.projectKey,
        messageId: message.id
      }
    });

    void dispatchDefaultAlerts(context.pool, context.config, payload.conversationId, payload.projectKey);

    return {
      message
    };
  });

  app.get("/v1/widget/conversations/:conversationId/messages", async (request) => {
    const params = request.params as { conversationId: string };
    const query = request.query as Record<string, string | undefined>;
    const conversationId = Number.parseInt(params.conversationId, 10);
    const projectKey = query.projectKey ?? "";
    const visitorToken = query.visitorToken ?? "";
    const afterId = query.afterId ? Number.parseInt(query.afterId, 10) : undefined;
    const project = await getProjectRowByKey(context.pool, projectKey);

    assert(project, 404, "Project not found");
    assert(isAllowedProjectOrigin(project, request), 403, "Origin is not allowed");

    const access = await getVisitorConversation(context.pool, {
      projectKey,
      visitorToken,
      conversationId
    });
    assert(access, 404, "Conversation not found");

    const messages = await listConversationMessages(context.pool, {
      conversationId,
      afterId
    });

    return {
      messages
    };
  });

  app.get("/v1/widget/conversations/:conversationId/stream", async (request, reply) => {
    const params = request.params as { conversationId: string };
    const query = request.query as Record<string, string | undefined>;
    const conversationId = Number.parseInt(params.conversationId, 10);
    const projectKey = query.projectKey ?? "";
    const visitorToken = query.visitorToken ?? "";
    const project = await getProjectRowByKey(context.pool, projectKey);

    assert(project, 404, "Project not found");
    assert(isAllowedProjectOrigin(project, request), 403, "Origin is not allowed");

    const access = await getVisitorConversation(context.pool, {
      projectKey,
      visitorToken,
      conversationId
    });
    assert(access, 404, "Conversation not found");

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    });
    reply.raw.write(": connected\n\n");

    const interval = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, context.config.sseHeartbeatMs);

    const unsubscribe = context.hub.subscribeConversation(conversationId, (event) => {
      writeSse(reply, event);
    });

    request.raw.on("close", () => {
      clearInterval(interval);
      unsubscribe();
      reply.raw.end();
    });

    return reply;
  });
}
