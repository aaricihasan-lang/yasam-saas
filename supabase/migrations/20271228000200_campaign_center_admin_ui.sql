-- =============================================================================
-- 20271228000200_campaign_center_admin_ui.sql
--
-- KAMPANYA MERKEZİ — KM-2 Owner paneli için idempotent oluşturma + atomik kopyalama (Owner talimatı 2026-11-01; yalnız
-- YEREL geçici veritabanında çalıştırıldı — production / staging'e uygulanması AYRI Owner onayı ister).
-- BAĞIMLILIK: 20271228000000 + 20271228000100 (KM-1, PR #672). KM-1'den ÖNCE uygulanamaz.
--
--   * campaigns.create_request_id : Owner panelinin "Yeni kampanya / Kopyala" isteğine verdiği tekil kimlik (uuid). Çift
--                                   gönderim / ağ tekrarı İKİNCİ kampanya oluşturmaz (kısmi tekil indeks).
--   * campaign_admin_create       : idempotent oluşturma (aynı istek kimliği → aynı kampanya, replay=true).
--   * campaign_admin_duplicate    : kampanya + teknik satırlarını TEK işlemde Kapalı taslak olarak kopyalar (yarım kopya yok).
--                                   Bitmiş tarihli kampanyanın kopyası tarihsiz olur ("önceki kampanyayı yeniden kullan").
--
-- GÜVENLİK: KM-1 deseni — SECURITY DEFINER, search_path sabit, p_actor DB'de yeniden doğrulanır (42501), yalnız service_role
-- çalıştırır. service_role'ün campaigns üzerindeki yetkisi DEĞİŞMEZ (yalnız SELECT); yeni kolon yalnız RPC ile yazılır.
-- VERİ KORUMA: Mevcut veri değişmez. IDEMPOTENT. DROP / TRUNCATE yok.
-- =============================================================================

BEGIN;

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS create_request_id uuid NULL;
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_create_request_uq ON public.campaigns (create_request_id) WHERE create_request_id IS NOT NULL;

-- ── İdempotent oluşturma ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campaign_admin_create(p_actor uuid, p_request_id uuid, p_fields jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  c public.campaigns;
  v_res jsonb;
BEGIN
  PERFORM public.campaign__require_owner(p_actor);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'CAMPAIGN_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  -- Aynı istek kimliğiyle eşzamanlı iki çağrı: işlem düzeyi danışma kilidi ile sıraya girer.
  PERFORM pg_advisory_xact_lock(hashtextextended('campaign_create:' || p_request_id::text, 0));
  SELECT * INTO c FROM public.campaigns WHERE create_request_id = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'id', c.id, 'version', c.version, 'replay', true);
  END IF;
  v_res := public.campaign_admin_save(p_actor, NULL, NULL, p_fields);
  UPDATE public.campaigns SET create_request_id = p_request_id WHERE id = (v_res->>'id')::uuid;
  RETURN v_res || jsonb_build_object('replay', false);
END;
$$;

-- ── Atomik kopyalama ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.campaign_admin_duplicate(p_actor uuid, p_request_id uuid, p_source_id uuid, p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  src public.campaigns;
  c public.campaigns;
  v_past boolean;
  v_id uuid;
BEGIN
  PERFORM public.campaign__require_owner(p_actor);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'CAMPAIGN_REQUEST_ID_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('campaign_create:' || p_request_id::text, 0));
  SELECT * INTO c FROM public.campaigns WHERE create_request_id = p_request_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'id', c.id, 'version', c.version, 'replay', true);
  END IF;
  SELECT * INTO src FROM public.campaigns WHERE id = p_source_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  v_past := NOT src.undated AND src.ends_at IS NOT NULL AND src.ends_at <= now();
  INSERT INTO public.campaigns (name, status, undated, starts_at, ends_at, slogan, alt_slogan, description, affirmation, cta_text,
    cta_target, image_ref, hd_options, module_comments, catalog_version, created_by, updated_by, create_request_id)
  VALUES (coalesce(nullif(btrim(p_name), ''), left(src.name || ' (kopya)', 80)), 'kapali',
    CASE WHEN v_past THEN true ELSE src.undated END,
    CASE WHEN v_past THEN NULL ELSE src.starts_at END,
    CASE WHEN v_past THEN NULL ELSE src.ends_at END,
    src.slogan, src.alt_slogan, src.description, src.affirmation, src.cta_text, src.cta_target, src.image_ref, src.hd_options,
    src.module_comments, src.catalog_version, p_actor, p_actor, p_request_id)
  RETURNING id INTO v_id;
  INSERT INTO public.campaign_techniques (campaign_id, technique_key, enabled, ip_daily_limit, daily_analysis_limit,
    daily_credit_budget, max_credit_per_analysis, comments_enabled, updated_at)
  SELECT v_id, technique_key, enabled, ip_daily_limit, daily_analysis_limit, daily_credit_budget, max_credit_per_analysis,
    comments_enabled, now()
    FROM public.campaign_techniques WHERE campaign_id = src.id;
  PERFORM public.campaign__audit(p_actor, 'campaign_duplicate', v_id, jsonb_build_object('source', src.id, 'past_to_undated', v_past));
  SELECT * INTO c FROM public.campaigns WHERE id = v_id;
  RETURN jsonb_build_object('ok', true, 'id', c.id, 'version', c.version, 'replay', false);
END;
$$;

REVOKE ALL ON FUNCTION public.campaign_admin_create(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campaign_admin_duplicate(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_admin_create(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.campaign_admin_duplicate(uuid, uuid, uuid, text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
