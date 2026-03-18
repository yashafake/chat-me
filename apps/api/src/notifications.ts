import nodemailer from "nodemailer";
import type { Pool } from "pg";
import webpush from "web-push";

import { buildAdminConversationUrl, type AppConfig } from "./config.js";
import {
  getConversationEnvelope,
  insertNotification,
  listActivePushSubscriptions,
  markNotificationSent,
  revokeOperatorPushSubscriptionById,
  touchPushSubscriptionNotification
} from "./services/chat-service.js";

export interface SafeAlertPayload {
  project: string;
  conversation: number;
  adminUrl: string;
}

export function buildSafeAlertPayload(
  config: AppConfig,
  input: {
    projectKey: string;
    conversationId: number;
  }
): SafeAlertPayload {
  return {
    project: input.projectKey,
    conversation: input.conversationId,
    adminUrl: buildAdminConversationUrl(config, input.conversationId)
  };
}

export function formatTelegramAlert(payload: SafeAlertPayload): string {
  return [
    "New chat message",
    `project: ${payload.project}`,
    `conversation: ${payload.conversation}`,
    payload.adminUrl
  ].join("\n");
}

function buildWebPushPayload(payload: SafeAlertPayload): {
  title: string;
  body: string;
  path: string;
  tag: string;
} {
  const adminPath = new URL(payload.adminUrl).pathname;

  return {
    title: "New chat message",
    body: `project: ${payload.project} · conversation: ${payload.conversation}`,
    path: adminPath,
    tag: `chat-me-conversation-${payload.conversation}`
  };
}

async function sendEmail(config: AppConfig, payload: SafeAlertPayload): Promise<void> {
  if (!config.smtp.notifyTo) {
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth:
      config.smtp.user && config.smtp.password
        ? {
            user: config.smtp.user,
            pass: config.smtp.password
          }
        : undefined
  });

  await transporter.sendMail({
    from: config.smtp.from,
    to: config.smtp.notifyTo,
    subject: `New chat message · ${payload.project}`,
    text: formatTelegramAlert(payload),
    html: `
      <p><strong>New chat message</strong></p>
      <p>project: ${payload.project}</p>
      <p>conversation: ${payload.conversation}</p>
      <p><a href="${payload.adminUrl}">Open in admin</a></p>
    `
  });
}

async function sendTelegram(config: AppConfig, payload: SafeAlertPayload): Promise<void> {
  if (!config.telegram.enabled || !config.telegram.botToken || !config.telegram.chatId) {
    return;
  }

  const response = await fetch(
    `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text: formatTelegramAlert(payload),
        disable_web_page_preview: true
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Telegram alert failed with status ${response.status}`);
  }
}

async function sendWebPush(
  pool: Pool,
  config: AppConfig,
  payload: SafeAlertPayload
): Promise<number> {
  if (
    !config.webPush.enabled ||
    !config.webPush.publicKey ||
    !config.webPush.privateKey ||
    !config.webPush.subject
  ) {
    return 0;
  }

  const subscriptions = await listActivePushSubscriptions(pool);

  if (subscriptions.length === 0) {
    return 0;
  }

  webpush.setVapidDetails(
    config.webPush.subject,
    config.webPush.publicKey,
    config.webPush.privateKey
  );

  const safePayload = JSON.stringify(buildWebPushPayload(payload));
  const deliveredIds: number[] = [];

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dhKey,
              auth: subscription.authKey
            }
          },
          safePayload,
          {
            TTL: 60
          }
        );
        deliveredIds.push(subscription.id);
      } catch (error) {
        const statusCode =
          typeof error === "object" && error && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : 0;

        if (statusCode === 404 || statusCode === 410) {
          await revokeOperatorPushSubscriptionById(pool, subscription.id);
        }
      }
    })
  );

  if (deliveredIds.length > 0) {
    await touchPushSubscriptionNotification(pool, deliveredIds);
  }

  return deliveredIds.length;
}

export async function dispatchSafeNotification(
  pool: Pool,
  config: AppConfig,
  input: {
    conversationId: number;
    projectKey?: string;
    channel: "email" | "telegram" | "web_push";
  }
): Promise<void> {
  const envelope =
    input.projectKey && input.projectKey.trim()
      ? {
          conversationId: input.conversationId,
          projectKey: input.projectKey
        }
      : await getConversationEnvelope(pool, input.conversationId);

  if (!envelope) {
    return;
  }

  const safePayload = buildSafeAlertPayload(config, {
    projectKey: envelope.projectKey,
    conversationId: envelope.conversationId
  });
  let notificationId: number | null = null;

  try {
    if (input.channel === "email") {
      notificationId = await insertNotification(pool, {
        conversationId: envelope.conversationId,
        channel: input.channel,
        payloadSafe: safePayload
      });
      await sendEmail(config, safePayload);
      await markNotificationSent(pool, notificationId, true);
    } else {
      if (input.channel === "telegram") {
        notificationId = await insertNotification(pool, {
          conversationId: envelope.conversationId,
          channel: input.channel,
          payloadSafe: safePayload
        });
        await sendTelegram(config, safePayload);
        await markNotificationSent(pool, notificationId, true);
      } else {
        const deliveredCount = await sendWebPush(pool, config, safePayload);

        if (deliveredCount === 0) {
          return;
        }

        notificationId = await insertNotification(pool, {
          conversationId: envelope.conversationId,
          channel: input.channel,
          payloadSafe: {
            ...safePayload,
            recipients: deliveredCount
          }
        });
        await markNotificationSent(pool, notificationId, true);
      }
    }
  } catch (error) {
    if (notificationId === null) {
      notificationId = await insertNotification(pool, {
        conversationId: envelope.conversationId,
        channel: input.channel,
        payloadSafe: safePayload
      });
    }

    await markNotificationSent(pool, notificationId, false);
    throw error;
  }
}

export async function dispatchDefaultAlerts(
  pool: Pool,
  config: AppConfig,
  conversationId: number,
  projectKey: string
): Promise<void> {
  const jobs: Promise<void>[] = [];

  if (config.smtp.notifyTo) {
    jobs.push(
      dispatchSafeNotification(pool, config, {
        conversationId,
        projectKey,
        channel: "email"
      })
    );
  }

  if (config.telegram.enabled && config.telegram.botToken && config.telegram.chatId) {
    jobs.push(
      dispatchSafeNotification(pool, config, {
        conversationId,
        projectKey,
        channel: "telegram"
      })
    );
  }

  if (config.webPush.enabled) {
    jobs.push(
      dispatchSafeNotification(pool, config, {
        conversationId,
        projectKey,
        channel: "web_push"
      })
    );
  }

  await Promise.allSettled(jobs);
}
