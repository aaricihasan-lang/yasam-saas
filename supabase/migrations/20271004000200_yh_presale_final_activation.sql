-- =============================================================================
-- YAŞAM HAFIZASI™ — SATIŞ ÖNCESİ HEDEF MESLEKİ KAYNAK AKTİVASYONU (M3)
-- =============================================================================
--
-- AMAÇ: "Migration uygulandı ama aktivasyon unutuldu → Hafıza sessizce çalışmadı" sınıfını
--   kapatmak. Hedef mesleki kaynakların aktivasyonu manuel SQL yerine sürüm kontrollü dosyada.
--
-- SIRA (ZORUNLU): M1 (20271004000000) → KOD DEPLOY → M2 (20271004000100) → BU DOSYA.
--   Kod deploy'undan ÖNCE uygulanırsa eski worker 'beslenme:*' anahtarlarını tanımaz (dead-letter).
--
-- KAPSAM (ürün kararı): Doğaltaş, Refleksoloji, Biyoenerji, Şifa Rehberi, Aromaterapi,
--   Kupa & Hacamat, Beslenme, Kişisel Arşiv. KAPSAM DIŞI (dokunulmaz): Numeroloji, Human Design,
--   Kozmik Ajanda, YEBS, refleksoloji:notes (PII), danışan kaynakları (ayrı sistem).
--   dogaltas:stones KEEP_LIVE'dır (aktivasyon satırı gerektirmez).
--
-- DAVRANIŞ: is_active=true, backfill_allowed=false. Zaten aktif olan kaynağa DOKUNMAZ (aktivasyon
--   zamanı korunur). Historical kayıtlar bu dosyayla İNDEKSLENMEZ — kontrollü replay (admin route,
--   outbox üzerinden) ayrı adımdır. Kaynak verisine ve index'e YAZMAZ.
-- IDEMPOTENT: tekrar çalıştırma no-op.
-- =============================================================================

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.yh_source_activation_set(text,boolean,boolean,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'M3 BLOCKER: yh_source_activation_set yok (20260927000000)';
  END IF;
  IF to_regprocedure('public.yh_outbox_replay_enqueue(text,uuid,text,integer,uuid)') IS NULL THEN
    RAISE EXCEPTION 'M3 BLOCKER: M1 (20271004000000) uygulanmamis';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'yh_cdc_nutrition_foods_trg' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'M3 BLOCKER: M2 (20271004000100) Beslenme trigger''lari yok';
  END IF;
END
$pre$;

DO $act$
DECLARE
  v_key  text;
  v_keys text[] := ARRAY[
    -- Doğaltaş (stones KEEP_LIVE → listede yok)
    'dogaltas:minerals', 'dogaltas:knowledge', 'dogaltas:combinations',
    -- Refleksoloji
    'refleksoloji:protocols',
    -- Şifa Rehberi
    'sifa_rehberi:guides', 'sifa_rehberi:guide-sections',
    -- Biyoenerji
    'biyoenerji:subconscious-causes', 'biyoenerji:symbols', 'biyoenerji:chakras',
    'biyoenerji:imaginations', 'biyoenerji:sessions', 'biyoenerji:energy-bodies',
    'biyoenerji:chakra-blocks',
    -- Aromaterapi
    'aromaterapi:oils', 'aromaterapi:reference-sheets', 'aromaterapi:reference-rows',
    'aromaterapi:blends', 'aromaterapi:plant-taxa', 'aromaterapi:preparations', 'aromaterapi:method',
    -- Kupa & Hacamat
    'kupa_hacamat:knowledge', 'kupa_hacamat:points', 'kupa_hacamat:topics',
    'kupa_hacamat:techniques', 'kupa_hacamat:safety-notes',
    -- Kişisel Arşiv (satır kapısı — sınıflandırılmamış kayıt yine indexlenmez)
    'kisisel_arsiv:archives',
    -- Beslenme (3 aggregate)
    'beslenme:foods', 'beslenme:topics', 'beslenme:templates'
  ];
BEGIN
  FOREACH v_key IN ARRAY v_keys LOOP
    IF NOT EXISTS (SELECT 1 FROM public.yh_source_activation WHERE source_key = v_key AND is_active = true) THEN
      PERFORM public.yh_source_activation_set(
        v_key, true, false,
        CASE WHEN v_key = 'kisisel_arsiv:archives' THEN 'ROW_GATED_CONTROLLED' ELSE 'FUTURE_ONLY_READY' END,
        'professional', 'presale-final-2026-10');
    END IF;
  END LOOP;
END
$act$;

COMMIT;

-- =============================================================================
-- DOĞRULAMA (uygulama sonrası, SALT-OKUNUR):
--   SELECT source_key, is_active, backfill_allowed FROM public.yh_source_activation
--   WHERE scope = 'professional' ORDER BY 1;   -- yukarıdaki 29 anahtar is_active=t, backfill=f
-- =============================================================================
