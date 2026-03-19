"use client";

import { useEffect, useMemo, useState } from "react";

import { ApiError, apiFetch } from "../lib/api";

interface OperatorPushSubscriptionSummary {
  id: number;
  endpoint: string;
  deviceLabel: string | null;
  createdAt: string;
  lastSeenAt: string;
  lastNotifiedAt: string | null;
}

interface PushSubscriptionResponse {
  enabled: boolean;
  vapidPublicKey: string | null;
  subscriptions: OperatorPushSubscriptionSummary[];
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
}

const ADMIN_BASE_PATH = "/admin";

function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function isIosDevice(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function detectDeviceLabel(): string {
  if (typeof window === "undefined") {
    return "Operator device";
  }

  const userAgent = window.navigator.userAgent;
  const mode = isStandaloneDisplayMode() ? "PWA" : "Browser";

  if (/iphone/i.test(userAgent)) {
    return `iPhone ${mode}`;
  }

  if (/ipad/i.test(userAgent)) {
    return `iPad ${mode}`;
  }

  if (/android/i.test(userAgent)) {
    return `Android ${mode}`;
  }

  if (/macintosh/i.test(userAgent)) {
    return `Mac ${mode}`;
  }

  return `Desktop ${mode}`;
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
}

function formatShortDate(value: string | null): string {
  if (!value) {
    return "еще не отправлялись";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function OperatorPwaControls() {
  const [standalone, setStandalone] = useState(false);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<OperatorPushSubscriptionSummary[]>([]);
  const [currentEndpoint, setCurrentEndpoint] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refreshState() {
    const payload = await apiFetch<PushSubscriptionResponse>("/v1/admin/push/subscriptions");
    setEnabled(payload.enabled);
    setVapidPublicKey(payload.vapidPublicKey);
    setSubscriptions(payload.subscriptions);
  }

  async function refreshCurrentSubscription() {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    setCurrentEndpoint(subscription?.endpoint || "");
  }

  useEffect(() => {
    setStandalone(isStandaloneDisplayMode());
    setPushAvailable(
      typeof window !== "undefined" &&
        "Notification" in window &&
        "serviceWorker" in navigator &&
        "PushManager" in window
    );
    setPermission(typeof window !== "undefined" ? Notification.permission : "default");

    const media = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = () => {
      setStandalone(isStandaloneDisplayMode());
    };
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    media.addEventListener("change", handleDisplayModeChange);
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    void refreshState().catch((unknownError) => {
      const message =
        unknownError instanceof ApiError ? unknownError.message : "Не удалось загрузить настройки PWA.";
      setError(message);
    });
    void refreshCurrentSubscription();

    return () => {
      media.removeEventListener("change", handleDisplayModeChange);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const currentSubscription = useMemo(
    () => subscriptions.find((item) => item.endpoint === currentEndpoint) ?? null,
    [currentEndpoint, subscriptions]
  );

  async function handleInstall() {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setStandalone(isStandaloneDisplayMode());
  }

  async function handleEnablePush() {
    if (!pushAvailable || !enabled || !vapidPublicKey) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await navigator.serviceWorker.register(`${ADMIN_BASE_PATH}/sw.js`, {
        scope: `${ADMIN_BASE_PATH}/`
      });
      const registration = await navigator.serviceWorker.ready;
      let effectivePermission = Notification.permission;

      if (effectivePermission !== "granted") {
        effectivePermission = await Notification.requestPermission();
        setPermission(effectivePermission);
      }

      if (effectivePermission !== "granted") {
        throw new Error("Разрешение на push-уведомления не выдано.");
      }

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey)
        }));
      const json = subscription.toJSON();
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;

      if (!json.endpoint || !p256dh || !auth) {
        throw new Error("Браузер вернул неполную push-подписку.");
      }

      await apiFetch(
        "/v1/admin/push/subscriptions",
        {
          method: "POST",
          body: JSON.stringify({
            endpoint: json.endpoint,
            keys: {
              p256dh,
              auth
            },
            deviceLabel: detectDeviceLabel()
          })
        },
        {
          csrf: true
        }
      );

      setPermission("granted");
      await Promise.all([refreshState(), refreshCurrentSubscription()]);
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError
          ? unknownError.message
          : unknownError instanceof Error
            ? unknownError.message
            : "Не удалось включить push.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisablePush() {
    setBusy(true);
    setError("");

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint || currentSubscription?.endpoint;

      if (endpoint) {
        await apiFetch(
          "/v1/admin/push/subscriptions/revoke",
          {
            method: "POST",
            body: JSON.stringify({
              endpoint
            })
          },
          {
            csrf: true
          }
        );
      }

      if (subscription) {
        await subscription.unsubscribe();
      }

      await Promise.all([refreshState(), refreshCurrentSubscription()]);
    } catch (unknownError) {
      const message =
        unknownError instanceof ApiError
          ? unknownError.message
          : unknownError instanceof Error
            ? unknownError.message
            : "Не удалось отключить push.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50/90 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="text-xs uppercase tracking-[0.22em] text-slate-500">PWA / Push</div>
      <div className="mt-3 text-sm font-medium text-slate-950">
        {standalone ? "Админка открыта как приложение" : "Установите админку как приложение"}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        {isIosDevice() && !standalone
          ? "На iPhone: Safari -> Поделиться -> На экран Домой. Потом откройте иконку и включите push."
          : "Push приходит только как safe alert: без текста сообщения и без персональных данных."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {!standalone && installPrompt ? (
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-900 transition hover:bg-sky-100"
          >
            Установить PWA
          </button>
        ) : null}

        {standalone && enabled && currentSubscription ? (
          <button
            type="button"
            onClick={() => void handleDisablePush()}
            disabled={busy}
            className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 transition hover:bg-rose-100 disabled:opacity-60"
          >
            Отключить push на этом устройстве
          </button>
        ) : null}

        {standalone && enabled && !currentSubscription ? (
          <button
            type="button"
            onClick={() => void handleEnablePush()}
            disabled={busy || !pushAvailable || permission === "denied"}
            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-60"
          >
            Включить push
          </button>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-2 text-xs text-slate-500">
        <div className="flex items-center justify-between gap-3">
          <dt>Статус сервера</dt>
          <dd className="text-slate-900">{enabled ? "push включен" : "push не настроен"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Разрешение браузера</dt>
          <dd className="text-slate-900">{permission}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Активных устройств</dt>
          <dd className="text-slate-900">{subscriptions.length}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Последний safe alert</dt>
          <dd className="text-right text-slate-900">
            {formatShortDate(currentSubscription?.lastNotifiedAt || subscriptions[0]?.lastNotifiedAt || null)}
          </dd>
        </div>
      </dl>

      {currentSubscription ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
          Текущее устройство: {currentSubscription.deviceLabel || "подписка активна"}
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
