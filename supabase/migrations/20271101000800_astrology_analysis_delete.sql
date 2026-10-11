-- =============================================================================
-- 20271101000800_astrology_analysis_delete.sql   [1 FONKSİYON; VERİ SİLMEZ, ŞEMA DEĞİŞTİRMEZ]
--
-- ASTROLOJİ — ANALİZ ARŞİVİ "A — YALNIZCA ANALİZLERİ SİL".
--
-- AMAÇ: Seçilen danışanların (doğum profillerinin) KENDİ kayıtlı astroloji analizlerini kalıcı silmek; doğum
--   profili, revizyonları, Danışan Yolculuğu bağlantısı (client_id), uzman çalışma notları ve sağlayıcı önbelleği
--   KORUNUR. Profil analizsiz kalır (Analiz Arşivi listesinden düşer) ama Yeni Analiz'de kullanılmaya devam eder.
--
-- KAPSAM:
--   • Silinen: astro_analyses WHERE tenant + uzman + profile_id ∈ seçim (ve ON DELETE CASCADE ile o analizlerin
--     astro_analysis_notes kopyaları).
--   • Korunan: karşı tarafı seçilen profil olan ama SAHİBİ seçilmemiş başka profil olan ortak analizler
--     (sinastri / composite) — bu fonksiyon onlara hiç dokunmaz (canlı bağ dahil; profil silinmediği için bağ geçerli).
--   • Başka uzman / tenant: kilit ve silme deyimi tenant + owner_user_id ile sınırlı; eşleşmeyen tek kimlik → hiçbir
--     şey silinmez.
--
-- GÜVENCE (astro_profile_delete ile aynı protokol):
--   • tablo DELETE yetkisi service_role'e VERİLMEZ; yalnız bu SECURITY DEFINER fonksiyon (sabit search_path,
--     yalnız service_role çalıştırır);
--   • 1..100 profil; tekrar eden kimlik → geçersiz;
--   • profiller FOR UPDATE kilitlenir (analiz kaydı profil FK'si üzerinden FOR KEY SHARE alır → eşzamanlı kayıt bekler);
--   • onaylanan durum (p_expected: güncel revizyon, updated_at, kendi analiz sayısı, korunacak ortak analiz sayısı)
--     KİLİT ALTINDA astro_profile_delete_preview ile yeniden hesaplanır; en küçük fark → hiçbir şey silinmez (40001);
--   • silinen satır sayısı kilit altında sayılanla birebir aynı olmalı; değilse tüm işlem geri alınır;
--   • tek deyim / tek işlem: kısmi başarı YOK.
--
-- PRECONDITION: 20271101000000…000500 (astro_profile_delete_preview).   VERİ-YIKICI MI: HAYIR (yalnız fonksiyon).
-- İDEMPOTENT: EVET (CREATE OR REPLACE + yetki).
-- GERİ ALMA: DROP FUNCTION public.astro_profile_analyses_delete(uuid, uuid, jsonb);  (başka nesne değişmez)
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.astro_profile_delete_preview(uuid, uuid, uuid[])') IS NULL THEN
    RAISE EXCEPTION 'ASTRO A-DELETE: önce 20271101000500 uygulanmalı';
  END IF;
END
$pre$;

-- p_expected: [{"id": uuid, "current_revision": int, "updated_ms": bigint, "own": int, "shared": int}, ...]
CREATE OR REPLACE FUNCTION public.astro_profile_analyses_delete(p_tenant_id uuid, p_owner_user_id uuid, p_expected jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ids uuid[];
  v_locked integer;
  v_mismatch integer;
  v_own bigint;
  v_deleted integer;
BEGIN
  IF p_tenant_id IS NULL OR p_owner_user_id IS NULL OR p_expected IS NULL OR jsonb_typeof(p_expected) <> 'array' THEN
    RAISE EXCEPTION 'ASTRO_DELETE_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT (e->>'id')::uuid) INTO v_ids FROM jsonb_array_elements(p_expected) e;
  IF v_ids IS NULL OR cardinality(v_ids) = 0 OR cardinality(v_ids) > 100
     OR cardinality(v_ids) <> jsonb_array_length(p_expected) THEN
    RAISE EXCEPTION 'ASTRO_DELETE_INVALID' USING ERRCODE = '22023';
  END IF;

  -- Kilit: yalnız bu uzmanın, bu tenant'taki profilleri. Eksik / yabancı / silinmiş → hiçbir şey silinmez.
  SELECT count(*) INTO v_locked FROM (
    SELECT p.id FROM public.astro_birth_profiles p
     WHERE p.tenant_id = p_tenant_id AND p.owner_user_id = p_owner_user_id AND p.id = ANY (v_ids)
     FOR UPDATE
  ) l;
  IF v_locked <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'ASTRO_DELETE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Onaylanan durum KİLİT ALTINDA hâlâ geçerli mi?
  SELECT count(*) INTO v_mismatch
    FROM jsonb_array_elements(p_expected) e
    JOIN public.astro_profile_delete_preview(p_tenant_id, p_owner_user_id, v_ids) pv ON pv.id = (e->>'id')::uuid
   WHERE pv.current_revision IS DISTINCT FROM (e->>'current_revision')::integer
      OR pv.updated_ms IS DISTINCT FROM (e->>'updated_ms')::bigint
      OR pv.own_analysis_count IS DISTINCT FROM (e->>'own')::bigint
      OR pv.shared_preserved_count IS DISTINCT FROM (e->>'shared')::bigint;
  IF v_mismatch > 0 THEN
    RAISE EXCEPTION 'ASTRO_DELETE_STALE' USING ERRCODE = '40001';
  END IF;

  SELECT count(*) INTO v_own FROM public.astro_analyses a
   WHERE a.tenant_id = p_tenant_id AND a.owner_user_id = p_owner_user_id AND a.profile_id = ANY (v_ids);

  -- Yalnız seçilen profillerin KENDİ analizleri (notları CASCADE). Profil / revizyon / not / önbellek DEĞİŞMEZ.
  DELETE FROM public.astro_analyses a
   WHERE a.tenant_id = p_tenant_id AND a.owner_user_id = p_owner_user_id AND a.profile_id = ANY (v_ids);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> v_own THEN
    RAISE EXCEPTION 'ASTRO_DELETE_STALE' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object('deleted_profiles', 0, 'kept_profiles', cardinality(v_ids), 'deleted_analyses', v_deleted, 'preserved_shared_analyses',
    (SELECT coalesce(sum((e->>'shared')::bigint), 0) FROM jsonb_array_elements(p_expected) e));
END
$fn$;

REVOKE ALL ON FUNCTION public.astro_profile_analyses_delete(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.astro_profile_analyses_delete(uuid, uuid, jsonb) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
