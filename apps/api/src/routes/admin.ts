import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";

import {
  AdminContactListQuerySchema,
  AdminConversationListQuerySchema,
  InternalNoteInputSchema,
  OperatorLoginInputSchema,
  OperatorProfileUpdateInputSchema,
  OperatorReplyInputSchema,
  SafeNotificationDispatchSchema,
  UpdateConversationStatusInputSchema,
  WebPushSubscriptionInputSchema,
  WebPushSubscriptionRevokeInputSchema
} from "@chat-me/shared";

import { isAllowedAdminOrigin, type AppConfig } from "../config.js";
import type { ChatEventHub, ChatRealtimeEvent } from "../db/pool.js";
import { dispatchSafeNotification } from "../notifications.js";
import { MemoryRateLimiter } from "../rate-limit.js";
import {
  clearAdminCookies,
  generateOpaqueToken,
  getClientIp,
  getRequestOrigin,
  setAdminCookies,
  sha256,
  verifyPassword
} from "../security.js";
import {
  createInternalNote,
  createOperatorReply,
  createOperatorSession,
  deleteOperatorSession,
  findOperatorByIdentifier,
  getConversationDetails,
  getConversationEnvelope,
  getConversationSummaryById,
  getOperatorSession,
  insertAuditLog,
  listAdminConversations,
  listConversationMessages,
  listProjects,
  listVisitorContacts,
  listOperatorPushSubscriptions,
  rotateOperatorSession,
  revokeOperatorPushSubscription,
  upsertOperatorPushSubscription,
  updateOperatorDisplayName,
  updateConversationStatus,
  updateOperatorSessionActivity
} from "../services/chat-service.js";

function assert(condition: unknown, statusCode: number, message: string): asserts condition {
  if (!condition) {
    const error = new Error(message) as Error & { statusCode?: number };
    error.statusCode = statusCode;
    throw error;
  }
}

async function requireAdminSession(
  request: FastifyRequest,
  reply: FastifyReply,
  context: {
    pool: Pool;
    config: AppConfig;
  },
  options?: {
    requireCsrf?: boolean;
  }
) {
  const sessionToken = request.cookies[context.config.sessionCookieName];

  assert(sessionToken, 401, "Unauthorized");
  const session = await getOperatorSession(context.pool, sha256(sessionToken));
  assert(session, 401, "Unauthorized");

  if (options?.requireCsrf) {
    const csrfHeader = request.headers["x-chat-csrf"];
    const csrfToken = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
    const csrfCookie = request.cookies[context.config.csrfCookieName];

    assert(
      typeof csrfToken === "string" &&
        typeof csrfCookie === "string" &&
        csrfToken === csrfCookie &&
        sha256(csrfToken) === session.csrfTokenHash,
      403,
      "CSRF validation failed"
    );
  }

  const nextExpiry = new Date(Date.now() + context.config.sessionTtlMs);
  await updateOperatorSessionActivity(context.pool, {
    sessionId: session.id,
    expiresAt: nextExpiry
  });

  const needsRotation = Date.now() - session.lastSeenAt.getTime() > 6 * 60 * 60 * 1000;

  if (needsRotation) {
    const nextSessionToken = generateOpaqueToken();
    const nextCsrfToken = generateOpaqueToken(18);
    await rotateOperatorSession(context.pool, {
      sessionId: session.id,
      sessionTokenHash: sha256(nextSessionToken),
      csrfTokenHash: sha256(nextCsrfToken),
      expiresAt: nextExpiry
    });
    setAdminCookies(reply, context.config, nextSessionToken, nextCsrfToken);

    return {
      ...session,
      user: session.user,
      csrfToken: nextCsrfToken
    };
  }

  return {
    ...session,
    csrfToken: request.cookies[context.config.csrfCookieName]
  };
}

function writeSse(reply: FastifyReply, event: ChatRealtimeEvent): void {
  reply.raw.write(`event: ${event.type}\n`);
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  context: {
    config: AppConfig;
    pool: Pool;
    hub: ChatEventHub;
    publishEvent(event: ChatRealtimeEvent): Promise<void>;
    loginLimiter: MemoryRateLimiter;
  }
) {
  app.post("/v1/admin/auth/login", async (request, reply) => {
    const origin = getRequestOrigin(request);
    assert(isAllowedAdminOrigin(context.config, origin), 403, "Admin origin is not allowed");

    const payload = OperatorLoginInputSchema.parse(request.body ?? {});
    const rateKey = `${payload.identifier}:${getClientIp(request) ?? "unknown"}`;
    assert(context.loginLimiter.isAllowed(rateKey, 6, 10 * 60 * 1000), 429, "Too many login attempts");

    const operator = await findOperatorByIdentifier(context.pool, payload.identifier);
    assert(operator && operator.is_active, 401, "Invalid credentials");

    const passwordOk = await verifyPassword(
      payload.password,
      context.config.passwordPepper,
      operator.password_hash
    );
    assert(passwordOk, 401, "Invalid credentials");

    const sessionToken = generateOpaqueToken();
    const csrfToken = generateOpaqueToken(18);
    await createOperatorSession(context.pool, {
      operatorId: operator.id,
      sessionTokenHash: sha256(sessionToken),
      csrfTokenHash: sha256(csrfToken),
      expiresAt: new Date(Date.now() + context.config.sessionTtlMs),
      ip: getClientIp(request),
      userAgent: request.headers["user-agent"] ?? null
    });
    setAdminCookies(reply, context.config, sessionToken, csrfToken);

    await insertAuditLog(context.pool, {
      operatorId: operator.id,
      action: "operator.login",
      entityType: "operator",
      entityId: String(operator.id),
      payload: {
        email: operator.email
      }
    });

    return {
      operator: {
        id: operator.id,
        email: operator.email,
        displayName: operator.display_name,
        role: operator.role
      },
      csrfToken
    };
  });

  app.get("/v1/admin/auth/me", async (request, reply) => {
    const session = await requireAdminSession(request, reply, context);
    return {
      operator: session.user,
      csrfToken: session.csrfToken
    };
  });

  app.post("/v1/admin/auth/logout", async (request, reply) => {
    const session = await requireAdminSession(request, reply, context, {
      requireCsrf: true
    });
    const token = request.cookies[context.config.sessionCookieName];

    if (token) {
      await deleteOperatorSession(context.pool, sha256(token));
    }

    clearAdminCookies(reply, context.config);

    await insertAuditLog(context.pool, {
      operatorId: session.user.id,
      action: "operator.logout",
      entityType: "operator",
      entityId: String(session.user.id),
      payload: {}
    });

    return {
      ok: true
    };
  });

  app.get("/v1/admin/projects", async (request, reply) => {
    await requireAdminSession(request, reply, context);
    return {
      projects: await listProjects(context.pool)
    };
  });

  app.get("/v1/admin/push/subscriptions", async (request, reply) => {
    const session = await requireAdminSession(request, reply, context);

    return {
      enabled: context.config.webPush.enabled,
      vapidPublicKey: context.config.webPush.publicKey ?? null,
      subscriptions: await listOperatorPushSubscriptions(context.pool, session.user.id)
    };
  });

  app.post("/v1/admin/push/subscriptions", async (request, reply) => {
    const session = await requireAdminSession(request, reply, context, {
      requireCsrf: true
    });
    assert(context.config.webPush.enabled, 503, "Web push is not configured");

    const payload = WebPushSubscriptionInputSchema.parse(request.body ?? {});
    await upsertOperatorPushSubscription(context.pool, {
      operatorId: session.user.id,
      endpoint: payload.endpoint,
      p256dhKey: payload.keys.p256dh,
      authKey: payload.keys.auth,
      deviceLabel: payload.deviceLabel,
      userAgent: request.headers["user-agent"] ?? null
    });

    await insertAuditLog(context.pool, {
      operatorId: session.user.id,
      action: "operator.push.subscribe",
      entityType: "operator",
      entityId: String(session.user.id),
      payload: {
        endpoint: payload.endpoint,
        deviceLabel: payload.deviceLabel ?? null
      }
    });

    return {
      ok: true
    };
  });

  app.post("/v1/admin/push/subscriptions/revoke", async (request, reply) => {
    const session = await requireAdminSession(request, reply, context, {
      requireCsrf: true
    });
    const payload = WebPushSubscriptionRevokeInputSchema.parse(request.body ?? {});

    await revokeOperatorPushSubscription(context.pool, {
      operatorId: session.user.id,
      endpoint: payload.endpoint
    });

    await insertAuditLog(context.pool, {
      operatorId: session.user.id,
      action: "operator.push.revoke",
      entityType: "operator",
      entityId: String(session.user.id),
      payload: {
        endpoint: payload.endpoint
      }
    });

    return {
      ok: true
    };
  });

  app.get("/v1/admin/conversations", async (request, reply) => {
    await requireAdminSession(request, reply, context);
    const query = AdminConversationListQuerySchema.parse(request.query ?? {});

    return {
      conversations: await listAdminConversations(context.pool, query)
    };
  });

  app.get("/v1/admin/contacts", async (request, reply) => {
    await requireAdminSession(request, reply, context);
    const query = AdminContactListQuerySchema.parse(request.query ?? {});

    return {
      contacts: await listVisitorContacts(context.pool, query)
    };
  });

  app.post("/v1/admin/profile", async (request, reply) => {
    const session = await requireAdminSession(request, reply, context, {
      requireCsrf: true
    });
    const payload = OperatorProfileUpdateInputSchema.parse(request.body ?? {});
    const operator = await updateOperatorDisplayName(context.pool, {
      operatorId: session.user.id,
      displayName: payload.displayName
    });

    assert(operator, 404, "Operator not found");

    await insertAuditLog(context.pool, {
      operatorId: session.user.id,
      action: "operator.profile.update",
      entityType: "operator",
      entityId: String(session.user.id),
      payload: {
        displayName: operator.displayName
      }
    });

    return {
      operator
    };
  });

  app.get("/v1/admin/conversations/:conversationId", async (request, reply) => {
    await requireAdminSession(request, reply, context);
    const params = request.params as { conversationId: string };
    const conversationId = Number.parseInt(params.conversationId, 10);
    assert(Number.isFinite(conversationId), 400, "Invalid conversation id");

    const conversation = await getConversationDetails(context.pool, conversationId);
    assert(conversation, 404, "Conversation not found");

    return {
      conversation
    };
  });

  app.get("/v1/admin/conversations/:conversationId/messages", async (request, reply) => {
    await requireAdminSession(request, reply, context);
    const params = request.params as { conversationId: string };
    const query = request.query as Record<string, string | undefined>;
    const conversationId = Number.parseInt(params.conversationId, 10);
    const afterId = query.afterId ? Number.parseInt(query.afterId, 10) : undefined;

    return {
      messages: await listConversationMessages(context.pool, {
        conversationId,
        afterId
      })
    };
  });

  app.post("/v1/admin/conversations/:conversationId/messages", async (request, reply) => {
    const session = await requireAdminSession(request, reply, context, {
      requireCsrf: true
    });
    const params = request.params as { conversationId: string };
    const conversationId = Number.parseInt(params.conversationId, 10);
    const payload = OperatorReplyInputSchema.parse(request.body ?? {});

    const message = await createOperatorReply(context.pool, {
      conversationId,
      operatorId: session.user.id,
      body: payload.body
    });

    const envelope = await getConversationEnvelope(context.pool, conversationId);

    if (envelope) {
      await context.publishEvent({
        type: "conversation.updated",
        conversationId,
        projectKey: envelope.projectKey,
        messageId: message.id,
        occurredAt: new Date().toISOString()
      });
    }

    await insertAuditLog(context.pool, {
      operatorId: session.user.id,
      action: "operator.message.create",
      entityType: "conversation",
      entityId: String(conversationId),
      payload: {
        messageId: message.id
      }
    });

    return {
      message
    };
  });

  app.post("/v1/admin/conversations/:conversationId/notes", async (request, reply) => {
    const session = await requireAdminSession(request, reply, context, {
      requireCsrf: true
    });
    const params = request.params as { conversationId: string };
    const conversationId = Number.parseInt(params.conversationId, 10);
    const payload = InternalNoteInputSchema.parse(request.body ?? {});

    const note = await createInternalNote(context.pool, {
      conversationId,
      operatorId: session.user.id,
      body: payload.body
    });

    await insertAuditLog(context.pool, {
      operatorId: session.user.id,
      action: "conversation.note.create",
      entityType: "conversation",
      entityId: String(conversationId),
      payload: {
        noteId: note.id
      }
    });

    return {
      note
    };
  });

  app.post("/v1/admin/conversations/:conversationId/status", async (request, reply) => {
    const session = await requireAdminSession(request, reply, context, {
      requireCsrf: true
    });
    const params = request.params as { conversationId: string };
    const conversationId = Number.parseInt(params.conversationId, 10);
    const payload = UpdateConversationStatusInputSchema.parse(request.body ?? {});

    await updateConversationStatus(context.pool, {
      conversationId,
      status: payload.status
    });

    const envelope = await getConversationEnvelope(context.pool, conversationId);

    if (envelope) {
      await context.publishEvent({
        type: "conversation.updated",
        conversationId,
        projectKey: envelope.projectKey,
        occurredAt: new Date().toISOString()
      });
    }

    await insertAuditLog(context.pool, {
      operatorId: session.user.id,
      action: "conversation.status.update",
      entityType: "conversation",
      entityId: String(conversationId),
      payload: {
        status: payload.status
      }
    });

    return {
      conversation: await getConversationSummaryById(context.pool, conversationId)
    };
  });

  app.post("/v1/admin/notifications/dispatch", async (request, reply) => {
    const session = await requireAdminSession(request, reply, context, {
      requireCsrf: true
    });
    const payload = SafeNotificationDispatchSchema.parse(request.body ?? {});

    await dispatchSafeNotification(context.pool, context.config, {
      conversationId: payload.conversationId,
      projectKey: payload.projectKey,
      channel: payload.channel
    });

    await insertAuditLog(context.pool, {
      operatorId: session.user.id,
      action: "notification.dispatch",
      entityType: "conversation",
      entityId: String(payload.conversationId),
      payload
    });

    return {
      ok: true
    };
  });

  app.get("/v1/admin/conversations/:conversationId/stream", async (request, reply) => {
    await requireAdminSession(request, reply, context);
    const params = request.params as { conversationId: string };
    const conversationId = Number.parseInt(params.conversationId, 10);
    const origin = getRequestOrigin(request);

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      ...(origin
        ? {
            "access-control-allow-origin": origin,
            "access-control-allow-credentials": "true",
            vary: "origin"
          }
        : {})
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
