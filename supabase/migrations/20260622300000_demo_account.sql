-- =============================================================================
-- 20260622300000_demo_account.sql
--
-- Demo Hesap Altyapısı
--
-- 1. users tablosuna is_demo_account boolean alanı eklendi.
-- 2. uzman@test.com demo hesap olarak işaretlendi:
--      is_demo_account = true
--      security_exempt = true  (tüm oturum güvenlik kontrolleri bypass)
--      allowed_active_sessions = 999
--      allowed_locations = 999
--      security_mode = 'flexible'
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_demo_account boolean NOT NULL DEFAULT false;

UPDATE users
SET
  is_demo_account         = true,
  security_exempt         = true,
  allowed_active_sessions = 999,
  allowed_locations       = 999,
  security_mode           = 'flexible'
WHERE lower(trim(email)) = 'uzman@test.com';
