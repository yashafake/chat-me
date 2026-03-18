"use client";

import { useEffect, useRef } from "react";

import { createChatWidget } from "./widget";
import type { ChatWidgetConfig } from "./client";

export function ChatWidget(props: {
  config: ChatWidgetConfig;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const serializedConfig = JSON.stringify(props.config);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const controller = createChatWidget({
      ...props.config,
      target: ref.current
    });

    return () => {
      controller.destroy();
    };
  }, [serializedConfig]);

  return <div ref={ref} className={props.className} />;
}
