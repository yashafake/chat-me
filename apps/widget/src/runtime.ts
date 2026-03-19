import type { ChatWidgetConfig } from "@chat-me/sdk";
import { createChatWidget } from "@chat-me/sdk";

interface ChatWidgetController {
  open(draft?: string): void;
  close(): void;
  destroy(): void;
}

declare global {
  interface Window {
    __chatMeWidgetRuntime__?: {
      init(config: ChatWidgetConfig): ChatWidgetController;
    };
  }
}

if (typeof window !== "undefined") {
  window.__chatMeWidgetRuntime__ = {
    init(config) {
      return createChatWidget(config);
    }
  };
}
