-- ============================================================================
-- 20271120000300_numerology_records_client_link.sql
--
-- AŞAMA 2 / DY-005 · DY-006 — Kayıtlı Numeroloji analizi ↔ merkezî Danışan Yolculuğu danışanı
-- (owner kararı A, 23.10.2026).
--
-- YALNIZ EKLEME (additive). BACKFILL YOK: mevcut tüm kayıtlarda client_id NULL kalır; isim / doğum
-- tarihi benzerliğiyle otomatik veya toplu eşleştirme YAPILMAZ. Bağ yalnız uzmanın açık
-- "Danışana Bağla" işlemiyle (service-role API, tenant oturumdan) kurulur / kaldırılır.
-- Numeroloji motoru, analysis_data snapshot'ı ve mevcut kolonlar DEĞİŞMEZ.
--
-- 1) numerology_records.client_id uuid NULL
-- 2) CHECK: client_id doluysa tenant_id de dolu (MATCH SIMPLE FK'nin NULL tenant'ta denetimsiz
--    kalmasını engeller).
-- 3) Tenant-güvenli bileşik FK: (tenant_id, client_id) → clients(tenant_id, id)
--    (hedef clients_tenant_id_id_key — HD / YH / Anamnez ile aynı desen). Başka tenant'ın danışanına
--    bağlamak DB seviyesinde imkânsız.
--    ON DELETE SET NULL (client_id): danışan silinince Numeroloji kaydı SİLİNMEZ; yalnız bağ kalkar
--    (tenant_id korunur — sütun listeli SET NULL, PostgreSQL 15+).
-- 4) Kısmi index (tenant_id, client_id): danışan Word'ünde bağlı analiz listesi. UNIQUE DEĞİL —
--    bir danışana birden çok analiz bağlanabilir.
--
-- RLS: tablo 20270121000000 ile RLS-on + anon/authenticated yetkisiz; değişmez (yeni policy YOK).
-- VERİ-YIKICI MI: HAYIR. İDEMPOTENT.
-- YAYIN SIRASI: önce bu migration, sonra kod (kod kolon yoksa bağ özelliğini 503 ile kapatır;
--   Numeroloji'nin bağımsız akışı her iki durumda da etkilenmez).
-- GERİ ALMA (veri kaybı: yalnız kurulmuş bağlar):
--   DROP INDEX IF EXISTS public.numerology_records_tenant_client_idx;
--   ALTER TABLE public.numerology_records DROP CONSTRAINT IF EXISTS numerology_records_client_fk;
--   ALTER TABLE public.numerology_records DROP CONSTRAINT IF EXISTS numerology_records_client_tenant_chk;
--   ALTER TABLE public.numerology_records DROP COLUMN IF EXISTS client_id;
-- ============================================================================
BEGIN;

DO $num_link_pre$
BEGIN
  IF to_regclass('public.numerology_records') IS NULL OR to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'numerology_records_client_link: public.numerology_records / public.clients bulunamadı (precondition)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.numerology_records'::regclass AND attname = 'tenant_id' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'numerology_records_client_link: numerology_records.tenant_id yok (precondition)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.clients'::regclass AND contype = 'u' AND conname = 'clients_tenant_id_id_key'
  ) THEN
    RAISE EXCEPTION 'numerology_records_client_link: clients_tenant_id_id_key UNIQUE (tenant_id, id) yok (precondition)';
  END IF;
END
$num_link_pre$;

ALTER TABLE public.numerology_records ADD COLUMN IF NOT EXISTS client_id uuid;

DO $num_link_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.numerology_records'::regclass AND conname = 'numerology_records_client_tenant_chk'
  ) THEN
    ALTER TABLE public.numerology_records
      ADD CONSTRAINT numerology_records_client_tenant_chk
      CHECK (client_id IS NULL OR tenant_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.numerology_records'::regclass AND conname = 'numerology_records_client_fk'
  ) THEN
    ALTER TABLE public.numerology_records
      ADD CONSTRAINT numerology_records_client_fk
      FOREIGN KEY (tenant_id, client_id)
      REFERENCES public.clients (tenant_id, id) ON DELETE SET NULL (client_id);
  END IF;
END
$num_link_constraints$;

CREATE INDEX IF NOT EXISTS numerology_records_tenant_client_idx
  ON public.numerology_records (tenant_id, client_id)
  WHERE client_id IS NOT NULL;

COMMENT ON COLUMN public.numerology_records.client_id IS
  'Merkezî Danışan Yolculuğu danışanı (clients.id). Uzmanın açık "Danışana Bağla" işlemiyle kurulur (otomatik eşleştirme yok). Danışan silinirse NULL olur; kayıt silinmez.';

COMMIT;

NOTIFY pgrst, 'reload schema';
