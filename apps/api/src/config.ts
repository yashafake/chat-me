import path from "node:path";

import { normalizeOrigin, normalizeOrigins } from "@chat-me/shared";

function readRequired(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required env variable: ${name}`);
  }

  return value;
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);

  if (Number.isNaN(value)) {
    throw new Error(`Env variable ${name} must be a number`);
  }

  return value;
}

function readBoolean(name: string, fallback = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase();

  if (!raw) {
    return fallback;
  }

  return raw === "1" || raw === "true" || raw === "yes";
}

function readOrigins(...values: Array<string | undefined>): string[] {
  return normalizeOrigins(
    values
      .flatMap((value) => value?.split(",") ?? [])
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  databaseUrl: string;
  host: string;
  port: number;
  apiPublicBaseUrl: string;
  adminPublicUrl: string;
  adminOrigins: string[];
  sessionCookieName: string;
  csrfCookieName: string;
  sessionCookieDomain?: string;
  sessionTtlMs: number;
  passwordPepper: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    from: string;
    notifyTo?: string;
  };
  telegram: {
    enabled: boolean;
    botToken?: string;
    chatId?: string;
  };
  widgetDistDir: string;
  sseHeartbeatMs: number;
}

export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV?.trim() || "development";
  const adminPublicUrl = process.env.ADMIN_PUBLIC_URL?.trim() || "http://localhost:3100";

  return {
    nodeEnv,
    isProduction: nodeEnv === "production",
    databaseUrl: readRequired("DATABASE_URL"),
    host: process.env.API_HOST?.trim() || "0.0.0.0",
    port: readNumber("API_PORT", 4100),
    apiPublicBaseUrl: process.env.API_PUBLIC_BASE_URL?.trim() || "http://localhost:4100",
    adminPublicUrl,
    adminOrigins: readOrigins(
      adminPublicUrl,
      process.env.NEXT_PUBLIC_ADMIN_URL,
      process.env.ADMIN_ALLOWED_ORIGINS
    ),
    sessionCookieName: process.env.SESSION_COOKIE_NAME?.trim() || "chat_me_admin_session",
    csrfCookieName: process.env.CSRF_COOKIE_NAME?.trim() || "chat_me_admin_csrf",
    sessionCookieDomain: process.env.SESSION_COOKIE_DOMAIN?.trim() || undefined,
    sessionTtlMs: readNumber("SESSION_TTL_HOURS", 24 * 7) * 60 * 60 * 1000,
    passwordPepper: readRequired("PASSWORD_PEPPER"),
    smtp: {
      host: process.env.SMTP_HOST?.trim() || "127.0.0.1",
      port: readNumber("SMTP_PORT", 1025),
      secure: readBoolean("SMTP_SECURE", false),
      user: process.env.SMTP_USER?.trim() || undefined,
      password: process.env.SMTP_PASSWORD?.trim() || undefined,
      from: process.env.SMTP_FROM?.trim() || "chat-me <no-reply@localhost>",
      notifyTo: process.env.NOTIFICATION_EMAIL_TO?.trim() || undefined
    },
    telegram: {
      enabled: readBoolean("TELEGRAM_ALERTS_ENABLED", false),
      botToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
      chatId: process.env.TELEGRAM_CHAT_ID?.trim() || undefined
    },
    widgetDistDir: path.resolve(process.cwd(), "../widget/dist"),
    sseHeartbeatMs: readNumber("SSE_HEARTBEAT_MS", 20_000)
  };
}

export function buildAdminConversationUrl(config: AppConfig, conversationId: number): string {
  const base = new URL(config.adminPublicUrl);
  base.pathname = `/chat/${conversationId}`;
  return base.toString();
}

export function isAllowedAdminOrigin(config: AppConfig, value: string | undefined): boolean {
  if (!value) {
    return !config.isProduction;
  }

  return config.adminOrigins.includes(normalizeOrigin(value));
}
