import { z } from "zod";

import {
  conversationStatusValues,
  localeValues,
  notificationChannelValues,
  operatorRoleValues,
  projectStatusValues,
  senderTypeValues
} from "./constants";
import { normalizeOrigin, normalizeOrigins, sanitizePlainText } from "./utils";

const originSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => normalizeOrigin(value));

const safeOptionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => value || undefined)
    .optional();

export const LocaleSchema = z.enum(localeValues);
export const ProjectStatusSchema = z.enum(projectStatusValues);
export const ConversationStatusSchema = z.enum(conversationStatusValues);
export const SenderTypeSchema = z.enum(senderTypeValues);
export const OperatorRoleSchema = z.enum(operatorRoleValues);
export const NotificationChannelSchema = z.enum(notificationChannelValues);

export const WidgetThemeSchema = z.object({
  accentColor: z.string().trim().max(32).optional(),
  buttonLabel: z.string().trim().max(48).optional(),
  position: z.enum(["bottom-right", "bottom-left"]).default("bottom-right"),
  borderRadius: z.number().int().min(12).max(32).default(20)
});

export const WidgetSettingsSchema = z.object({
  initialGreeting: z.string().trim().max(240).optional(),
  privacyUrl: z.string().trim().url().optional(),
  locale: LocaleSchema.default("ru"),
  collectName: z.boolean().default(false),
  collectEmail: z.boolean().default(false),
  collectPhone: z.boolean().default(false)
});

export const PublicProjectConfigSchema = z.object({
  projectKey: z.string().trim().min(2).max(64),
  displayName: z.string().trim().min(2).max(120),
  allowedOrigins: z.array(originSchema).default([]).transform(normalizeOrigins),
  status: ProjectStatusSchema,
  theme: WidgetThemeSchema.default({
    position: "bottom-right",
    borderRadius: 20
  }),
  widget: WidgetSettingsSchema.default({
    locale: "ru",
    collectName: false,
    collectEmail: false,
    collectPhone: false
  })
});

export const VisitorIdentitySchema = z.object({
  name: safeOptionalText(120),
  email: z.email().trim().transform((value) => value.toLowerCase()).optional(),
  phone: safeOptionalText(40)
});

export const WidgetSessionInitInputSchema = z.object({
  projectKey: z.string().trim().min(2).max(64),
  visitorToken: z.string().trim().min(12).max(128).optional(),
  locale: LocaleSchema.optional(),
  currentUrl: z.string().trim().url().optional(),
  referrer: z.string().trim().url().optional(),
  visitor: VisitorIdentitySchema.optional(),
  metadata: z.record(z.string(), z.string().max(200)).default({})
});

export const EnsureConversationInputSchema = z.object({
  projectKey: z.string().trim().min(2).max(64),
  visitorToken: z.string().trim().min(12).max(128),
  currentUrl: z.string().trim().url().optional(),
  referrer: z.string().trim().url().optional()
});

export const SendMessageInputSchema = z.object({
  projectKey: z.string().trim().min(2).max(64),
  visitorToken: z.string().trim().min(12).max(128),
  conversationId: z.number().int().positive(),
  body: z
    .string()
    .transform((value) => sanitizePlainText(value))
    .refine((value) => value.length >= 1, "Message body is required"),
  honeypot: z.string().max(0).default(""),
  metadata: z.record(z.string(), z.string().max(200)).default({})
});

export const OperatorLoginInputSchema = z
  .object({
    identifier: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().min(1).max(120).optional(),
    password: z.string().min(8).max(200)
  })
  .transform(({ identifier, email, password }) => ({
    identifier: (identifier || email || "").trim().toLowerCase(),
    password
  }))
  .refine((value) => value.identifier.length >= 1, {
    message: "Login is required",
    path: ["identifier"]
  });

export const OperatorReplyInputSchema = z.object({
  body: z
    .string()
    .transform((value) => sanitizePlainText(value))
    .refine((value) => value.length >= 1, "Reply body is required")
});

export const InternalNoteInputSchema = z.object({
  body: z
    .string()
    .transform((value) => sanitizePlainText(value))
    .refine((value) => value.length >= 1, "Note body is required")
});

export const UpdateConversationStatusInputSchema = z.object({
  status: ConversationStatusSchema
});

export const AdminConversationListQuerySchema = z.object({
  projectKey: z.string().trim().max(64).optional(),
  status: ConversationStatusSchema.optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30)
});

export const SafeNotificationDispatchSchema = z.object({
  conversationId: z.number().int().positive(),
  channel: NotificationChannelSchema,
  projectKey: z.string().trim().min(2).max(64)
});

export const WebPushSubscriptionInputSchema = z.object({
  endpoint: z.string().trim().url(),
  keys: z.object({
    p256dh: z.string().trim().min(16).max(512),
    auth: z.string().trim().min(8).max(512)
  }),
  deviceLabel: safeOptionalText(120)
});

export const WebPushSubscriptionRevokeInputSchema = z.object({
  endpoint: z.string().trim().url()
});

export const WidgetSdkConfigSchema = z.object({
  projectKey: z.string().trim().min(2).max(64),
  apiBaseUrl: z.string().trim().url(),
  locale: LocaleSchema.default("ru"),
  privacyUrl: z.string().trim().url().optional(),
  initialGreeting: z.string().trim().max(240).optional(),
  allowedOrigins: z.array(originSchema).default([]),
  theme: WidgetThemeSchema.default({
    position: "bottom-right",
    borderRadius: 20
  })
});
