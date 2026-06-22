-- Hesap paylaşım güvenliği: user_sessions ve security_events tabloları

-- ─────────────────────────────────────────────────────────────────────────────
-- user_sessions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address        text,
  country           text,
  city              text,
  user_agent        text,
  device_fingerprint text,
  session_token     text        NOT NULL UNIQUE,
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  end_reason        text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- security_events
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS security_events (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type         text        NOT NULL,
  severity           text        NOT NULL,
  message            text,
  ip_address         text,
  country            text,
  city               text,
  user_agent         text,
  metadata           jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  reviewed_by_admin  boolean     NOT NULL DEFAULT false
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Performance indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
  ON user_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token
  ON user_sessions(session_token);

CREATE INDEX IF NOT EXISTS idx_user_sessions_active
  ON user_sessions(user_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_security_events_user_id
  ON security_events(user_id);

CREATE INDEX IF NOT EXISTS idx_security_events_severity
  ON security_events(user_id, severity, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — yalnızca service_role erişebilir
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE user_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_sessions"
  ON user_sessions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role_security_events"
  ON security_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);
