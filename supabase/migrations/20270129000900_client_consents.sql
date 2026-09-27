-- =============================================================================
-- 20270129000900_client_consents.sql   [ADDITIVE — NEW TABLE + VIEW]
--
-- FAZ1 FINAL HARDENING — PAKET INFRA — KVKK danışan onam/aydınlatma kaydı.
--
-- AMAÇ: Uzmanın (veri sorumlusu) danışanına yaptığı aydınlatmayı ve aldığı açık
--   rıza / iletişim izni kararlarını APPEND-ONLY, denetlenebilir biçimde kaydetmek.
--   Her değişiklik YENİ satırdır (geri çekme = status 'withdrawn' olan yeni satır);
--   güncel durum `client_consent_current` view'ından (DISTINCT ON) okunur.
--
-- GÜVENLİK MODELİ (expert_usage_events / admin_audit_log deseni):
--   * REVOKE ALL FROM PUBLIC, anon, authenticated → tarayıcı/publishable erişimi YOK.
--   * service_role: yalnız SELECT + INSERT (UPDATE/DELETE grant'i YOK).
--   * RLS açık + service_role policy.
--   * tenant_id / client_id / recorded_by_user_id İSTEMCİDEN GELMEZ: API
--     (app/api/clients/[id]/consents) requireModuleAccess guard'ından yazar.
--   * UPDATE her zaman engellenir (trigger). DELETE yalnız danışan satırı silinmişse
--     (FK ON DELETE CASCADE — KVKK silme hakkı) geçer; doğrudan DELETE engellenir.
--     NOT (DY-A cascade-delete): client_consents'i AYRICA silmeyin; clients satırı
--     silinince FK cascade temizler.
--
-- PRECONDITION: public.clients mevcut (tenant_id, id). Composite FK hedefi
--   clients_tenant_id_id_key UNIQUE(tenant_id, id) prod'da VAR (20260923000000);
--   yoksa aynı adla idempotent eklenir (20260923000000 / 20270104000000 deseni).
--
-- VERİ-YIKICI MI: HAYIR (yalnız yeni tablo/view/fonksiyon/trigger; mevcut veri değişmez).
-- ⚠️ PRODUCTION'A UYGULANMADI. Apply sırası: bu migration → consents API'sini içeren deploy
--   (API tablo yoksa 503 CONSENTS_NOT_READY döner; kod önce gelse de kırılmaz).
--
-- ROLLBACK (veri kaybı: tüm onam geçmişi silinir — yalnız bilinçli karar ile):
--   DROP VIEW IF EXISTS public.client_consent_current;
--   DROP TABLE IF EXISTS public.client_consents;          -- trigger'lar tabloyla düşer
--   DROP FUNCTION IF EXISTS public.client_consents_prevent_mutation();
-- =============================================================================

BEGIN;

-- ─── 0) Precondition ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.clients') IS NULL THEN
    RAISE EXCEPTION 'client_consents: public.clients bulunamadı (precondition)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clients'::regclass
      AND contype IN ('u', 'p')
      AND conname = 'clients_tenant_id_id_key'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_tenant_id_id_key UNIQUE (tenant_id, id);
  END IF;
END $$;

-- ─── 1) Tablo ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_consents (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid        NOT NULL,
  client_id            uuid        NOT NULL,
  consent_type         text        NOT NULL,
  status               text        NOT NULL,
  -- Uzmanın kullandığı metin şablonunun sürümü (lib/legal/clientConsent.ts CONSENT_TEXT_VERSION).
  text_version         text        NOT NULL,
  method               text        NOT NULL,
  -- Kaydın alındığı ekran/akış (ör. 'dy_detay', 'dy_kayit', 'api').
  source               text,
  -- Kısa açıklama (PII/sağlık verisi YAZILMAMALI — UI uyarır).
  note                 text,
  recorded_by_user_id  uuid        NOT NULL,
  recorded_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT client_consents_type_chk CHECK (consent_type IN (
    'aydinlatma_bildirildi',
    'acik_riza_ozel_nitelikli',
    'acik_riza_yurtdisi_aktarim',
    'iletisim_izni'
  )),
  CONSTRAINT client_consents_status_chk CHECK (status IN ('granted', 'refused', 'withdrawn', 'pending')),
  CONSTRAINT client_consents_method_chk CHECK (method IN ('islak_imza', 'uygulama_onay', 'sozlu_kayit', 'diger')),
  CONSTRAINT client_consents_text_version_chk CHECK (char_length(text_version) BETWEEN 1 AND 64),
  CONSTRAINT client_consents_source_chk CHECK (source IS NULL OR char_length(source) <= 64),
  CONSTRAINT client_consents_note_chk CHECK (note IS NULL OR char_length(note) <= 1000),
  CONSTRAINT client_consents_client_fk FOREIGN KEY (tenant_id, client_id)
    REFERENCES public.clients (tenant_id, id) ON DELETE CASCADE
);

COMMENT ON TABLE public.client_consents IS
  'KVKK danışan aydınlatma/onam kayıtları. Append-only; yalnız service_role (API). Güncel durum: client_consent_current.';

CREATE INDEX IF NOT EXISTS idx_client_consents_client_type_time
  ON public.client_consents (tenant_id, client_id, consent_type, recorded_at DESC, id DESC);

-- ─── 2) Append-only koruması ─────────────────────────────────────────────────
-- UPDATE: her zaman red. DELETE: yalnız ebeveyn danışan artık yoksa (FK cascade).
-- Cascade sırasında clients satırı aynı transaction'da zaten silinmiştir → NOT EXISTS.
CREATE OR REPLACE FUNCTION public.client_consents_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.tenant_id = OLD.tenant_id AND c.id = OLD.client_id
    ) THEN
      RETURN OLD;   -- danışan silindi → KVKK silme (cascade) serbest
    END IF;
  END IF;
  RAISE EXCEPTION 'client_consents append-only: % engellendi (yeni kayıt ekleyin)', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.client_consents_prevent_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_client_consents_no_update ON public.client_consents;
CREATE TRIGGER trg_client_consents_no_update
  BEFORE UPDATE ON public.client_consents
  FOR EACH ROW EXECUTE FUNCTION public.client_consents_prevent_mutation();

DROP TRIGGER IF EXISTS trg_client_consents_no_delete ON public.client_consents;
CREATE TRIGGER trg_client_consents_no_delete
  BEFORE DELETE ON public.client_consents
  FOR EACH ROW EXECUTE FUNCTION public.client_consents_prevent_mutation();

-- ─── 3) Grant + RLS ──────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.client_consents FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.client_consents TO service_role;

ALTER TABLE public.client_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_client_consents" ON public.client_consents;
CREATE POLICY "service_role_client_consents"
  ON public.client_consents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ─── 4) Güncel durum view'ı ──────────────────────────────────────────────────
-- security_invoker: view, çağıranın yetkisiyle çalışır (RLS/grant bypass YOK).
CREATE OR REPLACE VIEW public.client_consent_current
WITH (security_invoker = true) AS
SELECT DISTINCT ON (cc.tenant_id, cc.client_id, cc.consent_type)
  cc.id,
  cc.tenant_id,
  cc.client_id,
  cc.consent_type,
  cc.status,
  cc.text_version,
  cc.method,
  cc.source,
  cc.recorded_by_user_id,
  cc.recorded_at
FROM public.client_consents cc
ORDER BY cc.tenant_id, cc.client_id, cc.consent_type, cc.recorded_at DESC, cc.id DESC;

COMMENT ON VIEW public.client_consent_current IS
  'KVKK: danışan × onam türü başına en son kayıt (append-only client_consents üzerinden).';

REVOKE ALL ON TABLE public.client_consent_current FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.client_consent_current TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA:
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.client_consents'::regclass;          -- true
--   SELECT has_table_privilege('anon','public.client_consents','SELECT');                          -- false
--   SELECT has_table_privilege('service_role','public.client_consents','UPDATE');                  -- false
--   SELECT has_table_privilege('anon','public.client_consent_current','SELECT');                   -- false
-- =============================================================================
