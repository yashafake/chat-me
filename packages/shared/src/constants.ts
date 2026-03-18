export const projectStatusValues = ["active", "paused", "archived"] as const;
export const conversationStatusValues = ["open", "closed", "spam"] as const;
export const senderTypeValues = ["visitor", "operator", "system"] as const;
export const operatorRoleValues = ["operator", "manager", "admin"] as const;
export const notificationChannelValues = ["email", "telegram", "web_push"] as const;
export const notificationStatusValues = ["pending", "sent", "failed"] as const;

export const localeValues = ["ru", "en"] as const;

export const defaultWidgetStrings = {
  en: {
    open: "Chat",
    title: "How can we help?",
    subtitle: "Reply usually arrives within a few minutes.",
    placeholder: "Type your message",
    send: "Send",
    connecting: "Connecting…",
    offline: "Reconnecting…",
    empty: "Start the conversation",
    emailLabel: "Email",
    phoneLabel: "Phone",
    nameLabel: "Name",
    privacy: "Privacy",
    close: "Close",
    error: "Message was not sent. Try again."
  },
  ru: {
    open: "Чат",
    title: "Чем помочь?",
    subtitle: "Обычно отвечаем в течение нескольких минут.",
    placeholder: "Введите сообщение",
    send: "Отправить",
    connecting: "Подключаемся…",
    offline: "Переподключаемся…",
    empty: "Начните переписку",
    emailLabel: "Email",
    phoneLabel: "Телефон",
    nameLabel: "Имя",
    privacy: "Конфиденциальность",
    close: "Закрыть",
    error: "Сообщение не отправлено. Попробуйте ещё раз."
  }
} as const;
