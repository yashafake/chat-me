import { registerGlobalChatWidget } from "@chat-me/sdk";

if (typeof window !== "undefined") {
  registerGlobalChatWidget(window);
}
