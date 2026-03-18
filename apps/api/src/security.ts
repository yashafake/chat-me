import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

import { sanitizePlainText } from "@chat-me/shared";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { AppConfig } from "./config.js";

const scrypt = promisify(scryptCallback);

export function generateOpaqueToken(size = 32): string {
  return randomBytes(size).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function hashPassword(password: string, pepper: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(`${password}${pepper}`, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  pepper: string,
  encodedHash: string
): Promise<boolean> {
  const [algorithm, salt, storedHash] = encodedHash.split(":");

  if (algorithm !== "scrypt" || !salt || !storedHash) {
    return false;
  }

  const derived = (await scrypt(`${password}${pepper}`, salt, 64)) as Buffer;
  const stored = Buffer.from(storedHash, "hex");

  return derived.length === stored.length && timingSafeEqual(derived, stored);
}

export function setAdminCookies(
  reply: FastifyReply,
  config: AppConfig,
  sessionToken: string,
  csrfToken: string
): void {
  const common = {
    path: "/",
    domain: config.sessionCookieDomain,
    secure: config.isProduction,
    sameSite: "lax" as const,
    maxAge: Math.floor(config.sessionTtlMs / 1000)
  };

  reply.setCookie(config.sessionCookieName, sessionToken, {
    ...common,
    httpOnly: true
  });
  reply.setCookie(config.csrfCookieName, csrfToken, {
    ...common,
    httpOnly: false
  });
}

export function clearAdminCookies(reply: FastifyReply, config: AppConfig): void {
  const options = {
    path: "/",
    domain: config.sessionCookieDomain
  };

  reply.clearCookie(config.sessionCookieName, options);
  reply.clearCookie(config.csrfCookieName, options);
}

export function getClientIp(request: FastifyRequest): string | null {
  const forwarded = request.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const candidate = raw?.split(",")[0]?.trim() || request.ip || "";

  return candidate || null;
}

export function getRequestOrigin(request: FastifyRequest): string | undefined {
  const originHeader = request.headers.origin;

  if (typeof originHeader === "string" && originHeader.trim()) {
    return originHeader;
  }

  const referer = request.headers.referer;

  if (typeof referer === "string" && referer.trim()) {
    try {
      const url = new URL(referer);
      return `${url.protocol}//${url.host}`;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function sanitizeMessage(value: string): string {
  return sanitizePlainText(value);
}
