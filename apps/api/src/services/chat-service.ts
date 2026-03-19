import type { Pool, PoolClient } from "pg";

import type {
  AdminContactListQuery,
  ChatInternalNote,
  ChatMessage,
  ConversationDetails,
  ConversationStatus,
  ConversationSummary,
  OperatorPushSubscriptionSummary,
  OperatorSessionUser,
  PublicProjectConfig
} from "@chat-me/shared";

function mapProject(row: any): PublicProjectConfig {
  return {
    projectKey: row.key,
    displayName: row.display_name,
    allowedOrigins: row.allowed_origins ?? [],
    status: row.status,
    theme: {
      position: row.theme_config?.position ?? "bottom-right",
      borderRadius: row.theme_config?.borderRadius ?? 20,
      accentColor: row.theme_config?.accentColor,
      buttonLabel: row.theme_config?.buttonLabel
    },
    widget: {
      locale: row.widget_config?.locale ?? "ru",
      initialGreeting: row.widget_config?.initialGreeting,
      privacyUrl: row.widget_config?.privacyUrl,
      collectName: row.widget_config?.collectName ?? false,
      collectEmail: row.widget_config?.collectEmail ?? false,
      collectPhone: row.widget_config?.collectPhone ?? false
    }
  };
}

function mapMessage(row: any): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderType: row.sender_type,
    body: row.body,
    bodyPlain: row.body_plain,
    createdAt: row.created_at.toISOString(),
    deliveryStatus: row.delivery_status,
    metadata: row.metadata ?? {},
    operatorName: row.operator_name ?? null
  };
}

function mapNote(row: any): ChatInternalNote {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    operatorName: row.operator_name ?? null
  };
}

function mapPushSubscription(row: any): OperatorPushSubscriptionSummary {
  return {
    id: row.id,
    endpoint: row.endpoint,
    deviceLabel: row.device_label ?? null,
    createdAt: row.created_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    lastNotifiedAt: row.last_notified_at?.toISOString() ?? null
  };
}

function mapVisitorContact(row: any) {
  return {
    id: row.id,
    projectKey: row.project_key,
    projectDisplayName: row.project_display_name,
    name: row.name ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    lastConversationId: row.last_conversation_id ?? null
  };
}

function mapConversation(row: any): ConversationSummary {
  return {
    id: row.id,
    projectKey: row.project_key,
    projectDisplayName: row.project_display_name,
    visitorId: row.visitor_id,
    status: row.status,
    sourceUrl: row.source_url,
    referrer: row.referrer,
    startedAt: row.started_at.toISOString(),
    lastMessageAt: row.last_message_at.toISOString(),
    lastVisitorMessageAt: row.last_visitor_message_at?.toISOString() ?? null,
    lastOperatorMessageAt: row.last_operator_message_at?.toISOString() ?? null,
    unread: Boolean(row.unread),
    latestMessage: row.latest_message ?? null,
    visitorName: row.visitor_name ?? null,
    visitorEmail: row.visitor_email ?? null,
    visitorPhone: row.visitor_phone ?? null
  };
}

export async function getProjectByKey(pool: Pool, projectKey: string): Promise<PublicProjectConfig | null> {
  const result = await pool.query(
    `
      SELECT *
      FROM chat_projects
      WHERE key = $1
      LIMIT 1
    `,
    [projectKey]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return mapProject(result.rows[0]);
}

export async function getProjectRowByKey(pool: Pool, projectKey: string): Promise<any | null> {
  const result = await pool.query(
    `
      SELECT *
      FROM chat_projects
      WHERE key = $1
      LIMIT 1
    `,
    [projectKey]
  );

  return result.rows[0] ?? null;
}

export async function listProjects(pool: Pool): Promise<PublicProjectConfig[]> {
  const result = await pool.query(
    `
      SELECT *
      FROM chat_projects
      ORDER BY display_name ASC
    `
  );

  return result.rows.map(mapProject);
}

export async function upsertVisitor(
  pool: Pool,
  input: {
    projectId: number;
    visitorToken: string;
    locale: string;
    name?: string;
    email?: string;
    phone?: string;
    metadata: Record<string, string>;
  }
): Promise<any> {
  const result = await pool.query(
    `
      INSERT INTO chat_visitors (
        project_id,
        visitor_token,
        locale,
        name,
        email,
        phone,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      ON CONFLICT (project_id, visitor_token)
      DO UPDATE SET
        locale = EXCLUDED.locale,
        name = COALESCE(EXCLUDED.name, chat_visitors.name),
        email = COALESCE(EXCLUDED.email, chat_visitors.email),
        phone = COALESCE(EXCLUDED.phone, chat_visitors.phone),
        metadata = chat_visitors.metadata || EXCLUDED.metadata,
        last_seen_at = NOW()
      RETURNING *
    `,
    [
      input.projectId,
      input.visitorToken,
      input.locale,
      input.name ?? null,
      input.email ?? null,
      input.phone ?? null,
      JSON.stringify(input.metadata)
    ]
  );

  return result.rows[0];
}

export async function ensureConversation(
  pool: Pool,
  input: {
    projectId: number;
    visitorId: number;
    currentUrl?: string;
    referrer?: string;
  }
): Promise<{ conversationId: number }> {
  const existing = await pool.query(
    `
      SELECT id
      FROM chat_conversations
      WHERE project_id = $1
        AND visitor_id = $2
        AND status = 'open'
      ORDER BY id DESC
      LIMIT 1
    `,
    [input.projectId, input.visitorId]
  );

  if (existing.rowCount) {
    const conversationId = existing.rows[0].id as number;
    await pool.query(
      `
        UPDATE chat_conversations
        SET source_url = COALESCE($2, source_url),
            referrer = COALESCE($3, referrer)
        WHERE id = $1
      `,
      [conversationId, input.currentUrl ?? null, input.referrer ?? null]
    );
    return { conversationId };
  }

  const inserted = await pool.query(
    `
      INSERT INTO chat_conversations (
        project_id,
        visitor_id,
        source_url,
        referrer,
        metadata
      )
      VALUES ($1, $2, $3, $4, '{}'::jsonb)
      RETURNING id
    `,
    [input.projectId, input.visitorId, input.currentUrl ?? null, input.referrer ?? null]
  );

  return { conversationId: inserted.rows[0].id };
}

export async function getVisitorConversation(
  pool: Pool,
  input: {
    projectKey: string;
    visitorToken: string;
    conversationId: number;
  }
): Promise<
  | {
      conversationId: number;
      visitorId: number;
      projectId: number;
      visitorName: string | null;
      visitorEmail: string | null;
      visitorPhone: string | null;
    }
  | null
> {
  const result = await pool.query(
    `
      SELECT
        c.id AS conversation_id,
        v.id AS visitor_id,
        p.id AS project_id,
        v.name AS visitor_name,
        v.email AS visitor_email,
        v.phone AS visitor_phone
      FROM chat_conversations c
      JOIN chat_visitors v ON v.id = c.visitor_id
      JOIN chat_projects p ON p.id = c.project_id
      WHERE c.id = $1
        AND p.key = $2
        AND v.visitor_token = $3
      LIMIT 1
    `,
    [input.conversationId, input.projectKey, input.visitorToken]
  );

  if (!result.rowCount) {
    return null;
  }

  return {
    conversationId: result.rows[0].conversation_id,
    visitorId: result.rows[0].visitor_id,
    projectId: result.rows[0].project_id,
    visitorName: result.rows[0].visitor_name ?? null,
    visitorEmail: result.rows[0].visitor_email ?? null,
    visitorPhone: result.rows[0].visitor_phone ?? null
  };
}

export async function listConversationMessages(
  pool: Pool,
  input: {
    conversationId: number;
    afterId?: number;
  }
): Promise<ChatMessage[]> {
  const result = await pool.query(
    `
      SELECT m.*, o.display_name AS operator_name
      FROM chat_messages m
      LEFT JOIN chat_operators o ON o.id = m.operator_id
      WHERE m.conversation_id = $1
        AND ($2::bigint IS NULL OR m.id > $2)
      ORDER BY m.id ASC
    `,
    [input.conversationId, input.afterId ?? null]
  );

  return result.rows.map(mapMessage);
}

export async function createVisitorMessage(
  pool: Pool,
  input: {
    conversationId: number;
    body: string;
    metadata: Record<string, string>;
  }
): Promise<ChatMessage> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const duplicate = await client.query(
      `
        SELECT id
        FROM chat_messages
        WHERE conversation_id = $1
          AND sender_type = 'visitor'
          AND body_plain = $2
          AND created_at > NOW() - INTERVAL '10 seconds'
        ORDER BY id DESC
        LIMIT 1
      `,
      [input.conversationId, input.body]
    );

    if (duplicate.rowCount) {
      const existing = await client.query(
        `
          SELECT m.*, o.display_name AS operator_name
          FROM chat_messages m
          LEFT JOIN chat_operators o ON o.id = m.operator_id
          WHERE m.id = $1
        `,
        [duplicate.rows[0].id]
      );
      await client.query("COMMIT");
      return mapMessage(existing.rows[0]);
    }

    const messageResult = await client.query(
      `
        INSERT INTO chat_messages (
          conversation_id,
          sender_type,
          body,
          body_plain,
          metadata
        )
        VALUES ($1, 'visitor', $2, $2, $3::jsonb)
        RETURNING *
      `,
      [input.conversationId, input.body, JSON.stringify(input.metadata)]
    );

    await client.query(
      `
        UPDATE chat_conversations
        SET status = 'open',
            closed_at = NULL,
            last_message_at = NOW(),
            last_visitor_message_at = NOW()
        WHERE id = $1
      `,
      [input.conversationId]
    );

    await client.query("COMMIT");
    return mapMessage(messageResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createOperatorReply(
  pool: Pool,
  input: {
    conversationId: number;
    operatorId: number;
    body: string;
  }
): Promise<ChatMessage> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const messageResult = await client.query(
      `
        INSERT INTO chat_messages (
          conversation_id,
          sender_type,
          operator_id,
          body,
          body_plain,
          metadata
        )
        VALUES ($1, 'operator', $2, $3, $3, '{}'::jsonb)
        RETURNING *
      `,
      [input.conversationId, input.operatorId, input.body]
    );

    await client.query(
      `
        UPDATE chat_conversations
        SET status = 'open',
            closed_at = NULL,
            last_message_at = NOW(),
            last_operator_message_at = NOW()
        WHERE id = $1
      `,
      [input.conversationId]
    );

    await client.query("COMMIT");
    const hydrated = await pool.query(
      `
        SELECT m.*, o.display_name AS operator_name
        FROM chat_messages m
        LEFT JOIN chat_operators o ON o.id = m.operator_id
        WHERE m.id = $1
      `,
      [messageResult.rows[0].id]
    );
    return mapMessage(hydrated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createInternalNote(
  pool: Pool,
  input: {
    conversationId: number;
    operatorId: number;
    body: string;
  }
): Promise<ChatInternalNote> {
  const result = await pool.query(
    `
      INSERT INTO chat_internal_notes (
        conversation_id,
        operator_id,
        body,
        metadata
      )
      VALUES ($1, $2, $3, '{}'::jsonb)
      RETURNING *
    `,
    [input.conversationId, input.operatorId, input.body]
  );

  const hydrated = await pool.query(
    `
      SELECT n.*, o.display_name AS operator_name
      FROM chat_internal_notes n
      LEFT JOIN chat_operators o ON o.id = n.operator_id
      WHERE n.id = $1
    `,
    [result.rows[0].id]
  );

  return mapNote(hydrated.rows[0]);
}

export async function updateConversationStatus(
  pool: Pool,
  input: {
    conversationId: number;
    status: ConversationStatus;
  }
): Promise<void> {
  const result = await pool.query(
    `
      UPDATE chat_conversations
      SET status = $2::chat_conversation_status,
          closed_at = CASE
            WHEN $2::chat_conversation_status = 'open'::chat_conversation_status THEN NULL
            ELSE NOW()
          END
      WHERE id = $1
    `,
    [input.conversationId, input.status]
  );

  if (!result.rowCount) {
    throw new Error("Conversation not found");
  }
}

export async function getConversationSummaryById(
  pool: Pool,
  conversationId: number
): Promise<ConversationSummary | null> {
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.visitor_id,
        c.status,
        c.source_url,
        c.referrer,
        c.started_at,
        c.last_message_at,
        c.last_visitor_message_at,
        c.last_operator_message_at,
        p.key AS project_key,
        p.display_name AS project_display_name,
        v.name AS visitor_name,
        v.email AS visitor_email,
        v.phone AS visitor_phone,
        latest.body_plain AS latest_message,
        (
          c.status = 'open'
          AND c.last_visitor_message_at IS NOT NULL
          AND (
            c.last_operator_message_at IS NULL
            OR c.last_visitor_message_at > c.last_operator_message_at
          )
        ) AS unread
      FROM chat_conversations c
      JOIN chat_projects p ON p.id = c.project_id
      JOIN chat_visitors v ON v.id = c.visitor_id
      LEFT JOIN LATERAL (
        SELECT body_plain
        FROM chat_messages
        WHERE conversation_id = c.id
        ORDER BY id DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE c.id = $1
      LIMIT 1
    `,
    [conversationId]
  );

  if (!result.rowCount) {
    return null;
  }

  return mapConversation(result.rows[0]);
}

export async function getConversationDetails(
  pool: Pool,
  conversationId: number
): Promise<ConversationDetails | null> {
  const conversation = await getConversationSummaryById(pool, conversationId);

  if (!conversation) {
    return null;
  }

  const [messages, notes] = await Promise.all([
    listConversationMessages(pool, { conversationId }),
    listConversationNotes(pool, conversationId)
  ]);

  return {
    ...conversation,
    messages,
    notes
  };
}

export async function listConversationNotes(pool: Pool, conversationId: number): Promise<ChatInternalNote[]> {
  const result = await pool.query(
    `
      SELECT n.*, o.display_name AS operator_name
      FROM chat_internal_notes n
      LEFT JOIN chat_operators o ON o.id = n.operator_id
      WHERE n.conversation_id = $1
      ORDER BY n.id ASC
    `,
    [conversationId]
  );

  return result.rows.map(mapNote);
}

export async function listAdminConversations(
  pool: Pool,
  input: {
    projectKey?: string;
    status?: ConversationStatus;
    limit: number;
    cursor?: number;
  }
): Promise<ConversationSummary[]> {
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.visitor_id,
        c.status,
        c.source_url,
        c.referrer,
        c.started_at,
        c.last_message_at,
        c.last_visitor_message_at,
        c.last_operator_message_at,
        p.key AS project_key,
        p.display_name AS project_display_name,
        v.name AS visitor_name,
        v.email AS visitor_email,
        v.phone AS visitor_phone,
        latest.body_plain AS latest_message,
        (
          c.status = 'open'
          AND c.last_visitor_message_at IS NOT NULL
          AND (
            c.last_operator_message_at IS NULL
            OR c.last_visitor_message_at > c.last_operator_message_at
          )
        ) AS unread
      FROM chat_conversations c
      JOIN chat_projects p ON p.id = c.project_id
      JOIN chat_visitors v ON v.id = c.visitor_id
      LEFT JOIN LATERAL (
        SELECT body_plain
        FROM chat_messages
        WHERE conversation_id = c.id
        ORDER BY id DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE ($1::text IS NULL OR p.key = $1)
        AND ($2::chat_conversation_status IS NULL OR c.status = $2)
        AND ($3::bigint IS NULL OR c.id < $3)
      ORDER BY c.last_message_at DESC, c.id DESC
      LIMIT $4
    `,
    [input.projectKey ?? null, input.status ?? null, input.cursor ?? null, input.limit]
  );

  return result.rows.map(mapConversation);
}

export async function listVisitorContacts(
  pool: Pool,
  input: AdminContactListQuery
) {
  const result = await pool.query(
    `
      SELECT
        v.id,
        v.name,
        v.email,
        v.phone,
        v.first_seen_at,
        v.last_seen_at,
        p.key AS project_key,
        p.display_name AS project_display_name,
        latest_conversation.id AS last_conversation_id
      FROM chat_visitors v
      JOIN chat_projects p ON p.id = v.project_id
      LEFT JOIN LATERAL (
        SELECT c.id
        FROM chat_conversations c
        WHERE c.visitor_id = v.id
        ORDER BY c.last_message_at DESC, c.id DESC
        LIMIT 1
      ) latest_conversation ON TRUE
      WHERE ($1::text IS NULL OR p.key = $1)
        AND (v.email IS NOT NULL OR v.phone IS NOT NULL)
      ORDER BY v.last_seen_at DESC, v.id DESC
      LIMIT $2
    `,
    [input.projectKey ?? null, input.limit]
  );

  return result.rows.map(mapVisitorContact);
}

export async function findOperatorByIdentifier(pool: Pool, identifier: string): Promise<any | null> {
  const result = await pool.query(
    `
      SELECT *
      FROM chat_operators
      WHERE LOWER(email) = $1
      LIMIT 1
    `,
    [identifier]
  );

  return result.rows[0] ?? null;
}

export async function updateOperatorDisplayName(
  pool: Pool,
  input: {
    operatorId: number;
    displayName: string;
  }
): Promise<OperatorSessionUser | null> {
  const result = await pool.query(
    `
      UPDATE chat_operators
      SET display_name = $2
      WHERE id = $1
      RETURNING id, email, display_name, role
    `,
    [input.operatorId, input.displayName]
  );

  if (!result.rowCount) {
    return null;
  }

  return {
    id: result.rows[0].id,
    email: result.rows[0].email,
    displayName: result.rows[0].display_name,
    role: result.rows[0].role
  };
}

export async function createOperatorSession(
  pool: Pool,
  input: {
    operatorId: number;
    sessionTokenHash: string;
    csrfTokenHash: string;
    expiresAt: Date;
    ip?: string | null;
    userAgent?: string | null;
  }
): Promise<void> {
  await pool.query(
    `
      INSERT INTO chat_operator_sessions (
        operator_id,
        session_token_hash,
        csrf_token_hash,
        expires_at,
        ip,
        user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      input.operatorId,
      input.sessionTokenHash,
      input.csrfTokenHash,
      input.expiresAt,
      input.ip ?? null,
      input.userAgent ?? null
    ]
  );
}

export async function getOperatorSession(
  pool: Pool,
  sessionTokenHash: string
): Promise<
  | {
      id: number;
      operatorId: number;
      csrfTokenHash: string;
      expiresAt: Date;
      lastSeenAt: Date;
      user: OperatorSessionUser;
    }
  | null
> {
  const result = await pool.query(
    `
      SELECT
        s.id,
        s.operator_id,
        s.csrf_token_hash,
        s.expires_at,
        s.last_seen_at,
        o.email,
        o.display_name,
        o.role
      FROM chat_operator_sessions s
      JOIN chat_operators o ON o.id = s.operator_id
      WHERE s.session_token_hash = $1
        AND s.expires_at > NOW()
        AND o.is_active = TRUE
      LIMIT 1
    `,
    [sessionTokenHash]
  );

  if (!result.rowCount) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: row.id,
    operatorId: row.operator_id,
    csrfTokenHash: row.csrf_token_hash,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    user: {
      id: row.operator_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role
    }
  };
}

export async function updateOperatorSessionActivity(
  pool: Pool,
  input: {
    sessionId: number;
    expiresAt: Date;
  }
): Promise<void> {
  await pool.query(
    `
      UPDATE chat_operator_sessions
      SET last_seen_at = NOW(),
          expires_at = $2
      WHERE id = $1
    `,
    [input.sessionId, input.expiresAt]
  );
}

export async function rotateOperatorSession(
  pool: Pool,
  input: {
    sessionId: number;
    sessionTokenHash: string;
    csrfTokenHash: string;
    expiresAt: Date;
  }
): Promise<void> {
  await pool.query(
    `
      UPDATE chat_operator_sessions
      SET session_token_hash = $2,
          csrf_token_hash = $3,
          expires_at = $4,
          last_seen_at = NOW()
      WHERE id = $1
    `,
    [input.sessionId, input.sessionTokenHash, input.csrfTokenHash, input.expiresAt]
  );
}

export async function deleteOperatorSession(pool: Pool, sessionTokenHash: string): Promise<void> {
  await pool.query(
    `
      DELETE FROM chat_operator_sessions
      WHERE session_token_hash = $1
    `,
    [sessionTokenHash]
  );
}

export async function listOperatorPushSubscriptions(
  pool: Pool,
  operatorId: number
): Promise<OperatorPushSubscriptionSummary[]> {
  const result = await pool.query(
    `
      SELECT *
      FROM chat_operator_push_subscriptions
      WHERE operator_id = $1
        AND revoked_at IS NULL
      ORDER BY last_seen_at DESC, id DESC
    `,
    [operatorId]
  );

  return result.rows.map(mapPushSubscription);
}

export async function listActivePushSubscriptions(
  pool: Pool
): Promise<
  Array<{
    id: number;
    endpoint: string;
    p256dhKey: string;
    authKey: string;
  }>
> {
  const result = await pool.query(
    `
      SELECT s.id, s.endpoint, s.p256dh_key, s.auth_key
      FROM chat_operator_push_subscriptions s
      JOIN chat_operators o ON o.id = s.operator_id
      WHERE s.revoked_at IS NULL
        AND o.is_active = TRUE
      ORDER BY s.id ASC
    `
  );

  return result.rows.map((row) => ({
    id: row.id,
    endpoint: row.endpoint,
    p256dhKey: row.p256dh_key,
    authKey: row.auth_key
  }));
}

export async function upsertOperatorPushSubscription(
  pool: Pool,
  input: {
    operatorId: number;
    endpoint: string;
    p256dhKey: string;
    authKey: string;
    deviceLabel?: string;
    userAgent?: string | null;
  }
): Promise<void> {
  await pool.query(
    `
      INSERT INTO chat_operator_push_subscriptions (
        operator_id,
        endpoint,
        p256dh_key,
        auth_key,
        device_label,
        user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (endpoint)
      DO UPDATE SET
        operator_id = EXCLUDED.operator_id,
        p256dh_key = EXCLUDED.p256dh_key,
        auth_key = EXCLUDED.auth_key,
        device_label = EXCLUDED.device_label,
        user_agent = EXCLUDED.user_agent,
        last_seen_at = NOW(),
        revoked_at = NULL
    `,
    [
      input.operatorId,
      input.endpoint,
      input.p256dhKey,
      input.authKey,
      input.deviceLabel ?? null,
      input.userAgent ?? null
    ]
  );
}

export async function revokeOperatorPushSubscription(
  pool: Pool,
  input: {
    operatorId: number;
    endpoint: string;
  }
): Promise<void> {
  await pool.query(
    `
      UPDATE chat_operator_push_subscriptions
      SET revoked_at = NOW(),
          last_seen_at = NOW()
      WHERE operator_id = $1
        AND endpoint = $2
        AND revoked_at IS NULL
    `,
    [input.operatorId, input.endpoint]
  );
}

export async function revokeOperatorPushSubscriptionById(
  pool: Pool,
  subscriptionId: number
): Promise<void> {
  await pool.query(
    `
      UPDATE chat_operator_push_subscriptions
      SET revoked_at = NOW()
      WHERE id = $1
        AND revoked_at IS NULL
    `,
    [subscriptionId]
  );
}

export async function touchPushSubscriptionNotification(
  pool: Pool,
  subscriptionIds: number[]
): Promise<void> {
  if (subscriptionIds.length === 0) {
    return;
  }

  await pool.query(
    `
      UPDATE chat_operator_push_subscriptions
      SET last_notified_at = NOW()
      WHERE id = ANY($1::bigint[])
    `,
    [subscriptionIds]
  );
}

export async function insertAuditLog(
  pool: Pool,
  input: {
    operatorId?: number | null;
    action: string;
    entityType: string;
    entityId: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await pool.query(
    `
      INSERT INTO chat_audit_log (
        operator_id,
        action,
        entity_type,
        entity_id,
        payload
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      input.operatorId ?? null,
      input.action,
      input.entityType,
      input.entityId,
      JSON.stringify(input.payload)
    ]
  );
}

export async function insertNotification(
  pool: Pool,
  input: {
    conversationId: number;
    channel: "email" | "telegram" | "web_push";
    payloadSafe: Record<string, unknown>;
  },
  clientArg?: Pool | PoolClient
): Promise<number> {
  const executor = clientArg ?? pool;
  const result = await executor.query(
    `
      INSERT INTO chat_internal_notifications (
        conversation_id,
        channel,
        payload_safe
      )
      VALUES ($1, $2, $3::jsonb)
      RETURNING id
    `,
    [input.conversationId, input.channel, JSON.stringify(input.payloadSafe)]
  );

  return result.rows[0].id;
}

export async function markNotificationSent(
  pool: Pool,
  notificationId: number,
  sent: boolean
): Promise<void> {
  await pool.query(
    `
      UPDATE chat_internal_notifications
      SET status = $2,
          sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END
      WHERE id = $1
    `,
    [notificationId, sent ? "sent" : "failed"]
  );
}

export async function getConversationEnvelope(
  pool: Pool,
  conversationId: number
): Promise<
  | {
      conversationId: number;
      projectKey: string;
    }
  | null
> {
  const result = await pool.query(
    `
      SELECT c.id AS conversation_id, p.key AS project_key
      FROM chat_conversations c
      JOIN chat_projects p ON p.id = c.project_id
      WHERE c.id = $1
      LIMIT 1
    `,
    [conversationId]
  );

  if (!result.rowCount) {
    return null;
  }

  return {
    conversationId: result.rows[0].conversation_id,
    projectKey: result.rows[0].project_key
  };
}
