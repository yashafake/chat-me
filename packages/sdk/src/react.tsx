"use client";

import { useEffect, useRef } from "react";

import type { ChatWidgetConfig } from "./client";
import type { ChatWidgetController } from "./widget";

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

    let controller: ChatWidgetController | null = null;
    let destroyed = false;

    void import("./widget").then(({ createChatWidget }) => {
      if (destroyed || !ref.current) {
        return;
      }

      controller = createChatWidget({
        ...props.config,
        target: ref.current
      });
    });

    return () => {
      destroyed = true;
      controller?.destroy();
    };
  }, [serializedConfig]);

  return <div ref={ref} className={props.className} />;
}
