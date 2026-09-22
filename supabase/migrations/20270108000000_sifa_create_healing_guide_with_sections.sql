-- =============================================================================
-- 20270108000000_sifa_create_healing_guide_with_sections.sql
--
-- Şifa Rehberi FAZ 1 — ATOMİK + IDEMPOTENT yeni-kayıt (guide + sections tek transaction).
--
-- NEDEN:
--   Önceki create iki ayrı DB insert'iydi (guide → sections) + best-effort telafi-silme;
--   gerçek transaction DEĞİLDİ (telafi de düşerse yarım kayıt; ağ-retry'da mükerrer).
--   Bu RPC guide satırını + tüm section'ları TEK fonksiyon gövdesinde (implicit
--   transaction) yazar → herhangi bir hata TAMAMI rollback (yarım kayıt YOK).
--   request_id ile idempotency: aynı isteğin tekrarı ikinci kayıt oluşturmaz;
--   aynı anahtar FARKLI içerikle gelirse güvenli çakışma (mutasyon YOK) döner.
--   Bilinçli aynı-isimli farklı kayıtlar ENGELLENMEZ (name üzerinde unique yok;
--   idempotency yalnız request_id anahtarına bağlıdır).
--
-- BU MIGRATION YALNIZ ADDITIVE'DİR:
--   1) YENİ tablo: healing_guide_create_idempotency (mevcut tablolara dokunmaz).
--   2) YENİ fonksiyon: create_healing_guide_with_sections(...).
--   Mevcut healing_guides / healing_guide_sections şeması, verisi ve
--   replace_healing_guide_sections RPC'si DEĞİŞMEZ.
--
-- GÜVENLİK (replace_healing_guide_sections deseniyle birebir):
--   - SECURITY DEFINER + SET search_path='' (search-path shadowing imkânsız;
--     tüm relation'lar public.<tbl> schema-qualified; built-in'ler pg_catalog).
--   - tenant_id caller'dan (sunucu/session-türetilmiş) gelir; guide satırına ZORLA
--     p_tenant_id yazılır; p_guide içindeki tenant_id/id GÖRMEZDEN gelinir (kolon
--     allow-list: yalnız aşağıda AÇIKÇA listelenen kolonlar yazılır → enjeksiyon yok).
--   - section_type merkezi allow-list ile doğrulanır (mutasyondan ÖNCE).
--   - Least-privilege: yalnız service_role EXECUTE; anon/authenticated/public YOK.
--
-- ⚠️ APPLY POLİTİKASI: Bu bir DOSYA'dır. PRODUCTION'A UYGULANMADI. Apply ayrı onay
--    kapısıdır (DDL yalnız Dashboard/onaylı). Ön koşullar için dosya sonundaki nota bakın.
--
-- IDEMPOTENT / DEFENSIVE: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
-- =============================================================================

BEGIN;

-- 1) Idempotency defteri — create denemesi başına (tenant_id, request_id) tekildir.
--    guide_id FK → guide silinirse defter satırı da düşer (temiz).
CREATE TABLE IF NOT EXISTS public.healing_guide_create_idempotency (
  tenant_id    uuid        NOT NULL,
  request_id   uuid        NOT NULL,
  request_hash text        NOT NULL,
  guide_id     uuid        NOT NULL REFERENCES public.healing_guides (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, request_id)
);

-- Tarayıcı bu tabloya ASLA doğrudan erişmez (yalnız SECURITY DEFINER RPC, owner).
ALTER TABLE public.healing_guide_create_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.healing_guide_create_idempotency FROM PUBLIC;
REVOKE ALL ON TABLE public.healing_guide_create_idempotency FROM anon;
REVOKE ALL ON TABLE public.healing_guide_create_idempotency FROM authenticated;

-- 2) Atomik + idempotent create.
CREATE OR REPLACE FUNCTION public.create_healing_guide_with_sections(
  p_tenant_id  uuid,
  p_guide      jsonb,
  p_sections   jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name           text;
  v_guide_id       uuid;
  v_hash           text;
  v_existing_guide uuid;
  v_existing_hash  text;
  v_inserted       integer := 0;
  v_allowed        text[] := ARRAY['reasons','applications','herbal','stones_details','islamic_suggestions','supportive'];
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  -- name zorunlu (defense-in-depth; route da doğrular).
  v_name := NULLIF(btrim(COALESCE(p_guide->>'name','')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  IF p_sections IS NOT NULL AND jsonb_typeof(p_sections) <> 'array' THEN
    RAISE EXCEPTION 'sections_must_be_array';
  END IF;

  -- section_type allow-list (mutasyondan ÖNCE; fail → hiç dokunma).
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_sections, '[]'::jsonb)) e
    WHERE NOT ((e->>'section_type') = ANY(v_allowed))
  ) THEN
    RAISE EXCEPTION 'invalid_section_type';
  END IF;

  -- İçerik imzası: aynı (guide+sections) → aynı hash. jsonb::text kanonik (PG
  -- key sırasını normalize eder) → mantıksal eşitlik deterministik.
  v_hash := md5(COALESCE(p_guide::text, '') || '§' || COALESCE(p_sections::text, '[]'));

  -- Idempotency ön-kontrol (YAZMA YOK): tekrar → replay; farklı içerik → conflict.
  IF p_request_id IS NOT NULL THEN
    SELECT guide_id, request_hash
      INTO v_existing_guide, v_existing_hash
      FROM public.healing_guide_create_idempotency
      WHERE tenant_id = p_tenant_id AND request_id = p_request_id;
    IF FOUND THEN
      IF v_existing_hash IS DISTINCT FROM v_hash THEN
        RETURN jsonb_build_object('outcome','idempotency_key_conflict','ok',false);
      END IF;
      RETURN jsonb_build_object('outcome','created','ok',true,'guide_id',v_existing_guide,'idempotent_replay',true);
    END IF;
  END IF;

  v_guide_id := gen_random_uuid();

  -- Insert yolu — tek subtransaction. Eşzamanlı aynı request_id → idempotency
  -- PK unique_violation → guide+sections+defter BİRLİKTE rollback (yarım kayıt YOK).
  BEGIN
    -- Guide ÖNCE (idempotency FK'sı guide_id'yi referanslar). tenant_id ZORLA;
    -- kolon allow-list = yalnız aşağıdakiler (p_guide'daki tenant_id/id/fazla anahtar YOK SAYILIR).
    INSERT INTO public.healing_guides (
      id, tenant_id, name, category, symptoms,
      general_summary, medical_causes, subconscious_causes, temperament_causes, other_causes,
      iridology_match, hand_analysis_match, cupping_leech, reflexology, diet_recommendations,
      herbal_methods, stone_recommendations, aromatherapy, meditation, breathwork,
      bioenergy, massage, daily_routine, sleep_routine, supportive_alternative_methods,
      islamic_recommendations, images, related_stones, related_reflexology, updated_at
    ) VALUES (
      v_guide_id, p_tenant_id, v_name, NULLIF(p_guide->>'category',''), NULLIF(p_guide->>'symptoms',''),
      NULLIF(p_guide->>'general_summary',''), NULLIF(p_guide->>'medical_causes',''), NULLIF(p_guide->>'subconscious_causes',''), NULLIF(p_guide->>'temperament_causes',''), NULLIF(p_guide->>'other_causes',''),
      NULLIF(p_guide->>'iridology_match',''), NULLIF(p_guide->>'hand_analysis_match',''), NULLIF(p_guide->>'cupping_leech',''), NULLIF(p_guide->>'reflexology',''), NULLIF(p_guide->>'diet_recommendations',''),
      NULLIF(p_guide->>'herbal_methods',''), NULLIF(p_guide->>'stone_recommendations',''), NULLIF(p_guide->>'aromatherapy',''), NULLIF(p_guide->>'meditation',''), NULLIF(p_guide->>'breathwork',''),
      NULLIF(p_guide->>'bioenergy',''), NULLIF(p_guide->>'massage',''), NULLIF(p_guide->>'daily_routine',''), NULLIF(p_guide->>'sleep_routine',''), NULLIF(p_guide->>'supportive_alternative_methods',''),
      NULLIF(p_guide->>'islamic_recommendations',''),
      NULLIF(p_guide->'images','null'::jsonb), NULLIF(p_guide->'related_stones','null'::jsonb), NULLIF(p_guide->'related_reflexology','null'::jsonb),
      now()
    );

    -- Sections — replace_healing_guide_sections ile AYNI kayıpsız SQL sözleşmesi
    -- (source_kind/expert_note/attention dahil; sort_order ordinality'den deterministik).
    INSERT INTO public.healing_guide_sections
      (guide_id, section_type, mode, title, note, source, source_kind, expert_note, attention, images, sort_order)
    SELECT
      v_guide_id,
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
    FROM jsonb_array_elements(COALESCE(p_sections, '[]'::jsonb)) WITH ORDINALITY AS t(e, ord);
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    -- Idempotency defteri SON (unique gate). request_id yoksa idempotency uygulanmaz.
    IF p_request_id IS NOT NULL THEN
      INSERT INTO public.healing_guide_create_idempotency (tenant_id, request_id, request_hash, guide_id)
      VALUES (p_tenant_id, p_request_id, v_hash, v_guide_id);
    END IF;

  EXCEPTION WHEN unique_violation THEN
    -- Aynı request_id ile eşzamanlı kazanan var → guide+sections+defter rollback edildi.
    -- Kazananı yeniden oku: aynı içerik → replay; farklı içerik → conflict.
    IF p_request_id IS NULL THEN
      RAISE;
    END IF;
    SELECT guide_id, request_hash
      INTO v_existing_guide, v_existing_hash
      FROM public.healing_guide_create_idempotency
      WHERE tenant_id = p_tenant_id AND request_id = p_request_id;
    IF NOT FOUND THEN
      RAISE;
    END IF;
    IF v_existing_hash IS DISTINCT FROM v_hash THEN
      RETURN jsonb_build_object('outcome','idempotency_key_conflict','ok',false);
    END IF;
    RETURN jsonb_build_object('outcome','created','ok',true,'guide_id',v_existing_guide,'idempotent_replay',true);
  END;

  RETURN jsonb_build_object(
    'outcome','created','ok',true,'guide_id',v_guide_id,'idempotent_replay',false,'inserted',v_inserted
  );
END;
$$;

-- Least-privilege: yalnız service_role (sunucu API) çağırabilir.
REVOKE ALL ON FUNCTION public.create_healing_guide_with_sections(uuid, jsonb, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_healing_guide_with_sections(uuid, jsonb, jsonb, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_healing_guide_with_sections(uuid, jsonb, jsonb, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_healing_guide_with_sections(uuid, jsonb, jsonb, uuid) TO service_role;

COMMIT;

-- =============================================================================
-- APPLY ÖN KOŞULLARI (bu migration'dan ÖNCE prod'da mevcut OLMALI):
--   - public.healing_guides (tüm yazılan kolonlar: name, category, symptoms, 21 içerik
--     kolonu, images, related_stones, related_reflexology, updated_at, id PK).
--   - public.healing_guide_sections + FAZ 2 kolonları (source_kind, expert_note,
--     attention, sort_order) — 20261202000000_..._provenance_notes.sql APPLY EDİLMİŞ olmalı.
--     ⚠️ O migration dosyasında "prod'a uygulanmadı" notu var; APPLY'dan ÖNCE salt-okuma
--     doğrula (aşağıdaki kontrol). Bu 4 kolon yoksa bu RPC insert'i HATA verir.
--   - gen_random_uuid() (PG13+ core / pgcrypto) — Supabase'de mevcut.
--
-- DOĞRULAMA (apply öncesi salt-okuma; WRITE YOK):
--   SELECT column_name FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='healing_guide_sections'
--       AND column_name IN ('source_kind','expert_note','attention','sort_order');   -- 4 satır beklenir
-- DOĞRULAMA (apply sonrası salt-okuma):
--   SELECT has_function_privilege('anon','public.create_healing_guide_with_sections(uuid,jsonb,jsonb,uuid)','EXECUTE');          -- false
--   SELECT has_function_privilege('authenticated','public.create_healing_guide_with_sections(uuid,jsonb,jsonb,uuid)','EXECUTE'); -- false
--   SELECT has_function_privilege('service_role','public.create_healing_guide_with_sections(uuid,jsonb,jsonb,uuid)','EXECUTE');  -- true
--   SELECT prosecdef, proconfig FROM pg_proc WHERE proname='create_healing_guide_with_sections';                                -- t, {search_path=""}
--
-- ROLLBACK (acil):
--   DROP FUNCTION IF EXISTS public.create_healing_guide_with_sections(uuid, jsonb, jsonb, uuid);
--   DROP TABLE IF EXISTS public.healing_guide_create_idempotency;
-- =============================================================================
