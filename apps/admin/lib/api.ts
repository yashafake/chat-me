"use client";

const CSRF_STORAGE_KEY = "chat-me-admin-csrf";

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configured) {
    return configured;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:4100";
}

export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function getStoredCsrfToken(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(CSRF_STORAGE_KEY) || "";
}

export function setStoredCsrfToken(value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(CSRF_STORAGE_KEY, value);
}

export function clearStoredCsrfToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(CSRF_STORAGE_KEY);
}

export async function apiFetch<T>(
  pathname: string,
  init: RequestInit = {},
  options?: {
    csrf?: boolean;
  }
): Promise<T> {
  const headers = new Headers(init.headers);

  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }

  if (options?.csrf) {
    const token = getStoredCsrfToken();

    if (token) {
      headers.set("x-chat-csrf", token);
    }
  }

  const response = await fetch(`${getApiBaseUrl()}${pathname}`, {
    ...init,
    headers,
    credentials: "include"
  });

  let payload: any = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(payload?.error || "Request failed", response.status);
  }

  return payload as T;
}
