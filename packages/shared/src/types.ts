import type { z } from "zod";

import type {
  AdminConversationListQuerySchema,
  ConversationStatusSchema,
  EnsureConversationInputSchema,
  InternalNoteInputSchema,
  OperatorLoginInputSchema,
  OperatorReplyInputSchema,
  PublicProjectConfigSchema,
  SafeNotificationDispatchSchema,
  SendMessageInputSchema,
  WebPushSubscriptionInputSchema,
  WebPushSubscriptionRevokeInputSchema,
  WidgetSdkConfigSchema,
  WidgetSessionInitInputSchema
} from "./schemas";

export type PublicProjectConfig = z.infer<typeof PublicProjectConfigSchema>;
export type WidgetSessionInitInput = z.infer<typeof WidgetSessionInitInputSchema>;
export type EnsureConversationInput = z.infer<typeof EnsureConversationInputSchema>;
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;
export type OperatorLoginInput = z.infer<typeof OperatorLoginInputSchema>;
export type OperatorReplyInput = z.infer<typeof OperatorReplyInputSchema>;
export type InternalNoteInput = z.infer<typeof InternalNoteInputSchema>;
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;
export type AdminConversationListQuery = z.infer<typeof AdminConversationListQuerySchema>;
export type SafeNotificationDispatchInput = z.infer<typeof SafeNotificationDispatchSchema>;
export type WebPushSubscriptionInput = z.infer<typeof WebPushSubscriptionInputSchema>;
export type WebPushSubscriptionRevokeInput = z.infer<typeof WebPushSubscriptionRevokeInputSchema>;
export type WidgetSdkConfig = z.infer<typeof WidgetSdkConfigSchema>;

export interface ChatMessage {
  id: number;
  conversationId: number;
  senderType: "visitor" | "operator" | "system";
  body: string;
  bodyPlain: string;
  createdAt: string;
  deliveryStatus: "stored" | "sent";
  metadata: Record<string, unknown>;
  operatorName?: string | null;
}

export interface ChatInternalNote {
  id: number;
  conversationId: number;
  body: string;
  createdAt: string;
  operatorName: string | null;
}

export interface ConversationSummary {
  id: number;
  projectKey: string;
  projectDisplayName: string;
  visitorId: number;
  status: "open" | "closed" | "spam";
  sourceUrl: string | null;
  referrer: string | null;
  startedAt: string;
  lastMessageAt: string;
  lastVisitorMessageAt: string | null;
  lastOperatorMessageAt: string | null;
  unread: boolean;
  latestMessage: string | null;
  visitorName: string | null;
  visitorEmail: string | null;
  visitorPhone: string | null;
}

export interface ConversationDetails extends ConversationSummary {
  messages: ChatMessage[];
  notes: ChatInternalNote[];
}

export interface OperatorSessionUser {
  id: number;
  email: string;
  displayName: string;
  role: "operator" | "manager" | "admin";
}

export interface OperatorPushSubscriptionSummary {
  id: number;
  endpoint: string;
  deviceLabel: string | null;
  createdAt: string;
  lastSeenAt: string;
  lastNotifiedAt: string | null;
}

export interface WidgetBootstrapPayload {
  project: PublicProjectConfig;
  visitorToken: string;
  conversationId: number;
  messages: ChatMessage[];
}
