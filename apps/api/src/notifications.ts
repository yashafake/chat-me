import nodemailer from "nodemailer";
import type { Pool } from "pg";

import { buildAdminConversationUrl, type AppConfig } from "./config.js";
import { getConversationEnvelope, insertNotification, markNotificationSent } from "./services/chat-service.js";

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

export async function dispatchSafeNotification(
  pool: Pool,
  config: AppConfig,
  input: {
    conversationId: number;
    projectKey?: string;
    channel: "email" | "telegram";
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
  const notificationId = await insertNotification(pool, {
    conversationId: envelope.conversationId,
    channel: input.channel,
    payloadSafe: safePayload
  });

  try {
    if (input.channel === "email") {
      await sendEmail(config, safePayload);
    } else {
      await sendTelegram(config, safePayload);
    }

    await markNotificationSent(pool, notificationId, true);
  } catch (error) {
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

  await Promise.allSettled(jobs);
}
