-- ============================================================
-- 20260912000000_aromatherapy_catalog_method_foundation.sql
--
-- Aromaterapi Bilgi Sistemi V2 — FAZ C / C3D-B1 (Katalog + Üretim/Elde Ediliş şema temeli)
--
-- KAPSAM (tek transaction, fail-fast; IF NOT EXISTS / CREATE OR REPLACE / sessiz DO YOK):
--   1. plant_taxa.primary_common_name_tr opsiyonel kolonu (+ blank/uzunluk guard).
--   2. source_passages'a (tenant_id, source_id, id) candidate key (method passage-source
--      composite FK'sini mümkün kılmak için; id PK olduğundan duplicate yapısal imkansız).
--   3. aromatherapy_preparation_method_series (immutable identity; append-only).
--   4. aromatherapy_preparation_method_revisions (revision içerikleri immutable; yalnız
--      status/updated_at değişebilir; seri başına tek verified revision).
--   5. steps JSONB güçlü doğrulaması (IMMUTABLE helper + CHECK).
--
-- BAĞLAYICI SINIRLAR:
--   * preparation_category EKLENMEZ (tür preparations.preparation_type'ta tutulur).
--   * taxon description/note + preparation name/description EKLENMEZ (görünen ad türetilir).
--   * plant_taxa/preparations service_role ALL privilege'ları DARALTILMAZ (write-gate C3D-B2).
--   * content_audit_events / claim tabloları / oils / C2S/C2T DEĞİŞTİRİLMEZ.
--   * Writer RPC / API / UI / seed / DML / DELETE YOK.
--   * Yeni method tabloları: RLS ENABLE (policy yok) + service_role SELECT-only; write
--     yalnız gelecekteki SECURITY DEFINER RPC ile (C3D-B2).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Takson opsiyonel Türkçe/yaygın ad. NULL geçerli; boş metin geçersiz; <=200.
--    tenant-içi unique DEĞİL (aynı yaygın ad farklı taksonlarda olabilir). Backfill YOK.
-- ------------------------------------------------------------
ALTER TABLE public.aromatherapy_plant_taxa
  ADD COLUMN primary_common_name_tr text;

ALTER TABLE public.aromatherapy_plant_taxa
  ADD CONSTRAINT aromatherapy_plant_taxa_common_name_tr_chk CHECK (
    primary_common_name_tr IS NULL
    OR (btrim(primary_common_name_tr) <> '' AND char_length(btrim(primary_common_name_tr)) <= 200)
  );

-- ------------------------------------------------------------
-- 2) source_passages candidate key: (tenant_id, source_id, id).
--    id PRIMARY KEY olduğundan bu kombinasyon zaten benzersizdir → mevcut veri güvenli.
--    Yalnız method passage-source composite FK'sinin hedefi olarak eklenir.
-- ------------------------------------------------------------
ALTER TABLE public.aromatherapy_source_passages
  ADD CONSTRAINT aromatherapy_source_passages_tenant_source_id_unique UNIQUE (tenant_id, source_id, id);

-- ------------------------------------------------------------
-- 3) steps JSONB doğrulama helper'ı (IMMUTABLE; SECURITY DEFINER DEĞİL).
--    NULL veya [] geçerli. Aksi halde: jsonb array; her eleman object; EXACT anahtarlar
--    {order, text}; order pozitif tam sayı ve dizi içinde tekrarsız; text non-blank <=2000;
--    toplam JSON <=8000; bilinmeyen anahtar reddedilir. Yalnız CONSTRAINT amacıyla kullanılır.
-- ------------------------------------------------------------
CREATE FUNCTION public.aromatherapy_method_steps_valid(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT
    p IS NULL
    OR (
      jsonb_typeof(p) = 'array'
      AND char_length(p::text) <= 8000
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p) AS elem
        WHERE jsonb_typeof(elem) <> 'object'
           OR EXISTS (
                SELECT 1 FROM jsonb_object_keys(elem) k
                WHERE k <> ALL (ARRAY['order', 'text'])
              )
           OR NOT (elem ? 'order')
           OR NOT (elem ? 'text')
           OR jsonb_typeof(elem -> 'order') <> 'number'
           OR (elem ->> 'order') !~ '^[1-9][0-9]*$'
           OR jsonb_typeof(elem -> 'text') <> 'string'
           OR btrim(elem ->> 'text') = ''
           OR char_length(elem ->> 'text') > 2000
      )
      AND (
        SELECT count(*) = count(DISTINCT (elem ->> 'order'))
        FROM jsonb_array_elements(p) AS elem
      )
    );
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_method_steps_valid(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_method_steps_valid(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_method_steps_valid(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.aromatherapy_method_steps_valid(jsonb) TO service_role;

-- ------------------------------------------------------------
-- 4) Immutability trigger fonksiyonları.
--    (a) series: HER UPDATE reddedilir (editorial series desenine uygun; append-only identity).
--    (b) revision: DELETE koşulsuz reddedilir; UPDATE'te yalnız status/updated_at değişebilir.
--    SECURITY DEFINER + sabit search_path; hiçbir runtime rolüne EXECUTE verilmez.
-- ------------------------------------------------------------
CREATE FUNCTION public.aromatherapy_method_series_no_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'AROMA_METHOD_SERIES_IMMUTABLE' USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_method_series_no_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_method_series_no_update() FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_method_series_no_update() FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_method_series_no_update() FROM service_role;

CREATE FUNCTION public.aromatherapy_method_revision_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'AROMA_METHOD_REVISION_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  -- UPDATE: yalnız status ve updated_at değişebilir; diğer tüm içerik/kimlik değişmezdir.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.series_id IS DISTINCT FROM OLD.series_id
     OR NEW.revision IS DISTINCT FROM OLD.revision
     OR NEW.plant_part_used IS DISTINCT FROM OLD.plant_part_used
     OR NEW.material_state IS DISTINCT FROM OLD.material_state
     OR NEW.method_text IS DISTINCT FROM OLD.method_text
     OR NEW.equipment IS DISTINCT FROM OLD.equipment
     OR NEW.amount_ratio IS DISTINCT FROM OLD.amount_ratio
     OR NEW.solvent_carrier IS DISTINCT FROM OLD.solvent_carrier
     OR NEW.duration_text IS DISTINCT FROM OLD.duration_text
     OR NEW.temperature_text IS DISTINCT FROM OLD.temperature_text
     OR NEW.steps IS DISTINCT FROM OLD.steps
     OR NEW.filtration IS DISTINCT FROM OLD.filtration
     OR NEW.resting IS DISTINCT FROM OLD.resting
     OR NEW.storage IS DISTINCT FROM OLD.storage
     OR NEW.quality_notes IS DISTINCT FROM OLD.quality_notes
     OR NEW.safety_notes IS DISTINCT FROM OLD.safety_notes
     OR NEW.note_hash IS DISTINCT FROM OLD.note_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'AROMA_METHOD_REVISION_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.aromatherapy_method_revision_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aromatherapy_method_revision_guard() FROM anon;
REVOKE ALL ON FUNCTION public.aromatherapy_method_revision_guard() FROM authenticated;
REVOKE ALL ON FUNCTION public.aromatherapy_method_revision_guard() FROM service_role;

-- ------------------------------------------------------------
-- 5) Method series — immutable identity; provenans coupling; kompozit FK'ler.
-- ------------------------------------------------------------
CREATE TABLE public.aromatherapy_preparation_method_series (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL,
  preparation_id  uuid        NOT NULL,
  method_kind     text        NOT NULL,
  source_id       uuid,
  passage_id      uuid,
  method_lang     text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aromatherapy_preparation_method_series_pkey PRIMARY KEY (id),

  CONSTRAINT aromatherapy_prep_method_series_kind_chk CHECK (
    method_kind IN ('faithful_source', 'editorial', 'expert')
  ),
  -- faithful_source → source zorunlu (provenans).
  CONSTRAINT aromatherapy_prep_method_series_faithful_chk CHECK (
    method_kind <> 'faithful_source' OR source_id IS NOT NULL
  ),
  -- passage verilirse source zorunlu (source/passage uyumu FK ile ayrıca garanti).
  CONSTRAINT aromatherapy_prep_method_series_passage_chk CHECK (
    passage_id IS NULL OR source_id IS NOT NULL
  ),
  CONSTRAINT aromatherapy_prep_method_series_lang_chk CHECK (
    btrim(method_lang) <> '' AND method_lang ~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'
  ),

  CONSTRAINT aromatherapy_prep_method_series_tenant_id_unique UNIQUE (tenant_id, id),

  CONSTRAINT aromatherapy_prep_method_series_prep_fk
    FOREIGN KEY (tenant_id, preparation_id)
    REFERENCES public.aromatherapy_preparations (tenant_id, id)
    ON DELETE RESTRICT,

  CONSTRAINT aromatherapy_prep_method_series_source_fk
    FOREIGN KEY (tenant_id, source_id)
    REFERENCES public.aromatherapy_sources (tenant_id, id)
    ON DELETE RESTRICT,

  -- Passage'ın seçilen source'a ait olduğu DB düzeyinde garanti (MATCH SIMPLE:
  -- passage_id NULL iken doğrulanmaz). Hedef: source_passages(tenant_id, source_id, id).
  CONSTRAINT aromatherapy_prep_method_series_passage_source_fk
    FOREIGN KEY (tenant_id, source_id, passage_id)
    REFERENCES public.aromatherapy_source_passages (tenant_id, source_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX aromatherapy_prep_method_series_list_idx
  ON public.aromatherapy_preparation_method_series (tenant_id, preparation_id, method_kind, created_at);

CREATE TRIGGER trg_aromatherapy_prep_method_series_no_update
  BEFORE UPDATE ON public.aromatherapy_preparation_method_series
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_method_series_no_update();

ALTER TABLE public.aromatherapy_preparation_method_series ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_preparation_method_series FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_preparation_method_series FROM service_role;
GRANT SELECT ON TABLE public.aromatherapy_preparation_method_series TO service_role;

-- ------------------------------------------------------------
-- 6) Method revisions — içerik immutable (yalnız status/updated_at); seri başına tek verified.
-- ------------------------------------------------------------
CREATE TABLE public.aromatherapy_preparation_method_revisions (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL,
  series_id         uuid        NOT NULL,
  revision          integer     NOT NULL DEFAULT 1,
  plant_part_used   text,
  material_state    text,
  method_text       text        NOT NULL,
  equipment         text,
  amount_ratio      text,
  solvent_carrier   text,
  duration_text     text,
  temperature_text  text,
  steps             jsonb,
  filtration        text,
  resting           text,
  storage           text,
  quality_notes     text,
  safety_notes      text,
  note_hash         text        NOT NULL,
  status            text        NOT NULL DEFAULT 'draft',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT aromatherapy_preparation_method_revisions_pkey PRIMARY KEY (id),

  CONSTRAINT aromatherapy_prep_method_rev_revision_chk CHECK (revision > 0),
  CONSTRAINT aromatherapy_prep_method_rev_material_chk CHECK (
    material_state IS NULL OR material_state IN ('fresh', 'dried', 'other')
  ),
  CONSTRAINT aromatherapy_prep_method_rev_method_text_chk CHECK (
    btrim(method_text) <> '' AND char_length(method_text) <= 8000
  ),
  CONSTRAINT aromatherapy_prep_method_rev_plant_part_chk CHECK (
    plant_part_used IS NULL OR (btrim(plant_part_used) <> '' AND char_length(plant_part_used) <= 500)
  ),
  CONSTRAINT aromatherapy_prep_method_rev_equipment_chk CHECK (
    equipment IS NULL OR (btrim(equipment) <> '' AND char_length(equipment) <= 2000)
  ),
  CONSTRAINT aromatherapy_prep_method_rev_amount_chk CHECK (
    amount_ratio IS NULL OR (btrim(amount_ratio) <> '' AND char_length(amount_ratio) <= 1000)
  ),
  CONSTRAINT aromatherapy_prep_method_rev_solvent_chk CHECK (
    solvent_carrier IS NULL OR (btrim(solvent_carrier) <> '' AND char_length(solvent_carrier) <= 1000)
  ),
  CONSTRAINT aromatherapy_prep_method_rev_duration_chk CHECK (
    duration_text IS NULL OR (btrim(duration_text) <> '' AND char_length(duration_text) <= 1000)
  ),
  CONSTRAINT aromatherapy_prep_method_rev_temperature_chk CHECK (
    temperature_text IS NULL OR (btrim(temperature_text) <> '' AND char_length(temperature_text) <= 1000)
  ),
  CONSTRAINT aromatherapy_prep_method_rev_filtration_chk CHECK (
    filtration IS NULL OR (btrim(filtration) <> '' AND char_length(filtration) <= 2000)
  ),
  CONSTRAINT aromatherapy_prep_method_rev_resting_chk CHECK (
    resting IS NULL OR (btrim(resting) <> '' AND char_length(resting) <= 2000)
  ),
  CONSTRAINT aromatherapy_prep_method_rev_storage_chk CHECK (
    storage IS NULL OR (btrim(storage) <> '' AND char_length(storage) <= 2000)
  ),
  CONSTRAINT aromatherapy_prep_method_rev_quality_chk CHECK (
    quality_notes IS NULL OR (btrim(quality_notes) <> '' AND char_length(quality_notes) <= 4000)
  ),
  CONSTRAINT aromatherapy_prep_method_rev_safety_chk CHECK (
    safety_notes IS NULL OR (btrim(safety_notes) <> '' AND char_length(safety_notes) <= 4000)
  ),
  CONSTRAINT aromatherapy_prep_method_rev_steps_chk CHECK (
    public.aromatherapy_method_steps_valid(steps)
  ),
  CONSTRAINT aromatherapy_prep_method_rev_hash_chk CHECK (
    note_hash ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT aromatherapy_prep_method_rev_status_chk CHECK (
    status IN ('draft', 'verified', 'archived')
  ),

  CONSTRAINT aromatherapy_prep_method_rev_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT aromatherapy_prep_method_rev_natural_key UNIQUE (tenant_id, series_id, revision),

  CONSTRAINT aromatherapy_prep_method_rev_series_fk
    FOREIGN KEY (tenant_id, series_id)
    REFERENCES public.aromatherapy_preparation_method_series (tenant_id, id)
    ON DELETE RESTRICT
);

-- Seri başına EN FAZLA bir verified revision.
CREATE UNIQUE INDEX aromatherapy_prep_method_rev_verified_uidx
  ON public.aromatherapy_preparation_method_revisions (tenant_id, series_id)
  WHERE status = 'verified';

CREATE TRIGGER trg_aromatherapy_prep_method_rev_guard
  BEFORE UPDATE OR DELETE ON public.aromatherapy_preparation_method_revisions
  FOR EACH ROW
  EXECUTE FUNCTION public.aromatherapy_method_revision_guard();

CREATE TRIGGER trg_aromatherapy_prep_method_rev_updated_at
  BEFORE UPDATE ON public.aromatherapy_preparation_method_revisions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.aromatherapy_preparation_method_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_preparation_method_revisions FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.aromatherapy_preparation_method_revisions FROM service_role;
GRANT SELECT ON TABLE public.aromatherapy_preparation_method_revisions TO service_role;

COMMIT;
