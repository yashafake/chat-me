DO $$
BEGIN
  CREATE TYPE chat_project_status AS ENUM ('active', 'paused', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE chat_conversation_status AS ENUM ('open', 'closed', 'spam');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE chat_sender_type AS ENUM ('visitor', 'operator', 'system');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE chat_operator_role AS ENUM ('operator', 'manager', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE chat_notification_channel AS ENUM ('email', 'telegram');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE chat_notification_status AS ENUM ('pending', 'sent', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION chat_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS chat_projects (
  id BIGSERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  allowed_origins TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  status chat_project_status NOT NULL DEFAULT 'active',
  theme_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  widget_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_visitors (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES chat_projects(id) ON DELETE CASCADE,
  visitor_token TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'ru',
  name TEXT,
  email TEXT,
  phone TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  anonymized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, visitor_token)
);

CREATE TABLE IF NOT EXISTS chat_operators (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role chat_operator_role NOT NULL DEFAULT 'operator',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_operator_sessions (
  id BIGSERIAL PRIMARY KEY,
  operator_id BIGINT NOT NULL REFERENCES chat_operators(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip INET,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES chat_projects(id) ON DELETE CASCADE,
  visitor_id BIGINT NOT NULL REFERENCES chat_visitors(id) ON DELETE CASCADE,
  status chat_conversation_status NOT NULL DEFAULT 'open',
  source_url TEXT,
  referrer TEXT,
  assigned_operator_id BIGINT REFERENCES chat_operators(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_visitor_message_at TIMESTAMPTZ,
  last_operator_message_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_type chat_sender_type NOT NULL,
  operator_id BIGINT REFERENCES chat_operators(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  body_plain TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivery_status TEXT NOT NULL DEFAULT 'stored',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE TABLE IF NOT EXISTS chat_internal_notes (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  operator_id BIGINT REFERENCES chat_operators(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_internal_notifications (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  channel chat_notification_channel NOT NULL,
  status chat_notification_status NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  payload_safe JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_audit_log (
  id BIGSERIAL PRIMARY KEY,
  operator_id BIGINT REFERENCES chat_operators(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS chat_projects_set_updated_at ON chat_projects;
CREATE TRIGGER chat_projects_set_updated_at
BEFORE UPDATE ON chat_projects
FOR EACH ROW
EXECUTE FUNCTION chat_set_updated_at();

DROP TRIGGER IF EXISTS chat_visitors_set_updated_at ON chat_visitors;
CREATE TRIGGER chat_visitors_set_updated_at
BEFORE UPDATE ON chat_visitors
FOR EACH ROW
EXECUTE FUNCTION chat_set_updated_at();

DROP TRIGGER IF EXISTS chat_operators_set_updated_at ON chat_operators;
CREATE TRIGGER chat_operators_set_updated_at
BEFORE UPDATE ON chat_operators
FOR EACH ROW
EXECUTE FUNCTION chat_set_updated_at();

DROP TRIGGER IF EXISTS chat_conversations_set_updated_at ON chat_conversations;
CREATE TRIGGER chat_conversations_set_updated_at
BEFORE UPDATE ON chat_conversations
FOR EACH ROW
EXECUTE FUNCTION chat_set_updated_at();

CREATE INDEX IF NOT EXISTS chat_projects_status_idx
ON chat_projects(status);

CREATE INDEX IF NOT EXISTS chat_visitors_project_last_seen_idx
ON chat_visitors(project_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS chat_visitors_project_email_idx
ON chat_visitors(project_id, LOWER(email))
WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS chat_operator_sessions_operator_idx
ON chat_operator_sessions(operator_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS chat_operator_sessions_expires_idx
ON chat_operator_sessions(expires_at);

CREATE INDEX IF NOT EXISTS chat_conversations_project_status_last_message_idx
ON chat_conversations(project_id, status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS chat_conversations_visitor_idx
ON chat_conversations(visitor_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS chat_conversations_one_open_idx
ON chat_conversations(project_id, visitor_id)
WHERE status = 'open';

CREATE INDEX IF NOT EXISTS chat_messages_conversation_id_idx
ON chat_messages(conversation_id, id DESC);

CREATE INDEX IF NOT EXISTS chat_internal_notes_conversation_id_idx
ON chat_internal_notes(conversation_id, id DESC);

CREATE INDEX IF NOT EXISTS chat_internal_notifications_conversation_idx
ON chat_internal_notifications(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_audit_log_entity_idx
ON chat_audit_log(entity_type, entity_id, created_at DESC);
