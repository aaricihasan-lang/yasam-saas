-- Kullanıcı lisans ve oturum limiti alanları
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_type            text    DEFAULT 'single';
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_active_sessions integer DEFAULT 2;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_locations       integer DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_mode           text    DEFAULT 'normal';
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_exempt         boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS license_note            text;
