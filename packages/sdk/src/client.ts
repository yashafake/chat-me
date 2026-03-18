export interface PublicProjectTheme {
  accentColor?: string;
  buttonLabel?: string;
  position?: "bottom-right" | "bottom-left";
  borderRadius?: number;
}

export interface PublicProjectWidgetConfig {
  locale?: "ru" | "en";
  initialGreeting?: string;
  privacyUrl?: string;
  collectName?: boolean;
  collectEmail?: boolean;
  collectPhone?: boolean;
}

export interface PublicProjectConfig {
  projectKey: string;
  displayName: string;
  allowedOrigins: string[];
  status: "active" | "paused" | "archived";
  theme: PublicProjectTheme;
  widget: PublicProjectWidgetConfig;
}

export interface WidgetMessage {
  id: number;
  conversationId: number;
  senderType: "visitor" | "operator" | "system";
  bodyPlain: string;
  createdAt: string;
  operatorName?: string | null;
}

export interface WidgetSessionResponse {
  visitorToken: string;
  project: PublicProjectConfig;
}

export interface ConversationBootstrapResponse {
  conversationId: number;
  messages: WidgetMessage[];
}

export interface ChatWidgetVisitorFields {
  name?: string;
  email?: string;
  phone?: string;
}

export interface ChatWidgetConfig {
  projectKey: string;
  apiBaseUrl: string;
  locale?: "ru" | "en";
  privacyUrl?: string;
  initialGreeting?: string;
  allowedOrigins?: string[];
  theme?: PublicProjectTheme;
  target?: string | HTMLElement;
  useShadowDom?: boolean;
  openByDefault?: boolean;
  visitor?: ChatWidgetVisitorFields;
}

async function fetchJson<T>(baseUrl: string, pathname: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error || "Widget request failed");
  }

  return payload as T;
}

export class ChatApiClient {
  readonly config: ChatWidgetConfig;

  constructor(config: ChatWidgetConfig) {
    this.config = {
      ...config,
      apiBaseUrl: config.apiBaseUrl.replace(/\/$/, "")
    };
  }

  initSession(input: {
    visitorToken?: string;
    visitor?: ChatWidgetVisitorFields;
  }) {
    return fetchJson<WidgetSessionResponse>(this.config.apiBaseUrl, "/v1/widget/session/init", {
      method: "POST",
      body: JSON.stringify({
        projectKey: this.config.projectKey,
        visitorToken: input.visitorToken,
        locale: this.config.locale,
        currentUrl: typeof window !== "undefined" ? window.location.href : undefined,
        referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
        visitor: input.visitor
      })
    });
  }

  ensureConversation(input: {
    visitorToken: string;
  }) {
    return fetchJson<ConversationBootstrapResponse>(
      this.config.apiBaseUrl,
      "/v1/widget/conversations/active",
      {
        method: "POST",
        body: JSON.stringify({
          projectKey: this.config.projectKey,
          visitorToken: input.visitorToken,
          currentUrl: typeof window !== "undefined" ? window.location.href : undefined,
          referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined
        })
      }
    );
  }

  sendMessage(input: {
    visitorToken: string;
    conversationId: number;
    body: string;
  }) {
    return fetchJson<{ message: WidgetMessage }>(this.config.apiBaseUrl, "/v1/widget/messages", {
      method: "POST",
      body: JSON.stringify({
        projectKey: this.config.projectKey,
        visitorToken: input.visitorToken,
        conversationId: input.conversationId,
        body: input.body,
        honeypot: ""
      })
    });
  }

  listMessages(input: {
    visitorToken: string;
    conversationId: number;
    afterId?: number;
  }) {
    const search = new URLSearchParams({
      projectKey: this.config.projectKey,
      visitorToken: input.visitorToken
    });

    if (input.afterId) {
      search.set("afterId", String(input.afterId));
    }

    return fetchJson<{ messages: WidgetMessage[] }>(
      this.config.apiBaseUrl,
      `/v1/widget/conversations/${input.conversationId}/messages?${search.toString()}`,
      {
        method: "GET"
      }
    );
  }

  createStreamUrl(input: {
    visitorToken: string;
    conversationId: number;
  }): string {
    const search = new URLSearchParams({
      projectKey: this.config.projectKey,
      visitorToken: input.visitorToken
    });

    return `${this.config.apiBaseUrl}/v1/widget/conversations/${input.conversationId}/stream?${search.toString()}`;
  }
}
