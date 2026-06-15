-- ============================================================
-- 20260615000002_aromatherapy_p3.sql
--
-- Aromaterapi P3: Excel'den eksik alanlar
-- english_name, diffuser_usage, massage_usage
-- (maceration tipi oil_type text sütununa değer olarak eklenir — enum değil)
-- ============================================================

alter table public.aromatherapy_oils
  add column if not exists english_name   text not null default '',
  add column if not exists diffuser_usage text not null default '',
  add column if not exists massage_usage  text not null default '';
