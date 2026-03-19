import type { ChatWidgetConfig } from "@chat-me/sdk";

interface ChatWidgetController {
  open(draft?: string): void;
  close(): void;
  destroy(): void;
}

interface ChatWidgetRuntime {
  init(config: ChatWidgetConfig): ChatWidgetController;
}

declare global {
  interface Window {
    ChatMeWidget?: {
      init(config: ChatWidgetConfig): ChatWidgetController;
    };
    __chatMeWidgetRuntime__?: ChatWidgetRuntime;
    __chatMeWidgetRuntimePromise__?: Promise<ChatWidgetRuntime>;
  }
}

function resolveLoaderScriptUrl(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const currentScript = document.currentScript;

  if (currentScript instanceof HTMLScriptElement && currentScript.src) {
    return currentScript.src;
  }

  const scripts = document.querySelectorAll<HTMLScriptElement>("script[src]");

  for (let index = scripts.length - 1; index >= 0; index -= 1) {
    const candidate = scripts[index];

    if (candidate.src.includes("chat-me-widget.js")) {
      return candidate.src;
    }
  }

  return null;
}

function resolveRuntimeUrl(loaderUrl: string | null): string {
  if (!loaderUrl) {
    return "/widget/chat-me-widget.runtime.js";
  }

  const sourceUrl = new URL(loaderUrl, window.location.href);
  const runtimeUrl = new URL("./chat-me-widget.runtime.js", sourceUrl);
  runtimeUrl.search = sourceUrl.search;
  return runtimeUrl.toString();
}

function createDeferredController(): ChatWidgetController & {
  attach(controller: ChatWidgetController): void;
} {
  let controller: ChatWidgetController | null = null;
  const pendingCalls: Array<(value: ChatWidgetController) => void> = [];

  return {
    open(draft) {
      if (controller) {
        controller.open(draft);
        return;
      }

      pendingCalls.push((value) => {
        value.open(draft);
      });
    },
    close() {
      if (controller) {
        controller.close();
        return;
      }

      pendingCalls.push((value) => {
        value.close();
      });
    },
    destroy() {
      if (controller) {
        controller.destroy();
        return;
      }

      pendingCalls.push((value) => {
        value.destroy();
      });
    },
    attach(value) {
      controller = value;

      for (const call of pendingCalls) {
        call(value);
      }

      pendingCalls.length = 0;
    }
  };
}

function loadRuntime(globalObject: Window, runtimeUrl: string): Promise<ChatWidgetRuntime> {
  if (globalObject.__chatMeWidgetRuntime__) {
    return Promise.resolve(globalObject.__chatMeWidgetRuntime__);
  }

  if (globalObject.__chatMeWidgetRuntimePromise__) {
    return globalObject.__chatMeWidgetRuntimePromise__;
  }

  globalObject.__chatMeWidgetRuntimePromise__ = new Promise<ChatWidgetRuntime>((resolve, reject) => {
    const handleReady = () => {
      if (globalObject.__chatMeWidgetRuntime__) {
        resolve(globalObject.__chatMeWidgetRuntime__);
        return;
      }

      globalObject.__chatMeWidgetRuntimePromise__ = undefined;
      reject(new Error("chat-me widget runtime did not register"));
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      "script[data-chat-me-widget-runtime]"
    );

    if (existingScript) {
      existingScript.addEventListener("load", handleReady, { once: true });
      existingScript.addEventListener(
        "error",
        () => {
          globalObject.__chatMeWidgetRuntimePromise__ = undefined;
          reject(new Error("chat-me widget runtime failed to load"));
        },
        { once: true }
      );
      return;
    }

    const runtimeScript = document.createElement("script");
    runtimeScript.src = runtimeUrl;
    runtimeScript.async = true;
    runtimeScript.defer = true;
    runtimeScript.dataset.chatMeWidgetRuntime = "true";
    runtimeScript.addEventListener("load", handleReady, { once: true });
    runtimeScript.addEventListener(
      "error",
      () => {
        globalObject.__chatMeWidgetRuntimePromise__ = undefined;
        runtimeScript.remove();
        reject(new Error("chat-me widget runtime failed to load"));
      },
      { once: true }
    );
    document.head.appendChild(runtimeScript);
  });

  return globalObject.__chatMeWidgetRuntimePromise__;
}

function registerGlobalChatWidget(globalObject: Window): void {
  const runtimeUrl = resolveRuntimeUrl(resolveLoaderScriptUrl());

  globalObject.ChatMeWidget = {
    init(config) {
      const deferredController = createDeferredController();

      void loadRuntime(globalObject, runtimeUrl)
        .then((runtime) => {
          deferredController.attach(runtime.init(config));
        })
        .catch(() => {
          return;
        });

      return deferredController;
    }
  };
}

if (typeof window !== "undefined") {
  registerGlobalChatWidget(window);
}
