"use client";

import { ChatWidget } from "@chat-me/sdk";

export function ChatSupport() {
  return (
    <ChatWidget
      config={{
        projectKey: "etern8-main",
        apiBaseUrl: process.env.NEXT_PUBLIC_CHAT_ME_API || "http://localhost:4100",
        locale: "ru",
        theme: {
          accentColor: "#2dd4bf",
          buttonLabel: "Написать",
          position: "bottom-right",
          borderRadius: 20
        }
      }}
    />
  );
}
