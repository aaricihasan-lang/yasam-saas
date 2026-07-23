-- ============================================================
-- 20260803000000_yebs_audit_events.sql
--
-- Yaşam Enerjisi Bilgi Sistemi (YEBS) — FAZ API-AUD1
-- Tablo: public.yebs_audit_events (değiştirilemez / append-only admin işlem izi)
--
-- Amaç: Bütün YEBS yazma (mutation) işlemlerinin — create/update/verify/reject/
--   transition/publish/unpublish/archive ve reddedilen publish-kapısı/hard-delete
--   girişimlerinin — kim/ne zaman/ne/eski→yeni değer olarak değiştirilemez biçimde
--   kaydedilmesi. Bu tablo canonical D1–D9 tablolarından AYRIDIR; D1–D9'a hiçbir
--   actor kolonu (created_by/updated_by/...) EKLENMEZ.
--
-- Bağlayıcı mimari kararlar (API-AUD0):
--   - Append-only: service_role yalnız SELECT alır; INSERT/UPDATE/DELETE/TRUNCATE
--     hiçbir runtime rolüne verilmez. INSERT ileride yalnız SECURITY DEFINER
--     mutation RPC'lerinin sahibi (tablo owner) tarafından yapılır.
--   - Doğrudan UPDATE/DELETE ayrıca BEFORE trigger ile koşulsuz reddedilir.
--   - Doğuştan-kilitli: RLS ENABLE, policy YOK, anon/authenticated/PUBLIC/service_role
--     tam REVOKE + yalnız service_role SELECT GRANT.
--   - tenant_id YOK; updated_at / set_updated_at YOK (kayıt immutable);
--     actor_admin_id üzerinde FK YOK (audit, sonraki admin hesabı silme/değişikliğinden
--     etkilenmez — actor_label_snapshot ile attribution korunur); ip/user-agent YOK.
--   - Deterministik ve fail-fast: yalnız düz CREATE ifadeleri; IF NOT EXISTS yok,
--     CREATE OR REPLACE yok, DO bloğu yok, dynamic SQL yok. Drift varsa migration
--     hata verip durur. Explicit BEGIN/COMMIT.
--
-- Uzunluk sınırı kararı: text skaler alanlara makul üst sınır konur
--   (actor_label_snapshot ≤ 320 = e-posta+rol etiketi payı; reason ≤ 2000). JSONB
--   snapshot alanlarına (previous_state/new_state/metadata) BOYUT SINIRI KONMAZ —
--   gerçek YEBS satır içeriği (kaynak künyesi, çok dilli etiketler, pasaj) keyfi
--   düşük bir limitle kırılmamalıdır; yalnız "object" tipi zorlanır.
-- ============================================================

BEGIN;

CREATE TABLE public.yebs_audit_events (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at           timestamptz NOT NULL DEFAULT now(),
  actor_admin_id        uuid        NOT NULL,
  actor_label_snapshot  text        NOT NULL,
  action                text        NOT NULL,
  entity_type           text        NOT NULL,
  entity_id             uuid,
  outcome               text        NOT NULL,
  previous_state        jsonb,
  new_state             jsonb,
  changed_fields        text[]      NOT NULL DEFAULT ARRAY[]::text[],
  reason                text,
  request_id            uuid        NOT NULL,
  operation_id          uuid        NOT NULL,
  error_code            text,
  metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Eylem türü (kilitli küme). Action ve entity_type AYRI tutulur; birleşik sözlük yok.
  CONSTRAINT yebs_audit_events_action_chk CHECK (
    action IN (
      'create',
      'update',
      'remove',
      'verify',
      'reject',
      'transition',
      'publish',
      'unpublish',
      'archive',
      'hard_delete_attempt'
    )
  ),

  -- Varlık türü (kilitli küme; D1–D9 tabloları).
  CONSTRAINT yebs_audit_events_entity_type_chk CHECK (
    entity_type IN (
      'tradition',
      'school',
      'concept',
      'concept_label',
      'source',
      'claim',
      'claim_source',
      'concept_relation',
      'concept_relation_source'
    )
  ),

  -- Sonuç (kilitli küme): işlenmiş vs reddedilmiş.
  CONSTRAINT yebs_audit_events_outcome_chk CHECK (
    outcome IN ('committed', 'rejected')
  ),

  -- Actor etiketi (olay anındaki e-posta/rol snapshot'ı): boş olamaz + üst sınır.
  CONSTRAINT yebs_audit_events_actor_label_chk CHECK (
    btrim(actor_label_snapshot) <> '' AND length(actor_label_snapshot) <= 320
  ),

  -- previous_state: NULL veya JSON object (dizi/scalar reddedilir).
  CONSTRAINT yebs_audit_events_previous_state_obj_chk CHECK (
    previous_state IS NULL OR jsonb_typeof(previous_state) = 'object'
  ),

  -- new_state: NULL veya JSON object.
  CONSTRAINT yebs_audit_events_new_state_obj_chk CHECK (
    new_state IS NULL OR jsonb_typeof(new_state) = 'object'
  ),

  -- metadata: her zaman JSON object (NOT NULL + default '{}').
  CONSTRAINT yebs_audit_events_metadata_obj_chk CHECK (
    jsonb_typeof(metadata) = 'object'
  ),

  -- changed_fields: NULL eleman içeremez (cardinality karşılaştırması) ve boş string
  -- içeremez ('' <> ALL). NULL eleman varsa ilk koşul FALSE → satır reddedilir.
  CONSTRAINT yebs_audit_events_changed_fields_chk CHECK (
    cardinality(changed_fields) = cardinality(array_remove(changed_fields, NULL))
    AND '' <> ALL (changed_fields)
  ),

  -- outcome/error_code coupling: committed → error_code NULL; rejected → NOT NULL.
  CONSTRAINT yebs_audit_events_outcome_error_coupling_chk CHECK (
    (outcome = 'committed' AND error_code IS NULL)
    OR
    (outcome = 'rejected' AND error_code IS NOT NULL)
  ),

  -- error_code: yalnız stabil YEBS kod biçimi (ham DB mesajı olamaz).
  CONSTRAINT yebs_audit_events_error_code_format_chk CHECK (
    error_code IS NULL OR error_code ~ '^YEBS_[A-Z][A-Z0-9_]*$'
  ),

  -- committed olaylarda entity_id zorunlu; rejected create denemelerinde NULL olabilir.
  CONSTRAINT yebs_audit_events_committed_entity_chk CHECK (
    outcome <> 'committed' OR entity_id IS NOT NULL
  ),

  -- reason: doluysa boş/whitespace olamaz + üst sınır.
  CONSTRAINT yebs_audit_events_reason_chk CHECK (
    reason IS NULL OR (btrim(reason) <> '' AND length(reason) <= 2000)
  )
);

-- Varlık geçmişi: bir kaydın tüm olayları (en yeni önce).
CREATE INDEX yebs_audit_events_entity_idx
  ON public.yebs_audit_events (entity_type, entity_id, occurred_at DESC);

-- Actor geçmişi: bir admin'in tüm işlemleri (en yeni önce).
CREATE INDEX yebs_audit_events_actor_idx
  ON public.yebs_audit_events (actor_admin_id, occurred_at DESC);

-- Request takibi.
CREATE INDEX yebs_audit_events_request_idx
  ON public.yebs_audit_events (request_id);

-- Operation (çok-yazımlı işlem grubu) takibi.
CREATE INDEX yebs_audit_events_operation_idx
  ON public.yebs_audit_events (operation_id);

-- Güvenlik: doğuştan-kilitli + append-only.
-- RLS açık; izin-veren policy YOK. Tüm tablo ayrıcalıkları tam REVOKE; yalnız
-- service_role SELECT alır. service_role'e INSERT/UPDATE/DELETE/TRUNCATE VERİLMEZ —
-- INSERT ileride yalnız SECURITY DEFINER mutation RPC'lerinin owner'ı tarafından
-- yapılır (owner ayrıcalığı runtime GRANT'larından ayrıdır).
ALTER TABLE public.yebs_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.yebs_audit_events FROM PUBLIC;
REVOKE ALL ON TABLE public.yebs_audit_events FROM anon;
REVOKE ALL ON TABLE public.yebs_audit_events FROM authenticated;
REVOKE ALL ON TABLE public.yebs_audit_events FROM service_role;

GRANT SELECT ON TABLE public.yebs_audit_events TO service_role;

-- Değiştirilemezlik (immutability) trigger'ı: doğrudan UPDATE/DELETE koşulsuz
-- reddedilir. Owner INSERT'i (RPC yolu) ve service_role SELECT'i engellenmez.
-- Fonksiyon: sabit search_path, schema-qualified, dynamic SQL yok, hata mesajında
-- satır/veri içeriği YOK (yalnız sabit metin).
CREATE FUNCTION public.yebs_audit_events_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'yebs_audit_events append-only: UPDATE/DELETE reddedildi.'
    USING ERRCODE = 'restrict_violation';
  RETURN NULL;
END;
$$;

-- Trigger fonksiyonu doğrudan çağrılamamalı: EXECUTE tüm rollerden REVOKE.
-- (Trigger tetiklenmesi bu REVOKE'tan etkilenmez.)
REVOKE ALL ON FUNCTION public.yebs_audit_events_forbid_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.yebs_audit_events_forbid_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.yebs_audit_events_forbid_mutation() FROM authenticated;
REVOKE ALL ON FUNCTION public.yebs_audit_events_forbid_mutation() FROM service_role;

CREATE TRIGGER trg_yebs_audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.yebs_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.yebs_audit_events_forbid_mutation();

COMMIT;
