-- =============================================================================
-- 20260623100000_numeroloji_demo_seed_column.sql
--
-- numerology_records tablosuna is_demo_seed alanı ekler.
-- Demo hesap için seed edilen örnek kayıtları işaretlemek ve
-- idempotent seed çalışmasını sağlamak amacıyla kullanılır.
-- =============================================================================

ALTER TABLE numerology_records
  ADD COLUMN IF NOT EXISTS is_demo_seed boolean NOT NULL DEFAULT false;
