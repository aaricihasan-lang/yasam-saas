-- user_sessions tablosuna platform kolonu ekleniyor
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS platform text;
