-- ============================================================
-- FAZ 9A — human_design_charts: hesaplanmış (computed) harita kalıcılığı
--
-- Amaç: FAZ 5–8 üretim motoru (computeHumanDesignChart → HdChartResult) çıktısını
--       + yeniden-üretilebilir girdiyi (date/time/timezone) mevcut tabloda saklamak.
--
-- İlkeler:
--   • ADDITIVE + NULLABLE + geriye-uyumlu — mevcut MANUEL akışı BOZMAZ.
--   • RLS / policy / grant / trigger DEĞİŞMEZ (yalnız kolon eklenir).
--   • idempotent: "add column if not exists".
--   • PostgreSQL 11+ sabit-default ADD COLUMN = metadata-only (tablo yeniden
--     yazılmaz; kilit/rewrite riski yok). Mevcut satırlar source='manual' ile
--     otomatik backfill olur; diğer yeni kolonlar NULL kalır.
--
-- NOT: Bu dosya bir DRAFT/migration kaydıdır. Proje ortamında DDL doğrudan
--      uygulanmaz (DATABASE_URL=localhost çalışmaz) → Supabase Dashboard SQL
--      Editor ile bilinçli şekilde uygulanacaktır.
-- ============================================================

alter table public.human_design_charts
  add column if not exists timezone         text,
  add column if not exists source           text default 'manual',
  add column if not exists input            jsonb,
  add column if not exists computed_result  jsonb,
  add column if not exists engine_version   text,
  add column if not exists contract_version text,
  add column if not exists location_id      text;

-- ------------------------------------------------------------
-- ROLLBACK (geri alma) — gerekirse Dashboard'da elle çalıştırılır.
-- DİKKAT: saklanmış hesaplanmış veriyi (input / computed_result / timezone /
-- version / location_id) KALICI olarak siler.
--
-- alter table public.human_design_charts
--   drop column if exists timezone,
--   drop column if exists source,
--   drop column if exists input,
--   drop column if exists computed_result,
--   drop column if exists engine_version,
--   drop column if exists contract_version,
--   drop column if exists location_id;
-- ------------------------------------------------------------
