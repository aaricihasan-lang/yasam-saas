-- Platform bazlı oturum limitleri
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_desktop_sessions integer DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_mobile_sessions  integer DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_tablet_sessions  integer DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_unknown_sessions integer DEFAULT 0;
