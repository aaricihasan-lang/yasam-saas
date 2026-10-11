-- ASTROLOJİ 9B-P2-01 — 000700 sonrası: YALNIZ Bilgi Bankası biçimli kb_snapshot boşaldı; diğer HER kolon, notlar,
-- Roxy yorumu ve sinastri karşı taraf snapshot'ı birebir aynı; tanınmayan biçimler dokunulmadı (iki kez uygulanmış).
DO $$
DECLARE
  rec record;
  n int;
BEGIN
  SELECT count(*) INTO n FROM test9b.before;
  IF n < 6 THEN RAISE EXCEPTION '9B seed eksik: % satır', n; END IF;

  FOR rec IN
    SELECT b.title, b.other_fp AS fp0, b.kb AS kb0, b.notes_fp AS nfp0,
           md5((to_jsonb(a) - 'kb_snapshot')::text) AS fp1, a.kb_snapshot AS kb1,
           coalesce((SELECT md5(string_agg(x.section_key || '|' || x.body, '#' ORDER BY x.section_key, x.body)) FROM public.astro_analysis_notes x WHERE x.analysis_id = a.id), '-') AS nfp1
      FROM test9b.before b JOIN public.astro_analyses a ON a.title = b.title
  LOOP
    IF rec.fp0 <> rec.fp1 THEN RAISE EXCEPTION '9B: % — kb_snapshot DIŞINDA bir kolon değişti', rec.title; END IF;
    IF rec.nfp0 <> rec.nfp1 THEN RAISE EXCEPTION '9B: % — danışana özel notlar değişti', rec.title; END IF;
    IF rec.title IN ('K1 natal kb', 'K2 sinastri kb') THEN
      IF rec.kb1 <> '[]'::jsonb THEN RAISE EXCEPTION '9B: % — KB kopyası boşaltılmadı', rec.title; END IF;
    ELSE
      IF rec.kb1 <> rec.kb0 THEN RAISE EXCEPTION '9B: % — tanınmayan / boş biçim DEĞİŞTİRİLDİ', rec.title; END IF;
    END IF;
  END LOOP;

  -- Roxy yorumu ve sinastri karşı tarafı açıkça
  IF (SELECT provider_interp_snapshot->'content'->>'summary' FROM public.astro_analyses WHERE title = 'K1 natal kb') <> 'Roxy natal yorumu' THEN
    RAISE EXCEPTION '9B: Roxy yorumu değişti';
  END IF;
  IF (SELECT profile_snapshot->'partner'->>'label' FROM public.astro_analyses WHERE title = 'K2 sinastri kb') <> 'Eski B' THEN
    RAISE EXCEPTION '9B: sinastri karşı taraf snapshot''ı değişti';
  END IF;
  IF (SELECT count(*) FROM public.astro_analysis_notes) < 3 THEN RAISE EXCEPTION '9B: not kaybı'; END IF;
  -- Uygulama rolü hâlâ analizi GÜNCELLEYEMEZ (değişmezlik korunur; temizlik yalnız migration ile).
  BEGIN
    SET LOCAL ROLE service_role;
    UPDATE public.astro_analyses SET kb_snapshot = '[]'::jsonb WHERE title = 'K3 bilinmeyen bicim';
    RAISE EXCEPTION '9B: service_role analiz güncelleyebildi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
END $$;
