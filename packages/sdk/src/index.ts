export interface ChatWidgetPlaceholder {
  destroy(): void;
}

export function createChatWidgetPlaceholder(): ChatWidgetPlaceholder {
  return {
    destroy() {
      return;
    }
  };
}
