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
    leadLockedPlaceholder: "Save contact details first",
    send: "Send",
    connecting: "Connecting…",
    offline: "Reconnecting…",
    empty: "Start the conversation",
    emailLabel: "Email",
    phoneLabel: "Phone",
    contactLabel: "Phone or email",
    nameLabel: "Name",
    leadTitle: "How can we reach you?",
    leadHint: "Leave your name and at least one contact so the conversation is not lost if the chat closes.",
    leadSave: "Save contact",
    leadSaved: "Contact saved. You can continue in chat.",
    contactRequired: "Leave a phone number or email before sending a message.",
    nameRequired: "Add your name before continuing.",
    invalidEmail: "Check the email format and try again.",
    privacy: "Privacy",
    close: "Close",
    error: "Message was not sent. Try again."
  },
  ru: {
    open: "Чат",
    title: "Чем помочь?",
    subtitle: "Обычно отвечаем в течение нескольких минут.",
    placeholder: "Введите сообщение",
    leadLockedPlaceholder: "Сначала сохраните контакт",
    send: "Отправить",
    connecting: "Подключаемся…",
    offline: "Переподключаемся…",
    empty: "Начните переписку",
    emailLabel: "Email",
    phoneLabel: "Телефон",
    contactLabel: "Телефон или email",
    nameLabel: "Имя",
    leadTitle: "Как с вами связаться?",
    leadHint: "Оставьте имя и телефон или email. Так мы не потеряем связь, даже если чат закроется.",
    leadSave: "Сохранить контакт",
    leadSaved: "Данные сохранены. Можно писать в чат.",
    contactRequired: "Укажите телефон или email перед отправкой сообщения.",
    nameRequired: "Укажите имя перед продолжением.",
    invalidEmail: "Проверьте email и попробуйте еще раз.",
    privacy: "Конфиденциальность",
    close: "Закрыть",
    error: "Сообщение не отправлено. Попробуйте ещё раз."
  }
} as const;
