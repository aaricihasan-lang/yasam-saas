-- =============================================================================
-- 20270112000000_expert_usage_events.sql   [ADDITIVE — NEW TABLE]
--
-- UZMAN BAZLI KULLANIM İSTATİSTİKLERİ — FAZ 1 / İP-2C (anlamlı işlem olayları).
--
-- AMAÇ: Başarıyla tamamlanmış ANLAMLI modül işlemleri için hafif, sunucu-kaynaklı,
--   append-only olay kaydı. "Modül kartı açma" veya salt kayıt-sayısı DEĞİL; yalnız
--   sunucuda başarıyla tamamlanan işlem (analiz/protokol/kayıt/rapor) olay üretir.
--
-- GÜVENLİK MODELİ (admin_audit_log ile aynı — default-deny + append-only + least-priv):
--   1) REVOKE ALL FROM anon, authenticated, service_role → sıfır yetki.
--   2) GRANT SELECT, INSERT TO service_role → yalnız yaz+oku (UPDATE/DELETE YOK).
--   3) ENABLE RLS + service_role policy. Browser/publishable doğrudan erişim YOK.
--   * tenant_id + user_id İSTEMCİDEN GELMEZ: uygulama katmanı bunları verifyUserRequest/
--     requireModuleAccess ile SUNUCUDA doğrulanmış guard'tan yazar (lib/usage/usageEvents.ts).
--
-- HASSAS VERİ YASAK (yalnız metadata): danışan adı/PII, analiz içeriği, dosya adı/içeriği,
--   serbest metin, oturum token'ı, IP, tam User-Agent, finansal/hassas kişisel veri
--   BU TABLOYA YAZILMAZ. Şema serbest-metin/PII kolonu İÇERMEZ (yapısal engel).
--
-- İDEMPOTENCY: idempotency_key (nullable) UNIQUE (partial). Create/update olayları
--   kaynak-satır id'sinden türetilmiş anahtar taşır → retry/eşzamanlılık ÇİFT SAYMAZ
--   (INSERT ... ON CONFLICT DO NOTHING). Anahtarı olmayan olaylar (nadir) dedup edilmez;
--   bu durum metrik sözleşmesinde dürüstçe belirtilir.
--
-- KAPSAM: yalnız public.expert_usage_events. IDEMPOTENT. Veri (DML) YOK.
-- ⚠️ Bu migration bu turda HİÇBİR veritabanına UYGULANMAZ (ayrı onay).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.expert_usage_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Çalışma alanı (workspace) — sunucuda doğrulanmış. Modül kayıtları tenant bazlıdır.
  tenant_id       uuid        NOT NULL,
  -- İşlemi yapan kullanıcı hesabı — sunucuda doğrulanmış (çok-kullanıcılı tenant ayrımı).
  user_id         uuid        NOT NULL,

  -- Kanonik modül anahtarı (lib/auth/moduleAccess.ts ModuleGateKey ile birebir).
  module_key      text        NOT NULL,
  -- Sabit sözlük (lib/usage/usageEvents.ts USAGE_EVENT_TYPES ile birebir).
  event_type      text        NOT NULL,

  -- İşlem anı — SUNUCU belirler (istemci saatine güvenilmez).
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Retry/eşzamanlılık dedup anahtarı (create/update için kaynak id'den türetilir).
  idempotency_key text,

  CONSTRAINT expert_usage_module_chk CHECK (module_key IN (
    'clients','appointments','numerology','stones','stok','sifa_rehberi',
    'energy_body','reflexology','aromatherapy','personal_archive','video_ceviri',
    'belge_ceviri','ders_notu','human_design','digital_content','cosmic_calendar',
    'cupping','beslenme'
  )),
  CONSTRAINT expert_usage_event_type_chk CHECK (event_type IN (
    'analysis_created','record_created','record_updated','protocol_created',
    'report_generated','guide_created','translation_completed'
  )),
  CONSTRAINT expert_usage_idem_len_chk CHECK (idempotency_key IS NULL OR char_length(idempotency_key) <= 200)
);

COMMENT ON TABLE public.expert_usage_events IS
  'FAZ 1 İP-2C — uzman anlamlı-işlem olayları. Append-only, yalnız service_role. PII/secret/serbest-metin YASAK (metadata-only).';

-- Idempotency: aynı anahtar iki kez yazılamaz (retry/eşzamanlılık çift-sayım engeli).
CREATE UNIQUE INDEX IF NOT EXISTS uq_expert_usage_idempotency
  ON public.expert_usage_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Sorgu index'leri (workspace + zaman; modül kırılımı; global zaman-sıralı/retention).
CREATE INDEX IF NOT EXISTS idx_expert_usage_tenant_occurred
  ON public.expert_usage_events (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_expert_usage_tenant_module_occurred
  ON public.expert_usage_events (tenant_id, module_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_expert_usage_user_occurred
  ON public.expert_usage_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_expert_usage_occurred
  ON public.expert_usage_events (occurred_at DESC);

-- Append-only: UPDATE/DELETE engeli (retention gerekirse yalnız DB sahibi trigger'ı
-- bilinçli devre dışı bırakarak budayabilir — denetlenebilir istisna).
CREATE OR REPLACE FUNCTION public.expert_usage_events_prevent_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'expert_usage_events append-only: % engellendi', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS trg_expert_usage_no_update ON public.expert_usage_events;
CREATE TRIGGER trg_expert_usage_no_update
  BEFORE UPDATE ON public.expert_usage_events
  FOR EACH ROW EXECUTE FUNCTION public.expert_usage_events_prevent_mutation();

DROP TRIGGER IF EXISTS trg_expert_usage_no_delete ON public.expert_usage_events;
CREATE TRIGGER trg_expert_usage_no_delete
  BEFORE DELETE ON public.expert_usage_events
  FOR EACH ROW EXECUTE FUNCTION public.expert_usage_events_prevent_mutation();

-- RLS + grant (default-deny; service_role yalnız SELECT+INSERT → UPDATE/DELETE yok).
REVOKE ALL ON TABLE public.expert_usage_events FROM anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.expert_usage_events TO service_role;

ALTER TABLE public.expert_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_expert_usage_events" ON public.expert_usage_events;
CREATE POLICY "service_role_expert_usage_events"
  ON public.expert_usage_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;

-- =============================================================================
-- RETENTION (PLAN — bu migration otomatik iş KURMAZ):
--   Öneri: occurred_at > 24 ay olan satırlar, DB sahibi tarafından bilinçli olarak
--   (append-only trigger'ı geçici devre dışı bırakıp) budanır ya da aylık özet tabloya
--   toplanır. idx_expert_usage_occurred bu aralık taramasını karşılar. Otomatik cron/
--   pg_cron KURULMAZ (repo'da böyle bir mekanizma yok — greenfield).
--
-- DOĞRULAMA:
--   SELECT relrowsecurity FROM pg_class WHERE relname='expert_usage_events';           -- true
--   SELECT has_table_privilege('service_role','public.expert_usage_events','INSERT');   -- true
--   SELECT has_table_privilege('service_role','public.expert_usage_events','DELETE');   -- false
--   SELECT has_table_privilege('anon','public.expert_usage_events','SELECT');           -- false
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_expert_usage_no_update ON public.expert_usage_events;
--   DROP TRIGGER IF EXISTS trg_expert_usage_no_delete ON public.expert_usage_events;
--   DROP FUNCTION IF EXISTS public.expert_usage_events_prevent_mutation();
--   DROP TABLE IF EXISTS public.expert_usage_events;
-- =============================================================================
