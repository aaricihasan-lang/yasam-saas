-- =============================================================================
-- 20260903000000_admin_audit_log.sql
--
-- FAZ G — ADMİN YÖNETİM İŞLEM GEÇMİŞİ (audit) ALTYAPISI
--
-- AMAÇ:
--   Gelecek fazlarda (B/C/D/E/F/I) yapılacak tüm yönetim işlemlerinin merkezi,
--   güvenli ve DEĞİŞTİRİLEMEZ (append-only) biçimde kaydedilmesi için tablo.
--   Bu migration YALNIZCA altyapıdır; mevcut route'lara audit çağrısı EKLENMEZ.
--
-- GÜVENLİK MODELİ (ürün kuralı #10 — default-deny):
--   1) REVOKE ALL ... FROM anon, authenticated  → anon/authenticated tam red.
--   2) ENABLE ROW LEVEL SECURITY.
--   3) Yalnız service_role policy (server API / getServerDb) yazar ve okur.
--   Browser/publishable doğrudan erişim YOK.
--
-- DEĞİŞTİRİLEMEZLİK (ürün kuralı #9 — append-only):
--   BEFORE UPDATE / BEFORE DELETE trigger'ları her satır için exception fırlatır.
--   Böylece uygulama (service_role dahil) kaydı normal yolla güncelleyemez/silemez.
--   Saklama/temizlik gerekirse yalnız DB sahibi trigger'ı bilinçli devre dışı
--   bırakarak yapabilir (bilinçli, denetlenebilir istisna).
--
-- HASSAS VERİ (ürün kuralı #4):
--   Parola/hash/token/cookie/authorization/service_role ve danışan PII'si
--   (ad, e-posta, telefon, adres, sağlık/analiz/ödev içeriği) BU TABLOYA
--   YAZILMAMALIDIR. Kolonlar buna izin verse de engel APPLICATION katmanındadır
--   (lib/admin/adminAudit.ts — assertAuditFieldSafe: yasaklı anahtar bulunursa
--    payload TAMAMEN REDDEDİLİR / insert gönderilmez (fail-closed); redaksiyon YOK).
--   Bu tablo yalnız yönetimsel metadata (eski/yeni durum, sonuç sayısı vb.) tutar.
--
-- KAPSAM: yalnız public.admin_audit_log. Başka tabloya/route'a dokunulmaz.
-- IDEMPOTENT: IF NOT EXISTS / DROP ... IF EXISTS ile tekrar çalıştırılabilir.
-- ⚠️ Bu commit canlıya otomatik uygulama DEĞİLDİR; uygulama ayrı onayla yapılır.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tablo
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- İşlemi yapan admin (her zaman zorunlu). Hard-delete engellenir (audit korunur);
  -- uygulama zaten soft-delete kullanır → pratikte RESTRICT tetiklenmez.
  actor_admin_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,

  -- İşlemi yapanın ana yönetici olup olmadığı (normal-admin görünürlük filtresi +
  -- workspace görüntüleme gibi ana-admin'e özel kayıtların ayrımı için — kural #6/#7/#8).
  actor_is_main_admin boolean     NOT NULL DEFAULT false,

  -- Hedef kullanıcı (bazı sistemsel işlemlerde boş olabilir). Hedef (varsayımsal)
  -- hard-delete edilirse audit satırı korunur, referans null'a düşer.
  target_user_id      uuid        REFERENCES public.users(id) ON DELETE SET NULL,

  -- İşlem türü — sabit sözleşme (lib/admin/adminAudit.ts ADMIN_AUDIT_ACTIONS ile
  -- birebir aynı olmalı; harness bunu doğrular). Yeni tür = bilinçli migration.
  action              text        NOT NULL,

  old_value           jsonb,      -- eski durum (metadata; PII/secret YASAK)
  new_value           jsonb,      -- yeni durum (metadata; PII/secret YASAK)
  result              jsonb,      -- işlem sonucu (ör. {"closed_count": 3})
  context             jsonb,      -- opsiyonel güvenli bağlam (ör. {"platform":"desktop"})
  reason              text,       -- opsiyonel gerekçe (serbest metin, ≤1000)

  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_audit_action_chk CHECK (action IN (
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
    'main_admin_critical_action'
  )),

  CONSTRAINT admin_audit_reason_len_chk CHECK (reason IS NULL OR char_length(reason) <= 1000)
);

COMMENT ON TABLE public.admin_audit_log IS
  'Faz G — admin yönetim işlem geçmişi. Append-only, yalnız service_role. PII/secret YASAK (metadata-only).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Index'ler
-- ─────────────────────────────────────────────────────────────────────────────
-- Hedef kullanıcının geçmişi (ana kullanım: kullanıcı detayı işlem geçmişi).
CREATE INDEX IF NOT EXISTS idx_admin_audit_target_created
  ON public.admin_audit_log(target_user_id, created_at DESC);

-- İşlemi yapan admine göre.
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_created
  ON public.admin_audit_log(actor_admin_id, created_at DESC);

-- İşlem türüne göre filtreleme.
CREATE INDEX IF NOT EXISTS idx_admin_audit_action_created
  ON public.admin_audit_log(action, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Değiştirilemezlik (append-only) — UPDATE/DELETE engeli
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_audit_log_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log append-only: % engellendi', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_audit_no_update ON public.admin_audit_log;
CREATE TRIGGER trg_admin_audit_no_update
  BEFORE UPDATE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_log_prevent_mutation();

DROP TRIGGER IF EXISTS trg_admin_audit_no_delete ON public.admin_audit_log;
CREATE TRIGGER trg_admin_audit_no_delete
  BEFORE DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_log_prevent_mutation();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS + grant güvenliği (default-deny; yalnız service_role)
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.admin_audit_log FROM anon, authenticated;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_admin_audit_log" ON public.admin_audit_log;
CREATE POLICY "service_role_admin_audit_log"
  ON public.admin_audit_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, salt-okuma — beklenen):
--   SELECT relrowsecurity FROM pg_class
--     WHERE relnamespace='public'::regnamespace AND relname='admin_audit_log';   -- true
--   SELECT has_table_privilege('anon','public.admin_audit_log','SELECT');         -- false
--   SELECT has_table_privilege('authenticated','public.admin_audit_log','INSERT');-- false
--   SELECT count(*) FROM pg_policies
--     WHERE schemaname='public' AND tablename='admin_audit_log';                  -- 1 (service_role)
--   -- append-only: service_role ile UPDATE/DELETE denemesi exception vermeli.
-- =============================================================================

-- =============================================================================
-- ROLLBACK (geri alma):
--   DROP TRIGGER IF EXISTS trg_admin_audit_no_update ON public.admin_audit_log;
--   DROP TRIGGER IF EXISTS trg_admin_audit_no_delete ON public.admin_audit_log;
--   DROP FUNCTION IF EXISTS public.admin_audit_log_prevent_mutation();
--   DROP TABLE IF EXISTS public.admin_audit_log;   -- (kimse yazmadıysa veri kaybı yok)
-- =============================================================================
