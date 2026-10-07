-- =============================================================================
-- 20271101000200_astrology_timing_relationship.sql   [ADDITIVE — kolon + kısıt + 1 fonksiyon]
--
-- ASTROLOJİ — AŞAMA 3: transit/forecast/progression/solar arc/return + synastry/composite desteği.
-- SATIŞ SONRASI, OWNER-ONLY PİLOT. Aşama 1/2 kayıtlarının ANLAMI DEĞİŞMEZ (yalnız nullable/default'lu
-- kolon ekleri; mevcut satırlar: partner NULL, technique_params '{}', result_ids '{}', context_key '').
--
--   astro_provider_results  + partner_profile_id / partner_profile_revision (synastry/composite)
--                             KVKK: KARŞI TARAF profili/danışanı silinirse onun doğum verisini içeren
--                             sonuç da CASCADE silinir (ham yanıt iki kişinin verisini taşır).
--   astro_analyses          + partner_profile_id / partner_profile_revision (aynı KVKK cascade),
--                           + technique_params (normalize seçenekler: hedef tarih/yıl/ay, karşı taraf…),
--                           + result_ids (çok parçalı teknikler — forecast — için parça sonuçları; bilgi amaçlı)
--   astro_expert_notes      + context_key (synastry/composite: karşı taraf profil kimliği; diğerleri '')
--                           tekillik (tenant, uzman, profil, teknik, BAĞLAM, bölüm) olarak genişletilir
--   astro_analysis_save_v2  → v1 ile aynı atomik/idempotent sözleşme + yeni alanlar (v1 KORUNUR).
--
-- PRECONDITION: 20271101000000 + 20271101000100.
-- VERİ-YIKICI MI: HAYIR. İDEMPOTENT: EVET.
-- ⚠️ PRODUCTION'A UYGULANMADI (work/astrology-roxy).
--
-- ROLLBACK (Aşama 3 verisi gider; Aşama 1/2 satırları korunur):
--   DROP FUNCTION IF EXISTS public.astro_analysis_save_v2(uuid, uuid, uuid, integer, uuid, integer, uuid[], text, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, jsonb, jsonb, jsonb);
--   ALTER TABLE public.astro_expert_notes DROP CONSTRAINT IF EXISTS astro_en_unique_ctx; (+ eski astro_en_unique'i geri ekle)
--   ALTER TABLE ... DROP COLUMN IF EXISTS partner_profile_id, partner_profile_revision, technique_params, result_ids, context_key;
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.astro_analyses') IS NULL OR to_regclass('public.astro_expert_notes') IS NULL THEN
    RAISE EXCEPTION 'astrology aşama 3: 20271101000100 önce uygulanmalı (precondition)';
  END IF;
END
$$;

-- ─── 1) astro_provider_results: karşı taraf ─────────────────────────────────
ALTER TABLE public.astro_provider_results ADD COLUMN IF NOT EXISTS partner_profile_id uuid;
ALTER TABLE public.astro_provider_results ADD COLUMN IF NOT EXISTS partner_profile_revision integer;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_pr_partner_pair_chk') THEN
    ALTER TABLE public.astro_provider_results ADD CONSTRAINT astro_pr_partner_pair_chk
      CHECK ((partner_profile_id IS NULL) = (partner_profile_revision IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_pr_partner_fk') THEN
    ALTER TABLE public.astro_provider_results ADD CONSTRAINT astro_pr_partner_fk
      FOREIGN KEY (tenant_id, partner_profile_id, partner_profile_revision)
      REFERENCES public.astro_birth_profile_revisions (tenant_id, profile_id, revision) ON DELETE CASCADE;
  END IF;
END
$$;

-- ─── 2) astro_analyses: karşı taraf + teknik parametreleri + parça sonuçları ─
ALTER TABLE public.astro_analyses ADD COLUMN IF NOT EXISTS partner_profile_id uuid;
ALTER TABLE public.astro_analyses ADD COLUMN IF NOT EXISTS partner_profile_revision integer;
ALTER TABLE public.astro_analyses ADD COLUMN IF NOT EXISTS technique_params jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.astro_analyses ADD COLUMN IF NOT EXISTS result_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_an_partner_pair_chk') THEN
    ALTER TABLE public.astro_analyses ADD CONSTRAINT astro_an_partner_pair_chk
      CHECK ((partner_profile_id IS NULL) = (partner_profile_revision IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_an_partner_fk') THEN
    ALTER TABLE public.astro_analyses ADD CONSTRAINT astro_an_partner_fk
      FOREIGN KEY (tenant_id, partner_profile_id, partner_profile_revision)
      REFERENCES public.astro_birth_profile_revisions (tenant_id, profile_id, revision) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_an_params_chk') THEN
    ALTER TABLE public.astro_analyses ADD CONSTRAINT astro_an_params_chk
      CHECK (jsonb_typeof(technique_params) = 'object' AND pg_column_size(technique_params) <= 16384 AND cardinality(result_ids) <= 10);
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS astro_an_partner_idx ON public.astro_analyses (tenant_id, partner_profile_id) WHERE partner_profile_id IS NOT NULL;

-- ─── 3) astro_expert_notes: bağlam anahtarı ─────────────────────────────────
ALTER TABLE public.astro_expert_notes ADD COLUMN IF NOT EXISTS context_key text NOT NULL DEFAULT '';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_en_context_chk') THEN
    ALTER TABLE public.astro_expert_notes ADD CONSTRAINT astro_en_context_chk
      CHECK (context_key = '' OR context_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_en_unique_ctx') THEN
    ALTER TABLE public.astro_expert_notes ADD CONSTRAINT astro_en_unique_ctx
      UNIQUE (tenant_id, owner_user_id, profile_id, technique, context_key, section_key);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'astro_en_unique') THEN
    ALTER TABLE public.astro_expert_notes DROP CONSTRAINT astro_en_unique;
  END IF;
END
$$;

-- ─── 4) Atomik kaydetme v2 (v1 korunur) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.astro_analysis_save_v2(
  p_tenant_id uuid,
  p_user_id uuid,
  p_profile_id uuid,
  p_profile_revision integer,
  p_partner_profile_id uuid,
  p_partner_profile_revision integer,
  p_result_ids uuid[],
  p_technique text,
  p_title text,
  p_save_request_id uuid,
  p_technique_params jsonb,
  p_profile_snapshot jsonb,
  p_method_snapshot jsonb,
  p_technical_snapshot jsonb,
  p_kb_snapshot jsonb,
  p_provider_interp_included boolean,
  p_provider_interp_snapshot jsonb,
  p_versions_snapshot jsonb,
  p_notes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
  v_client uuid;
  v_existing uuid;
  n jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'ASTRO_TENANT_REQUIRED' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_existing FROM public.astro_analyses
   WHERE tenant_id = p_tenant_id AND save_request_id = p_save_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('analysis_id', v_existing, 'reused', true);
  END IF;
  SELECT client_id INTO v_client FROM public.astro_birth_profiles
   WHERE tenant_id = p_tenant_id AND id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ASTRO_PROFILE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.astro_analyses (
    tenant_id, owner_user_id, profile_id, profile_revision, partner_profile_id, partner_profile_revision,
    client_id, result_id, result_ids, technique, title, save_request_id, technique_params,
    profile_snapshot, method_snapshot, technical_snapshot, provider_interp_included, provider_interp_snapshot,
    kb_snapshot, versions_snapshot
  ) VALUES (
    p_tenant_id, p_user_id, p_profile_id, p_profile_revision, p_partner_profile_id, p_partner_profile_revision,
    v_client, CASE WHEN cardinality(COALESCE(p_result_ids, '{}')) = 1 THEN p_result_ids[1] ELSE NULL END,
    COALESCE(p_result_ids, '{}'), p_technique, btrim(p_title), p_save_request_id, COALESCE(p_technique_params, '{}'::jsonb),
    p_profile_snapshot, p_method_snapshot, p_technical_snapshot, p_provider_interp_included,
    CASE WHEN p_provider_interp_included THEN p_provider_interp_snapshot ELSE NULL END,
    COALESCE(p_kb_snapshot, '[]'::jsonb), p_versions_snapshot
  ) RETURNING id INTO v_id;

  IF p_notes IS NOT NULL AND jsonb_typeof(p_notes) = 'array' THEN
    FOR n IN SELECT * FROM jsonb_array_elements(p_notes) LOOP
      INSERT INTO public.astro_analysis_notes (tenant_id, analysis_id, section_key, body)
      VALUES (p_tenant_id, v_id, n->>'section_key', n->>'body');
    END LOOP;
  END IF;
  RETURN jsonb_build_object('analysis_id', v_id, 'reused', false);
END
$fn$;

REVOKE ALL ON FUNCTION public.astro_analysis_save_v2(uuid, uuid, uuid, integer, uuid, integer, uuid[], text, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.astro_analysis_save_v2(uuid, uuid, uuid, integer, uuid, integer, uuid[], text, text, uuid, jsonb, jsonb, jsonb, jsonb, jsonb, boolean, jsonb, jsonb, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
