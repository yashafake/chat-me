"use client";

import { ChatWidget } from "@chat-me/sdk";

export function StoreChatSupport() {
  return (
    <ChatWidget
      config={{
        projectKey: "etern8-store",
        apiBaseUrl: process.env.NEXT_PUBLIC_CHAT_ME_API || "https://chat.black8.tech",
        locale: "ru",
        theme: {
          accentColor: "#ff7a59",
          buttonLabel: "Есть вопрос?",
          position: "bottom-right",
          borderRadius: 22
        }
      }}
    />
  );
}
