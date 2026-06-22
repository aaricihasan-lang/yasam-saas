-- =============================================================================
-- 20260622200000_settings_support.sql
-- Ayarlar & Güvenlik modülü — support_messages tablosu
-- =============================================================================

CREATE TABLE IF NOT EXISTS support_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   uuid        NOT NULL,
  subject     text        NOT NULL,
  message     text        NOT NULL,
  priority    text        NOT NULL DEFAULT 'normal'
                          CHECK (priority IN ('normal', 'urgent')),
  status      text        NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'read', 'replied', 'closed')),
  admin_note  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_user_id
  ON support_messages(user_id);

CREATE INDEX IF NOT EXISTS idx_support_messages_status_created
  ON support_messages(status, created_at DESC);

-- RLS: yalnızca service_role (API route'ları) erişebilir
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_messages_deny_direct"
  ON support_messages
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
