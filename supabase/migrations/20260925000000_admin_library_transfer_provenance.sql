-- =============================================================================
-- 20260925000000_admin_library_transfer_provenance.sql
--
-- FAZ 1 / P4 — ADMIN KÜTÜPHANE HEDİYESİ / BAĞIMSIZ SNAPSHOT KOPYASI
--
-- AMAÇ: Admin kütüphanesinden bir uzmana seçili kayıtların BAĞIMSIZ KOPYA
--   (snapshot / hediye) olarak teslimi için:
--     1. Kopya hedef tablolara provenance (köken) alanları eklemek — kayıt
--        adminden geldiğinde uzman UI'da "Kaynak: Admin Kütüphanesi" rozeti
--        gösterilebilsin; kayıt tamamen uzmanın kendi tenant verisi olur
--        (düzenlenebilir + silinebilir; admin sonradan dokunamaz).
--     2. İdempotency + özet için hafif bir transfer defteri (ledger) tablosu.
--     3. admin_audit_log CHECK'ini library_transfer_* olaylarıyla genişletmek.
--
-- BAĞLAYICI SNAPSHOT KURALLARI (kod tarafında zorlanır; bu migration yalnız şema):
--   - Yalnız INSERT; UPSERT/REPLACE YOK. Aynı isimli kayıtlar yan yana yaşar.
--   - origin_source_id yalnız provenance/audit içindir; CANLI FK YOKTUR (kaynak
--     silinse bile hedef kopya ve etiketi KAYBOLMAZ → ON DELETE CASCADE yasak).
--   - Mevcut satırlar: origin_type = NULL (legacy / uzmanın kendi kaydı).
--
-- GÜVENLİ / GERİYE UYUMLU:
--   - Yalnız nullable kolon EKLEME (ADD COLUMN IF NOT EXISTS) — mevcut veri
--     değişmez, hiçbir kolon düşürülmez. Ledger tablosu deny-by-default RLS.
--   - admin_audit_log CHECK'i SÜPERSET (eski 20 action korunur + 3 yeni) →
--     append-only sözleşmesi bozulmaz.
--   - IDEMPOTENT: to_regclass guard + IF NOT EXISTS + DROP CONSTRAINT IF EXISTS.
--   - RLS/grant ZAYIFLATILMAZ; anon/authenticated yeni yazma yetkisi ALMAZ.
--
-- ⚠️ Otomatik apply DEĞİL. ZORUNLU DEPLOY SIRASI: önce BU migration apply, SONRA
--   kod deploy (provenance kolonları olmadan kod insert ederse kolon bulunamaz).
--   Dashboard SQL Editor ile ayrı onayla uygulanır.
-- =============================================================================

BEGIN;

-- ── 1) Provenance kolonları — 11 tenant-kopya hedef tablosu (guard + idempotent) ──
DO $$
DECLARE
  t text;
  targets text[] := ARRAY[
    'stones', 'minerals', 'combinations',
    'bioenergy_symbols', 'bioenergy_imaginations', 'bioenergy_chakras',
    'bioenergy_energy_bodies', 'bioenergy_subconscious_causes',
    'reflexology_protocols',
    'numerology_knowledge_records', 'numerology_stone_assignments'
  ];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'admin_library_transfer: tablo yok, atlandı: %', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS origin_type text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS origin_label text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS origin_source_id uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS origin_transfer_batch_id uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS transferred_at timestamptz', t);

    -- origin_type güvenli CHECK: mevcut satırlar NULL → geçerli. FK YOK (bilinçli).
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_origin_type_chk') THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (origin_type IS NULL OR origin_type IN (''admin_transfer'', ''expert_created'', ''legacy''))',
        t, t || '_origin_type_chk'
      );
    END IF;

    -- Batch-scoped sorgu (kısmi silme görünürlüğü / rollback) için partial index.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (origin_transfer_batch_id) WHERE origin_transfer_batch_id IS NOT NULL',
      'idx_' || t || '_transfer_batch', t
    );
  END LOOP;
END $$;

-- ── 2) İdempotency / özet defteri — deny-by-default (service_role bypass) ────────
CREATE TABLE IF NOT EXISTS public.admin_library_transfer_batches (
  batch_id          uuid PRIMARY KEY,
  actor_admin_id    uuid NOT NULL,
  target_user_id    uuid,
  source_tenant_id  uuid NOT NULL,
  target_tenant_id  uuid NOT NULL,
  status            text NOT NULL DEFAULT 'processing'
                      CONSTRAINT admin_library_transfer_status_chk
                      CHECK (status IN ('processing', 'completed', 'failed')),
  requested_count   integer NOT NULL DEFAULT 0,
  inserted_count    integer NOT NULL DEFAULT 0,
  counts            jsonb   NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_library_transfer_target
  ON public.admin_library_transfer_batches (target_user_id, created_at DESC);

ALTER TABLE public.admin_library_transfer_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_library_transfer_batches FROM anon, authenticated, PUBLIC;
GRANT ALL ON TABLE public.admin_library_transfer_batches TO service_role;

-- ── 3) admin_audit_log CHECK — SÜPERSET (eski 20 + 3 yeni library_transfer) ────
ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_action_chk;
ALTER TABLE public.admin_audit_log ADD CONSTRAINT admin_audit_action_chk CHECK (action IN (
  'user_created',
  'user_activated',
  'user_deactivated',
  'user_approved',
  'user_rejected',
  'password_changed_by_admin',
  'all_sessions_terminated',
  'single_session_terminated',
  'desktop_limit_changed',
  'mobile_limit_changed',
  'tablet_limit_changed',
  'total_session_limit_changed',
  'module_enabled',
  'module_disabled',
  'payment_status_changed',
  'role_changed',
  'workspace_viewed',
  'user_deleted',
  'user_archived',
  'main_admin_critical_action',
  'library_transfer_completed',
  'library_transfer_failed',
  'library_transfer_retried'
));

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma):
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema='public' AND column_name='origin_type'
--      AND table_name = ANY (ARRAY['stones','minerals','combinations',
--        'bioenergy_symbols','bioenergy_imaginations','bioenergy_chakras',
--        'bioenergy_energy_bodies','bioenergy_subconscious_causes',
--        'reflexology_protocols','numerology_knowledge_records',
--        'numerology_stone_assignments']);   -- mevcut tablo sayısı kadar olmalı
--   SELECT has_table_privilege('anon','public.admin_library_transfer_batches','INSERT'); -- false
--
-- ROLLBACK (gerekirse, manuel değerlendirilir — provenance verisi kaybını göze al):
--   DROP TABLE IF EXISTS public.admin_library_transfer_batches;
--   (provenance kolonları bırakılabilir; veri kaybı riski nedeniyle otomatik DROP yok)
-- =============================================================================
