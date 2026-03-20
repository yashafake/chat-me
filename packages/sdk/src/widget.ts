import { defaultWidgetStrings } from "@chat-me/shared";

import {
  ChatApiClient,
  type ChatWidgetConfig,
  type ChatWidgetVisitorFields,
  type PublicProjectConfig,
  type WidgetMessage
} from "./client";

const STORAGE_PREFIX = "chat-me:visitor:";

export interface ChatWidgetController {
  open(draft?: string): void;
  close(): void;
  destroy(): void;
}

type LocaleStrings = (typeof defaultWidgetStrings)["en" | "ru"];

interface WidgetState {
  open: boolean;
  bootstrapped: boolean;
  loading: boolean;
  sending: boolean;
  leadSaving: boolean;
  leadCaptured: boolean;
  error: string;
  connected: boolean;
  fallbackPolling: boolean;
  visitorToken: string;
  conversationId: number | null;
  project: PublicProjectConfig | null;
  messages: WidgetMessage[];
  draft: string;
  visitor: ChatWidgetVisitorFields;
}

function visitorTokenKey(projectKey: string): string {
  return `${STORAGE_PREFIX}${projectKey}`;
}

function readVisitorToken(projectKey: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(visitorTokenKey(projectKey)) || "";
}

function writeVisitorToken(projectKey: string, token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(visitorTokenKey(projectKey), token);
}

function formatTime(value: string, locale: "ru" | "en"): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function clamp(value: string): string {
  return value.replace(/\s+\n/g, "\n").trim().slice(0, 4000);
}

function normalizeDraft(value: string | undefined): string {
  return (value || "").slice(0, 4000);
}

function resolveTarget(target: string | HTMLElement | undefined): HTMLElement {
  if (typeof document === "undefined") {
    throw new Error("DOM is not available for chat widget");
  }

  if (!target) {
    const element = document.createElement("div");
    document.body.appendChild(element);
    return element;
  }

  if (typeof target === "string") {
    const element = document.querySelector<HTMLElement>(target);

    if (!element) {
      throw new Error(`Target element not found: ${target}`);
    }

    return element;
  }

  return target;
}

function mergeMessages<T extends { id: number }>(current: T[], incoming: T[]): T[] {
  if (!incoming.length) {
    return current;
  }

  const merged = new Map<number, T>();

  for (const message of current) {
    merged.set(message.id, message);
  }

  for (const message of incoming) {
    merged.set(message.id, message);
  }

  return Array.from(merged.values()).sort((left, right) => left.id - right.id);
}

function getStrings(locale: "ru" | "en"): LocaleStrings {
  return defaultWidgetStrings[locale];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasText(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function isValidEmail(value: string | undefined): boolean {
  if (!hasText(value)) {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value!.trim());
}

function getLeadContactValue(visitor: ChatWidgetVisitorFields): string {
  return visitor.email?.trim() || visitor.phone?.trim() || "";
}

function applyLeadContactValue(visitor: ChatWidgetVisitorFields, value: string): void {
  const trimmed = value.trim();

  if (!trimmed) {
    visitor.email = undefined;
    visitor.phone = undefined;
    return;
  }

  if (trimmed.includes("@")) {
    visitor.email = trimmed.toLowerCase();
    visitor.phone = undefined;
    return;
  }

  visitor.phone = trimmed;
  visitor.email = undefined;
}

function requiresLeadCapture(project: PublicProjectConfig | null): boolean {
  return Boolean(
    project?.widget.collectName || project?.widget.collectEmail || project?.widget.collectPhone
  );
}

function hasRequiredLeadDetails(
  project: PublicProjectConfig | null,
  visitor: ChatWidgetVisitorFields
): boolean {
  const collectName = project?.widget.collectName ?? false;
  const collectEmail = project?.widget.collectEmail ?? false;
  const collectPhone = project?.widget.collectPhone ?? false;

  if (collectName && !hasText(visitor.name)) {
    return false;
  }

  if (collectEmail && collectPhone) {
    return hasText(visitor.email) || hasText(visitor.phone);
  }

  if (collectEmail) {
    return hasText(visitor.email);
  }

  if (collectPhone) {
    return hasText(visitor.phone);
  }

  return true;
}

function validateLeadDetails(
  strings: LocaleStrings,
  project: PublicProjectConfig | null,
  visitor: ChatWidgetVisitorFields
): string {
  const collectName = project?.widget.collectName ?? false;
  const collectEmail = project?.widget.collectEmail ?? false;
  const collectPhone = project?.widget.collectPhone ?? false;

  if (collectName && !hasText(visitor.name)) {
    return strings.nameRequired;
  }

  if (!isValidEmail(visitor.email)) {
    return strings.invalidEmail;
  }

  if (collectEmail && collectPhone && !hasText(visitor.email) && !hasText(visitor.phone)) {
    return strings.contactRequired;
  }

  if (collectEmail && !collectPhone && !hasText(visitor.email)) {
    return strings.contactRequired;
  }

  if (collectPhone && !collectEmail && !hasText(visitor.phone)) {
    return strings.contactRequired;
  }

  return "";
}

function launcherIcon(): string {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 6.75A2.75 2.75 0 0 1 6.75 4h10.5A2.75 2.75 0 0 1 20 6.75v6.5A2.75 2.75 0 0 1 17.25 16H10l-4.2 3.15c-.72.54-1.8.03-1.8-.87V6.75Z"
        fill="none"
        stroke="currentColor"
        stroke-width="2.1"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M8 9.5h8M8 12.5h5"
        fill="none"
        stroke="currentColor"
        stroke-width="2.1"
        stroke-linecap="round"
      />
    </svg>
  `;
}

function closeIcon(): string {
  return `
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </svg>
  `;
}

function parseHexColor(value: string): { r: number; g: number; b: number } | null {
  const normalized = value.trim().replace(/^#/, "");
  const full = normalized.length === 3
    ? normalized.split("").map((chunk) => `${chunk}${chunk}`).join("")
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return null;
  }

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16)
  };
}

function toLinearChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function resolveOnAccentColor(accentColor: string): string {
  const rgb = parseHexColor(accentColor);
  if (!rgb) {
    return "#061018";
  }

  const luminance =
    (0.2126 * toLinearChannel(rgb.r)) +
    (0.7152 * toLinearChannel(rgb.g)) +
    (0.0722 * toLinearChannel(rgb.b));

  return luminance < 0.36 ? "#f8fbff" : "#061018";
}

function createStyle(accentColor: string, radius: number): string {
  const onAccentColor = resolveOnAccentColor(accentColor);

  return `
    :host, .chat-me {
      --chat-me-accent: ${accentColor};
      --chat-me-accent-soft: color-mix(in srgb, ${accentColor} 24%, white);
      --chat-me-on-accent: ${onAccentColor};
      --chat-me-bg: #0a1320;
      --chat-me-panel: rgba(9, 18, 30, 0.94);
      --chat-me-border: rgba(255, 255, 255, 0.08);
      --chat-me-text: #eff5ff;
      --chat-me-muted: #9ca9bc;
      --chat-me-radius: ${radius}px;
      font-family: "SF Pro Display", "Segoe UI", "Helvetica Neue", ui-sans-serif, system-ui, sans-serif;
    }
    .chat-me {
      position: fixed;
      z-index: 2147482000;
      bottom: 20px;
      max-width: min(420px, calc(100vw - 24px));
      color: var(--chat-me-text);
    }
    .chat-me.right { right: 20px; }
    .chat-me.left { left: 20px; }
    .chat-me * { box-sizing: border-box; }
    .chat-me button, .chat-me input, .chat-me textarea {
      font: inherit;
    }
    .chat-me__shell {
      display: grid;
      gap: 12px;
      justify-items: end;
    }
    .chat-me__toggle {
      justify-self: end;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      border: none;
      border-radius: 999px;
      background: linear-gradient(135deg, color-mix(in srgb, var(--chat-me-accent) 84%, black), var(--chat-me-accent));
      color: var(--chat-me-on-accent);
      font-weight: 700;
      padding: 14px 18px;
      min-width: 72px;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.24);
      cursor: pointer;
      transition: transform .2s ease, box-shadow .2s ease;
    }
    .chat-me__toggle:hover {
      transform: translateY(-1px);
      box-shadow: 0 24px 56px rgba(0, 0, 0, 0.28);
    }
    .chat-me__toggle-icon,
    .chat-me__close-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }
    .chat-me__toggle-icon svg,
    .chat-me__close-icon svg {
      width: 22px;
      height: 22px;
      display: block;
    }
    .chat-me.open .chat-me__toggle {
      display: none;
    }
    .chat-me.hide-toggle .chat-me__toggle {
      display: none !important;
    }
    .chat-me__panel {
      overflow: hidden;
      border-radius: calc(var(--chat-me-radius) + 8px);
      border: 1px solid var(--chat-me-border);
      background:
        radial-gradient(circle at top right, rgba(255,255,255,0.08), transparent 24%),
        linear-gradient(180deg, rgba(255,255,255,0.04), transparent 28%),
        var(--chat-me-panel);
      box-shadow: 0 24px 80px rgba(2, 10, 19, 0.42);
      backdrop-filter: blur(16px);
      width: min(420px, calc(100vw - 24px));
      height: min(680px, calc(100vh - 96px));
      display: none;
      contain: layout paint style;
      transform: translateZ(0);
    }
    .chat-me.open .chat-me__panel {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
    }
    .chat-me__header {
      padding: 18px 18px 14px;
      border-bottom: 1px solid var(--chat-me-border);
      background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0));
    }
    .chat-me__header-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    .chat-me__header-copy {
      min-width: 0;
      flex: 1 1 auto;
    }
    .chat-me__close {
      flex: 0 0 auto;
      width: 38px;
      height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--chat-me-border);
      border-radius: 999px;
      background: rgba(255,255,255,0.05);
      color: var(--chat-me-text);
      cursor: pointer;
      transition: background .2s ease, border-color .2s ease, transform .2s ease;
    }
    .chat-me__close:hover {
      transform: translateY(-1px);
      border-color: rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.09);
    }
    .chat-me__eyebrow {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .18em;
      color: var(--chat-me-muted);
    }
    .chat-me__title {
      margin-top: 8px;
      font-size: 20px;
      font-weight: 700;
    }
    .chat-me__subtitle {
      margin-top: 6px;
      font-size: 13px;
      line-height: 1.5;
      color: var(--chat-me-muted);
    }
    .chat-me__status {
      margin-top: 10px;
      font-size: 12px;
      color: var(--chat-me-muted);
    }
    .chat-me__body {
      padding: 16px;
      overflow-y: auto;
      display: grid;
      gap: 12px;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }
    .chat-me__empty {
      border: 1px dashed rgba(255, 255, 255, 0.12);
      border-radius: calc(var(--chat-me-radius) - 2px);
      padding: 14px;
      font-size: 13px;
      color: var(--chat-me-muted);
      background: rgba(255, 255, 255, 0.02);
    }
    .chat-me__lead-card {
      border: 1px solid var(--chat-me-border);
      border-radius: calc(var(--chat-me-radius) - 2px);
      padding: 14px;
      background: rgba(255, 255, 255, 0.05);
      display: grid;
      gap: 10px;
    }
    .chat-me__lead-card.is-saved {
      background: color-mix(in srgb, var(--chat-me-accent) 18%, rgba(255, 255, 255, 0.05));
    }
    .chat-me__lead-title {
      font-size: 14px;
      font-weight: 700;
    }
    .chat-me__lead-text,
    .chat-me__lead-success {
      font-size: 12px;
      line-height: 1.6;
      color: var(--chat-me-muted);
    }
    .chat-me__lead-success {
      color: var(--chat-me-accent-soft);
      font-weight: 600;
    }
    .chat-me__lead-save {
      justify-self: start;
      border: none;
      border-radius: 999px;
      padding: 10px 14px;
      background: linear-gradient(135deg, var(--chat-me-accent), color-mix(in srgb, var(--chat-me-accent) 46%, white));
      color: #061018;
      font-weight: 700;
      cursor: pointer;
    }
    .chat-me__lead-save[disabled] {
      opacity: .6;
      cursor: not-allowed;
    }
    .chat-me__bubble {
      max-width: 88%;
      border-radius: calc(var(--chat-me-radius) - 2px);
      padding: 12px 14px;
      font-size: 14px;
      line-height: 1.55;
      white-space: pre-wrap;
    }
    .chat-me__bubble.visitor {
      justify-self: end;
      color: #071119;
      background: linear-gradient(135deg, var(--chat-me-accent), color-mix(in srgb, var(--chat-me-accent) 56%, white));
    }
    .chat-me__bubble.operator,
    .chat-me__bubble.system {
      justify-self: start;
      border: 1px solid var(--chat-me-border);
      background: rgba(255, 255, 255, 0.05);
    }
    .chat-me__meta {
      margin-top: 8px;
      font-size: 11px;
      opacity: .68;
    }
    .chat-me__composer {
      border-top: 1px solid var(--chat-me-border);
      padding: 14px;
      display: grid;
      gap: 10px;
      background: rgba(5, 11, 18, 0.56);
    }
    .chat-me__composer.is-locked {
      gap: 8px;
    }
    .chat-me__composer-note {
      font-size: 12px;
      line-height: 1.6;
      color: var(--chat-me-muted);
    }
    .chat-me__fields {
      display: grid;
      gap: 8px;
    }
    .chat-me__fields input {
      border-radius: 16px;
      border: 1px solid var(--chat-me-border);
      background: rgba(255,255,255,0.04);
      color: var(--chat-me-text);
      padding: 11px 12px;
      outline: none;
    }
    .chat-me__fields input::placeholder, .chat-me__textarea::placeholder {
      color: var(--chat-me-muted);
    }
    .chat-me__textarea {
      width: 100%;
      min-height: 96px;
      resize: vertical;
      border-radius: 18px;
      border: 1px solid var(--chat-me-border);
      background: rgba(255,255,255,0.04);
      color: var(--chat-me-text);
      padding: 12px 14px;
      outline: none;
    }
    .chat-me__textarea[disabled] {
      opacity: .55;
      cursor: not-allowed;
    }
    .chat-me__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .chat-me__footer-copy {
      display: grid;
      gap: 6px;
    }
    .chat-me__privacy {
      color: var(--chat-me-muted);
      font-size: 12px;
      text-decoration: none;
    }
    .chat-me__send {
      border: none;
      border-radius: 999px;
      padding: 11px 16px;
      background: linear-gradient(135deg, color-mix(in srgb, var(--chat-me-accent) 86%, black), var(--chat-me-accent));
      color: var(--chat-me-on-accent);
      font-weight: 700;
      cursor: pointer;
    }
    .chat-me__send[disabled] {
      opacity: .6;
      cursor: not-allowed;
    }
    .chat-me__error {
      color: #fecaca;
      font-size: 12px;
    }
    @media (max-width: 640px) {
      .chat-me {
        bottom: calc(env(safe-area-inset-bottom, 0px) + 14px);
        max-width: none;
      }
      .chat-me.right {
        right: calc(env(safe-area-inset-right, 0px) + 14px);
        left: auto !important;
      }
      .chat-me.left {
        left: calc(env(safe-area-inset-left, 0px) + 14px) !important;
        right: auto !important;
      }
      .chat-me__panel {
        width: min(368px, calc(100vw - 24px));
        height: min(64svh, 560px);
        max-height: calc(100svh - 112px);
        margin-bottom: 8px;
        border-radius: 24px;
      }
      .chat-me__toggle {
        justify-self: end;
        width: 54px;
        height: 54px;
        min-width: 54px;
        padding: 0;
        gap: 0;
        border-radius: 999px;
      }
      .chat-me__toggle-label {
        display: none;
      }
      .chat-me__header {
        padding: 14px 14px 10px;
      }
      .chat-me__close {
        width: 34px;
        height: 34px;
      }
      .chat-me__title {
        margin-top: 6px;
        font-size: 18px;
      }
      .chat-me__subtitle {
        font-size: 12px;
        line-height: 1.5;
      }
      .chat-me__status {
        margin-top: 8px;
      }
      .chat-me__body {
        padding: 12px;
        gap: 10px;
      }
      .chat-me__lead-card,
      .chat-me__empty,
      .chat-me__bubble {
        border-radius: 20px;
      }
      .chat-me__lead-card {
        padding: 12px;
      }
      .chat-me__bubble {
        max-width: 92%;
        padding: 11px 12px;
        font-size: 13px;
      }
      .chat-me__composer {
        padding: 12px;
        gap: 8px;
      }
      .chat-me__textarea {
        min-height: 78px;
        resize: none;
      }
      .chat-me__footer {
        align-items: flex-end;
      }
    }
  `;
}

function sanitizeColor(value: string | undefined): string {
  if (!value) {
    return "#2dd4bf";
  }

  const trimmed = value.trim();
  return /^[-#(),.%\sa-zA-Z0-9]+$/.test(trimmed) ? trimmed : "#2dd4bf";
}

export function mountChatWidget(
  target: HTMLElement,
  config: ChatWidgetConfig
): ChatWidgetController {
  const client = new ChatApiClient(config);
  const locale = config.locale || "ru";
  const strings = getStrings(locale);
  const mountRoot =
    config.useShadowDom === false ? target : target.shadowRoot || target.attachShadow({ mode: "open" });
  const state: WidgetState = {
    open: Boolean(config.openByDefault),
    bootstrapped: false,
    loading: false,
    sending: false,
    leadSaving: false,
    leadCaptured: false,
    error: "",
    connected: false,
    fallbackPolling: false,
    visitorToken: readVisitorToken(config.projectKey),
    conversationId: null,
    project: null,
    messages: [],
    draft: normalizeDraft(config.initialDraft),
    visitor: {
      ...config.visitor
    }
  };

  let eventSource: EventSource | null = null;
  let pollingTimer: number | null = null;

  function mergedTheme() {
    return {
      accentColor:
        sanitizeColor(config.theme?.accentColor || state.project?.theme.accentColor),
      borderRadius:
        config.theme?.borderRadius ||
        state.project?.theme.borderRadius ||
        20,
      position:
        config.theme?.position ||
        state.project?.theme.position ||
        "bottom-right",
      buttonLabel:
        config.theme?.buttonLabel ||
        state.project?.theme.buttonLabel ||
        strings.open
    };
  }

  function cleanupTransport() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    if (pollingTimer) {
      window.clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }

  async function syncMessages() {
    if (!state.visitorToken || !state.conversationId) {
      return;
    }

    const afterId = state.messages[state.messages.length - 1]?.id;
    const payload = await client.listMessages({
      visitorToken: state.visitorToken,
      conversationId: state.conversationId,
      afterId
    });

    if (payload.messages.length) {
      state.messages = mergeMessages(state.messages, payload.messages);
      render();
      scrollMessagesToBottom();
    }
  }

  function startFallbackPolling() {
    if (pollingTimer || !state.conversationId) {
      return;
    }

    state.fallbackPolling = true;
    render();
    pollingTimer = window.setInterval(() => {
      void syncMessages();
    }, 5_000);
  }

  function connectStream() {
    if (!state.conversationId || !state.visitorToken || typeof window === "undefined") {
      return;
    }

    cleanupTransport();

    if (typeof EventSource === "undefined") {
      startFallbackPolling();
      return;
    }

    eventSource = new EventSource(
      client.createStreamUrl({
        visitorToken: state.visitorToken,
        conversationId: state.conversationId
      })
    );
    eventSource.addEventListener("conversation.updated", () => {
      state.connected = true;
      state.fallbackPolling = false;
      render();
      void syncMessages();
    });
    eventSource.onerror = () => {
      state.connected = false;
      render();
      cleanupTransport();
      startFallbackPolling();
    };
    state.connected = true;
  }

  async function bootstrap() {
    if (state.loading) {
      return;
    }

    state.loading = true;
    state.error = "";
    render();

    try {
      const session = await client.initSession({
        visitorToken: state.visitorToken || undefined,
        visitor: state.visitor
      });
      state.project = session.project;
      state.visitorToken = session.visitorToken;
      state.visitor = {
        ...state.visitor,
        ...session.visitor
      };
      writeVisitorToken(config.projectKey, session.visitorToken);

      const conversation = await client.ensureConversation({
        visitorToken: state.visitorToken
      });
      state.conversationId = conversation.conversationId;
      state.messages = mergeMessages([], conversation.messages);
      state.leadCaptured =
        !requiresLeadCapture(session.project) ||
        hasRequiredLeadDetails(session.project, state.visitor);
      state.bootstrapped = true;
      connectStream();
    } catch (error) {
      state.error = error instanceof Error ? error.message : strings.error;
    } finally {
      state.loading = false;
      render();
      scrollMessagesToBottom();
    }
  }

  async function saveLeadCapture() {
    const effectiveStrings = getStrings(config.locale || state.project?.widget.locale || "ru");
    const validationError = validateLeadDetails(effectiveStrings, state.project, state.visitor);

    if (validationError) {
      state.error = validationError;
      render();
      return;
    }

    state.leadSaving = true;
    state.error = "";
    render();

    try {
      const session = await client.initSession({
        visitorToken: state.visitorToken || undefined,
        visitor: state.visitor
      });
      state.project = session.project;
      state.visitorToken = session.visitorToken;
      state.visitor = {
        ...state.visitor,
        ...session.visitor
      };
      writeVisitorToken(config.projectKey, session.visitorToken);

      if (!state.conversationId) {
        const conversation = await client.ensureConversation({
          visitorToken: state.visitorToken
        });
        state.conversationId = conversation.conversationId;
        state.messages = mergeMessages(state.messages, conversation.messages);
      }

      state.leadCaptured = true;

      if (state.open && state.conversationId && !eventSource) {
        connectStream();
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : effectiveStrings.error;
    } finally {
      state.leadSaving = false;
      render();
      scrollMessagesToBottom();
    }
  }

  async function sendMessage() {
    const body = clamp(state.draft);
    const effectiveStrings = getStrings(config.locale || state.project?.widget.locale || "ru");

    if (!body || state.sending) {
      return;
    }

    if (requiresLeadCapture(state.project) && !state.leadCaptured) {
      state.error = validateLeadDetails(effectiveStrings, state.project, state.visitor);
      render();
      return;
    }

    if (!state.bootstrapped) {
      await bootstrap();
    }

    if (requiresLeadCapture(state.project) && !state.leadCaptured) {
      state.error = validateLeadDetails(effectiveStrings, state.project, state.visitor);
      render();
      return;
    }

    if (!state.conversationId) {
      return;
    }

    state.sending = true;
    state.error = "";
    render();

    try {
      await client.initSession({
        visitorToken: state.visitorToken || undefined,
        visitor: state.visitor
      });
      const payload = await client.sendMessage({
        visitorToken: state.visitorToken,
        conversationId: state.conversationId,
        body
      });
      state.messages = mergeMessages(state.messages, [payload.message]);
      state.draft = "";
      render();
      scrollMessagesToBottom();
    } catch (error) {
      state.error = error instanceof Error ? error.message : strings.error;
      render();
    } finally {
      state.sending = false;
      render();
    }
  }

  function scrollMessagesToBottom() {
    const body = mountRoot.querySelector<HTMLElement>(".chat-me__body");

    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }

  function setDraft(nextDraft: string | undefined) {
    state.draft = normalizeDraft(nextDraft);
  }

  function bindInputs() {
    const toggleButton = mountRoot.querySelector<HTMLButtonElement>(".chat-me__toggle");
    const closeButton = mountRoot.querySelector<HTMLButtonElement>("[data-role='close']");
    const textarea = mountRoot.querySelector<HTMLTextAreaElement>(".chat-me__textarea");
    const sendButton = mountRoot.querySelector<HTMLButtonElement>(".chat-me__send");
    const leadSaveButton = mountRoot.querySelector<HTMLButtonElement>(".chat-me__lead-save");
    const nameInput = mountRoot.querySelector<HTMLInputElement>("input[name='visitor-name']");
    const contactInput = mountRoot.querySelector<HTMLInputElement>("input[name='visitor-contact']");

    toggleButton?.addEventListener("click", () => {
      state.open = !state.open;
      render();

      if (state.open && !state.bootstrapped) {
        void bootstrap();
      }
    });
    closeButton?.addEventListener("click", () => {
      state.open = false;
      render();
    });

    textarea?.addEventListener("input", (event) => {
      state.draft = (event.target as HTMLTextAreaElement).value;
    });
    textarea?.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void sendMessage();
      }
    });
    sendButton?.addEventListener("click", (event) => {
      event.preventDefault();
      void sendMessage();
    });
    leadSaveButton?.addEventListener("click", (event) => {
      event.preventDefault();
      void saveLeadCapture();
    });

    nameInput?.addEventListener("input", (event) => {
      state.visitor.name = (event.target as HTMLInputElement).value;
      state.error = "";
    });
    contactInput?.addEventListener("input", (event) => {
      applyLeadContactValue(state.visitor, (event.target as HTMLInputElement).value);
      state.error = "";
    });
  }

  function shouldHideWidgetToggle(): boolean {
    if (typeof document === "undefined") {
      return false;
    }

    const externalTriggers = document.querySelectorAll("[data-chat-me-trigger], a[href='#shop-chat']");
    if (!externalTriggers.length) {
      return false;
    }

    return Array.from(externalTriggers).some((trigger) => !target.contains(trigger));
  }

  function render() {
    const theme = mergedTheme();
    const effectiveStrings = getStrings(
      config.locale || state.project?.widget.locale || "ru"
    );
    const greeting =
      config.initialGreeting ||
      state.project?.widget.initialGreeting ||
      effectiveStrings.subtitle;
    const privacyUrl = config.privacyUrl || state.project?.widget.privacyUrl;
    const collectName = state.project?.widget.collectName ?? false;
    const collectEmail = state.project?.widget.collectEmail ?? false;
    const collectPhone = state.project?.widget.collectPhone ?? false;
    const leadRequired = requiresLeadCapture(state.project);
    const composerLocked = leadRequired && !state.leadCaptured;
    const contactValue = getLeadContactValue(state.visitor);
    const leadSummary = [state.visitor.name, contactValue]
      .filter((value): value is string => hasText(value))
      .map((value) => escapeHtml(value))
      .join(" · ");
    const contactPlaceholder =
      collectEmail && !collectPhone
        ? effectiveStrings.emailLabel
        : collectPhone && !collectEmail
          ? effectiveStrings.phoneLabel
          : effectiveStrings.contactLabel;
    const shouldRenderPanelContent =
      state.open || state.loading || state.bootstrapped || Boolean(state.error);
    const hideWidgetToggle = shouldHideWidgetToggle();
    const leadBlock = leadRequired
      ? state.leadCaptured
        ? `
            <div class="chat-me__lead-card is-saved">
              <div class="chat-me__lead-title">${escapeHtml(effectiveStrings.leadTitle)}</div>
              ${leadSummary ? `<div class="chat-me__lead-text">${leadSummary}</div>` : ""}
              <div class="chat-me__lead-success">${escapeHtml(effectiveStrings.leadSaved)}</div>
            </div>
          `
        : `
            <div class="chat-me__lead-card">
              <div class="chat-me__lead-title">${escapeHtml(effectiveStrings.leadTitle)}</div>
              <div class="chat-me__lead-text">${escapeHtml(effectiveStrings.leadHint)}</div>
              <div class="chat-me__fields">
                ${collectName ? `<input name="visitor-name" placeholder="${effectiveStrings.nameLabel}" value="${escapeHtml(state.visitor.name || "")}" />` : ""}
                ${collectEmail || collectPhone ? `<input name="visitor-contact" placeholder="${escapeHtml(contactPlaceholder)}" value="${escapeHtml(contactValue)}" />` : ""}
              </div>
              <button class="chat-me__lead-save" ${state.leadSaving ? "disabled" : ""}>${state.leadSaving ? effectiveStrings.connecting : effectiveStrings.leadSave}</button>
            </div>
          `
      : "";

    mountRoot.innerHTML = `
      <style>${createStyle(theme.accentColor || "#2dd4bf", theme.borderRadius || 20)}</style>
      <div class="chat-me ${theme.position === "bottom-left" ? "left" : "right"} ${state.open ? "open" : ""} ${hideWidgetToggle ? "hide-toggle" : ""}">
        <div class="chat-me__shell">
          <div class="chat-me__panel">
            ${
              shouldRenderPanelContent
                ? `
                    <div class="chat-me__header">
                      <div class="chat-me__header-top">
                        <div class="chat-me__header-copy">
                          <div class="chat-me__eyebrow">${escapeHtml(state.project?.displayName || "chat-me")}</div>
                          <div class="chat-me__title">${effectiveStrings.title}</div>
                          <div class="chat-me__subtitle">${escapeHtml(greeting)}</div>
                          <div class="chat-me__status">
                            ${
                              state.loading
                                ? effectiveStrings.connecting
                                : state.fallbackPolling
                                  ? effectiveStrings.offline
                                  : state.connected
                                    ? ""
                                    : ""
                            }
                          </div>
                        </div>
                        <button class="chat-me__close" type="button" data-role="close" aria-label="${escapeHtml(effectiveStrings.close)}">
                          <span class="chat-me__close-icon">${closeIcon()}</span>
                        </button>
                      </div>
                    </div>
                    <div class="chat-me__body">
                      ${leadBlock}
                      ${
                        state.messages.length === 0
                          ? composerLocked
                            ? ""
                            : `<div class="chat-me__empty">${effectiveStrings.empty}</div>`
                          : state.messages
                              .map(
                                (message) => `
                                  <div class="chat-me__bubble ${message.senderType === "visitor" ? "visitor" : "operator"}">
                                    <div>${escapeHtml(message.bodyPlain)}</div>
                                    <div class="chat-me__meta">
                                      ${message.operatorName ? `${escapeHtml(message.operatorName)} · ` : ""}${formatTime(message.createdAt, config.locale || "ru")}
                                    </div>
                                  </div>
                                `
                              )
                              .join("")
                      }
                    </div>
                    <div class="chat-me__composer ${composerLocked ? "is-locked" : ""}">
                      ${
                        composerLocked
                          ? `<div class="chat-me__composer-note">${escapeHtml(effectiveStrings.leadLockedPlaceholder)}</div>`
                          : `<textarea class="chat-me__textarea" placeholder="${effectiveStrings.placeholder}">${escapeHtml(state.draft)}</textarea>`
                      }
                      <div class="chat-me__footer">
                        <div class="chat-me__footer-copy">
                          ${
                            privacyUrl
                              ? `<a class="chat-me__privacy" href="${escapeHtml(privacyUrl)}" target="_blank" rel="noreferrer">${effectiveStrings.privacy}</a>`
                              : `<span class="chat-me__privacy"></span>`
                          }
                          ${state.error ? `<div class="chat-me__error">${escapeHtml(state.error)}</div>` : ""}
                        </div>
                        ${
                          composerLocked
                            ? ""
                            : `<button class="chat-me__send" ${state.sending ? "disabled" : ""}>${state.sending ? effectiveStrings.connecting : effectiveStrings.send}</button>`
                        }
                      </div>
                    </div>
                  `
                : ""
            }
          </div>
          ${
            hideWidgetToggle
              ? ""
              : `
                  <button
                    class="chat-me__toggle"
                    type="button"
                    aria-label="${escapeHtml(theme.buttonLabel || effectiveStrings.open)}"
                  >
                    <span class="chat-me__toggle-icon">${launcherIcon()}</span>
                    <span class="chat-me__toggle-label">${escapeHtml(theme.buttonLabel || effectiveStrings.open)}</span>
                  </button>
                `
          }
        </div>
      </div>
    `;

    bindInputs();
  }

  render();

  if (state.open) {
    void bootstrap();
  }

  return {
    open(draft) {
      if (typeof draft === "string") {
        setDraft(draft);
      }
      state.open = true;
      render();
      if (!state.bootstrapped) {
        void bootstrap();
      }
    },
    close() {
      state.open = false;
      render();
    },
    destroy() {
      cleanupTransport();
      mountRoot.innerHTML = "";
    }
  };
}

export function createChatWidget(config: ChatWidgetConfig): ChatWidgetController {
  const target = resolveTarget(config.target);
  return mountChatWidget(target, config);
}

export function registerGlobalChatWidget(globalObject: Window = window): void {
  (globalObject as Window & {
    ChatMeWidget?: {
      init(config: ChatWidgetConfig): ChatWidgetController;
    };
  }).ChatMeWidget = {
    init(config: ChatWidgetConfig) {
      return createChatWidget(config);
    }
  };
}
