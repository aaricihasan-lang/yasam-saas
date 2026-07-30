-- ============================================================
-- 20260830000000_aromatherapy_content_audit_foundation.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C3D-A (Ortak write/audit/tombstone temeli)
--
-- KAPSAM (tek transaction, fail-fast; IF NOT EXISTS / CREATE OR REPLACE / sessiz DO YOK):
--   A. public.aromatherapy_content_audit_events  — claim DIŞI kanonik entity'ler için
--      ortak, append-only, FK'siz create/update/delete işlem kaydı.
--   B. public.aromatherapy_content_delete_tombstones — hard delete için minimal,
--      immutable, FK'siz silme kanıtı (audit'ten AYRI tablo).
--   C. Her iki tabloda: entity_type / operation / deletion_mode allowlist CHECK,
--      reason kuralları (create opsiyonel; update/delete zorunlu), lowercase SHA-256
--      hash biçimi, JSON object/array kontrolleri, veri-minimizasyonu boyut sınırı.
--   D. Append-only immutable trigger (UPDATE/DELETE koşulsuz P0001).
--   E. RLS ENABLE (FORCE değil, policy yok) + service_role YALNIZ SELECT;
--      anon/authenticated/PUBLIC hiçbir privilege almaz.
--
-- BAĞLAYICI SINIRLAR (C3D-A):
--   * public.aromatherapy_claim_audit_events'e DOKUNULMAZ (claim audit ayrı ve değişmez).
--   * Mevcut entity tablolarının (plant_taxa/preparations/sources/... /glossary_terms)
--     privilege'ları DEĞİŞTİRİLMEZ — writer RPC'leri henüz yok; write yolu kırılmaz.
--   * Generic public audit/tombstone INSERT RPC OLUŞTURULMAZ; INSERT ileride
--     entity-specific SECURITY DEFINER RPC owner'ından yapılacaktır.
--   * Full özgün metin / çeviri / editoryal içerik / üretim yöntemi metni audit veya
--     tombstone'a KOPYALANMAZ; yalnız bounded özet + hash tutulur (geri yükleme kopyası DEĞİL).
--   * FK yok → entity silinse de audit/tombstone yaşar (retention).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- A) Ortak content audit — append-only, FK yok.
--    entity_type: onaylı ileriki C3D kapsamıyla sınırlı bounded allowlist (claim HARİÇ).
-- ------------------------------------------------------------
CREATE TABLE public.aromatherapy_content_audit_events (
  id                     uuid        NOT NULL DEFAULT gen_random_uuid(),
  occurred_at            timestamptz NOT NULL DEFAULT now(),
  tenant_id              uuid        NOT NULL,
  entity_type            text        NOT NULL,
  entity_id              uuid        NOT NULL,
  actor_user_id          uuid        NOT NULL,
  actor_label_snapshot   text        NOT NULL,
  operation              text        NOT NULL,
  reason                 text,
  previous_summary       jsonb,
  new_summary            jsonb,
  previous_content_hash  text,
  new_content_hash       text,
  warnings               jsonb        NOT NULL DEFAULT '[]'::jsonb,
  -- İleriye uyumlu: toplu/purge işlemlerini ilişkilendirmek için (nullable).
  correlation_id         uuid,

  CONSTRAINT aromatherapy_content_audit_events_pkey PRIMARY KEY (id),

  CONSTRAINT aromatherapy_content_audit_events_entity_type_chk CHECK (
    entity_type IN (
      'plant_taxon',
      'preparation',
      'preparation_method',
      'source',
      'source_passage',
      'passage_translation',
      'editorial_note',
      'glossary_term'
    )
  ),
  CONSTRAINT aromatherapy_content_audit_events_operation_chk CHECK (
    operation IN ('create', 'update', 'delete')
  ),
  CONSTRAINT aromatherapy_content_audit_events_actor_label_chk CHECK (
    btrim(actor_label_snapshot) <> ''
    AND char_length(actor_label_snapshot) <= 320
  ),
  -- reason: create'te opsiyonel; update/delete'te trim sonrası zorunlu, <= 2000.
  CONSTRAINT aromatherapy_content_audit_events_reason_chk CHECK (
    reason IS NULL
    OR (
      btrim(reason) <> ''
      AND char_length(reason) <= 2000
    )
  ),
  -- Durum eşleşmesi: create → prev NULL; update → prev NOT NULL + reason NOT NULL;
  --                  delete → prev NOT NULL + reason NOT NULL (yeni durum yok).
  CONSTRAINT aromatherapy_content_audit_events_operation_state_chk CHECK (
    (operation = 'create' AND previous_summary IS NULL)
    OR (operation = 'update' AND previous_summary IS NOT NULL AND reason IS NOT NULL)
    OR (operation = 'delete' AND previous_summary IS NOT NULL AND reason IS NOT NULL)
  ),
  CONSTRAINT aromatherapy_content_audit_events_prev_summary_object_chk CHECK (
    previous_summary IS NULL OR jsonb_typeof(previous_summary) = 'object'
  ),
  CONSTRAINT aromatherapy_content_audit_events_new_summary_object_chk CHECK (
    new_summary IS NULL OR jsonb_typeof(new_summary) = 'object'
  ),
  -- Veri minimizasyonu: özetler bounded; full uzun metin dökümü yapısal olarak engellenir.
  CONSTRAINT aromatherapy_content_audit_events_prev_summary_size_chk CHECK (
    previous_summary IS NULL OR char_length(previous_summary::text) <= 8000
  ),
  CONSTRAINT aromatherapy_content_audit_events_new_summary_size_chk CHECK (
    new_summary IS NULL OR char_length(new_summary::text) <= 8000
  ),
  CONSTRAINT aromatherapy_content_audit_events_prev_hash_chk CHECK (
    previous_content_hash IS NULL OR previous_content_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT aromatherapy_content_audit_events_new_hash_chk CHECK (
    new_content_hash IS NULL OR new_content_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT aromatherapy_content_audit_events_warnings_array_chk CHECK (
    jsonb_typeof(warnings) = 'array'
  )
);

CREATE INDEX aromatherapy_content_audit_events_tenant_entity_occurred_idx
  ON public.aromatherapy_content_audit_events (tenant_id, entity_type, entity_id, occurred_at);

-- ------------------------------------------------------------
-- B) Delete tombstone — audit'ten AYRI, minimal ve immutable.
-- ------------------------------------------------------------
CREATE TABLE public.aromatherapy_content_delete_tombstones (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  occurred_at           timestamptz NOT NULL DEFAULT now(),
  tenant_id             uuid        NOT NULL,
  entity_type           text        NOT NULL,
  entity_id             uuid        NOT NULL,
  actor_user_id         uuid        NOT NULL,
  actor_label_snapshot  text        NOT NULL,
  reason                text        NOT NULL,
  deletion_mode         text        NOT NULL,
  identity_summary      jsonb,
  content_hash          text,
  correlation_id        uuid,

  CONSTRAINT aromatherapy_content_delete_tombstones_pkey PRIMARY KEY (id),

  CONSTRAINT aromatherapy_content_delete_tombstones_entity_type_chk CHECK (
    entity_type IN (
      'plant_taxon',
      'preparation',
      'preparation_method',
      'source',
      'source_passage',
      'passage_translation',
      'editorial_note',
      'glossary_term'
    )
  ),
  CONSTRAINT aromatherapy_content_delete_tombstones_mode_chk CHECK (
    deletion_mode IN ('single', 'bulk', 'purge')
  ),
  CONSTRAINT aromatherapy_content_delete_tombstones_actor_label_chk CHECK (
    btrim(actor_label_snapshot) <> ''
    AND char_length(actor_label_snapshot) <= 320
  ),
  CONSTRAINT aromatherapy_content_delete_tombstones_reason_chk CHECK (
    btrim(reason) <> ''
    AND char_length(reason) <= 2000
  ),
  CONSTRAINT aromatherapy_content_delete_tombstones_identity_object_chk CHECK (
    identity_summary IS NULL OR jsonb_typeof(identity_summary) = 'object'
  ),
  -- Veri minimizasyonu: yalnız bounded kimlik özeti (geri yükleme kopyası DEĞİL).
  CONSTRAINT aromatherapy_content_delete_tombstones_identity_size_chk CHECK (
    identity_summary IS NULL OR char_length(identity_summary::text) <= 4000
  ),
  CONSTRAINT aromatherapy_content_delete_tombstones_hash_chk CHECK (
    content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'
  )
);

CREATE INDEX aromatherapy_content_delete_tombstones_tenant_entity_occurred_idx
  ON public.aromatherapy_content_delete_tombstones (tenant_id, entity_type, entity_id, occurred_at);

CREATE INDEX aromatherapy_content_delete_tombstones_correlation_idx
  ON public.aromatherapy_content_delete_tombstones (tenant_id, correlation_id)
  WHERE correlation_id IS NOT NULL;

-- ------------------------------------------------------------
-- C) Append-only immutable trigger — her iki tabloda UPDATE/DELETE koşulsuz reddedilir.
--    Tek paylaşılan tetik fonksiyonu; SECURITY DEFINER + sabit search_path; hiçbir
--    runtime rolüne EXECUTE verilmez.
-- ------------------------------------------------------------
CREATE FUNCTION public.aromatherapy_content_audit_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'AROMA_CONTENT_AUDIT_IMMUTABLE' USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_content_audit_forbid_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_content_audit_forbid_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_content_audit_forbid_mutation() FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_content_audit_forbid_mutation() FROM service_role;

CREATE TRIGGER trg_aromatherapy_content_audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.aromatherapy_content_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_content_audit_forbid_mutation();

CREATE TRIGGER trg_aromatherapy_content_delete_tombstones_immutable
  BEFORE UPDATE OR DELETE ON public.aromatherapy_content_delete_tombstones
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_content_audit_forbid_mutation();

-- ------------------------------------------------------------
-- D) RLS + privileges. RLS ENABLE (FORCE değil, policy yok).
--    service_role YALNIZ SELECT; INSERT ileride SECURITY DEFINER RPC owner'ından.
--    anon/authenticated/PUBLIC hiçbir privilege almaz.
-- ------------------------------------------------------------
ALTER TABLE public.aromatherapy_content_audit_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aromatherapy_content_delete_tombstones ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_content_audit_events      FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_content_audit_events      FROM service_role;
GRANT SELECT ON TABLE public.aromatherapy_content_audit_events               TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_content_delete_tombstones FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_content_delete_tombstones FROM service_role;
GRANT SELECT ON TABLE public.aromatherapy_content_delete_tombstones          TO service_role;

COMMIT;
