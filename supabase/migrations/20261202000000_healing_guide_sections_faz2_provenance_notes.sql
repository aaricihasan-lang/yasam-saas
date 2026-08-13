-- =============================================================================
-- 20261202000000_healing_guide_sections_faz2_provenance_notes.sql
--
-- Şifa Rehberi FAZ 2 — section-native profesyonel bilgi katmanı temeli.
--
-- BU MIGRATION YALNIZ ADDITIVE'DİR:
--   1) healing_guide_sections'a 4 NULLABLE kolon: source_kind, expert_note,
--      attention, sort_order  (ana içerik/uzman notu/dikkat/kaynak türü + kalıcı sıra)
--   2) transactional replace RPC: replace_healing_guide_sections(...) — tek fonksiyon
--      gövdesinde (implicit transaction) delete-old + insert-new; herhangi bir hata
--      → tamamı rollback (yarım delete / yarım insert / duplicate residue YOK).
--
-- ⛔ YAPILMAYANLAR (bilinçli):
--   - Mevcut 62 section YENİDEN TİPLENMEZ (herbal, herbal kalır).
--   - Hiçbir satırda data/source/category REWRITE veya BACKFILL yok.
--   - Yeni section_type ENUM açılmaz (canonical 6 tip zaten yeterli).
--   - Hard karakter limiti eklenmez (ürün kararı: ana içerik limitsiz).
--
-- IDEMPOTENT / DEFENSIVE: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
--
-- ⚠️ APPLY POLİTİKASI: Bu bir DOSYA'dır. FAZ 2 / BÖLÜM 2 kapsamında PRODUCTION'A
--    UYGULANMADI. Apply ayrı onay kapısıdır (DDL yalnız Dashboard/onaylı).
-- =============================================================================

BEGIN;

-- 1) Additive kolonlar (hepsi NULL; mevcut satırlara dokunulmaz).
ALTER TABLE public.healing_guide_sections
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS expert_note text,
  ADD COLUMN IF NOT EXISTS attention   text,
  ADD COLUMN IF NOT EXISTS sort_order  integer;

-- 2) Transactional, tenant-bağlı atomic replace.
--    Fonksiyon gövdesi tek transaction'dır → hata halinde delete+insert birlikte geri alınır.
CREATE OR REPLACE FUNCTION public.replace_healing_guide_sections(
  p_guide_id  uuid,
  p_tenant_id uuid,
  p_sections  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
-- search_path BOŞ: public path'e alınmaz → search-path shadowing imkânsız (PUBLIC/anon/
-- authenticated'ın public'e CREATE yetkisi olsa bile). Tüm relation'lar public.<tbl> olarak
-- schema-qualified; built-in fonksiyonlar pg_catalog'dan (her zaman implicit) çözülür.
SET search_path = ''
AS $$
DECLARE
  v_owned    boolean;
  v_deleted  integer := 0;
  v_inserted integer := 0;
  v_allowed  text[] := ARRAY['reasons','applications','herbal','stones_details','islamic_suggestions','supportive'];
BEGIN
  IF p_guide_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  -- Parent guide caller'ın (sunucu/session-türetilmiş) tenant'ına ait olmalı.
  -- Caller'dan gelen tenant_id'ye körü körüne güvenilmez; guide<->tenant binding zorunlu.
  SELECT EXISTS(
    SELECT 1 FROM public.healing_guides
    WHERE id = p_guide_id AND tenant_id = p_tenant_id
  ) INTO v_owned;
  IF NOT v_owned THEN
    RAISE EXCEPTION 'guide_not_found_for_tenant';
  END IF;

  IF p_sections IS NULL OR jsonb_typeof(p_sections) <> 'array' THEN
    RAISE EXCEPTION 'sections_must_be_array';
  END IF;

  -- Mutasyondan ÖNCE tüm elemanların section_type'ını doğrula (fail → hiç dokunma).
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_sections) e
    WHERE NOT ((e->>'section_type') = ANY(v_allowed))
  ) THEN
    RAISE EXCEPTION 'invalid_section_type';
  END IF;

  DELETE FROM public.healing_guide_sections WHERE guide_id = p_guide_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO public.healing_guide_sections
    (guide_id, section_type, mode, title, note, source, source_kind, expert_note, attention, images, sort_order)
  SELECT
    p_guide_id,
    e->>'section_type',
    NULLIF(e->>'mode', ''),
    NULLIF(e->>'title', ''),
    NULLIF(e->>'note', ''),
    NULLIF(e->>'source', ''),
    NULLIF(e->>'source_kind', ''),
    NULLIF(e->>'expert_note', ''),
    NULLIF(e->>'attention', ''),
    COALESCE(e->'images', '[]'::jsonb),
    (ord - 1)::integer
  FROM jsonb_array_elements(p_sections) WITH ORDINALITY AS t(e, ord);
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object('deleted', v_deleted, 'inserted', v_inserted);
END;
$$;

-- Least-privilege: yalnız service_role (sunucu API) çağırabilir; anon/authenticated/public EXECUTE YOK.
REVOKE ALL ON FUNCTION public.replace_healing_guide_sections(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_healing_guide_sections(uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.replace_healing_guide_sections(uuid, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_healing_guide_sections(uuid, uuid, jsonb) TO service_role;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (apply sonrası, salt-okuma — beklenen):
--   \d public.healing_guide_sections  → source_kind/expert_note/attention/sort_order NULLABLE
--   SELECT has_function_privilege('anon','public.replace_healing_guide_sections(uuid,uuid,jsonb)','EXECUTE');          -- false
--   SELECT has_function_privilege('authenticated','public.replace_healing_guide_sections(uuid,uuid,jsonb)','EXECUTE'); -- false
--   SELECT has_function_privilege('service_role','public.replace_healing_guide_sections(uuid,uuid,jsonb)','EXECUTE');  -- true
--   SELECT prosecdef, proconfig FROM pg_proc WHERE proname='replace_healing_guide_sections';                          -- t, {search_path=""}
--   SELECT has_schema_privilege('public','public','CREATE');        -- beklenen: false (public role public'e CREATE edemez)
--   SELECT has_schema_privilege('anon','public','CREATE');          -- beklenen: false
--   SELECT has_schema_privilege('authenticated','public','CREATE'); -- beklenen: false
--   (Not: search_path='' + schema-qualified relation'lar sayesinde güvenlik bu yetkilere BAĞLI DEĞİLDİR.)
--
-- ROLLBACK (acil):
--   DROP FUNCTION IF EXISTS public.replace_healing_guide_sections(uuid, uuid, jsonb);
--   ALTER TABLE public.healing_guide_sections
--     DROP COLUMN IF EXISTS source_kind, DROP COLUMN IF EXISTS expert_note,
--     DROP COLUMN IF EXISTS attention,  DROP COLUMN IF EXISTS sort_order;
-- =============================================================================
