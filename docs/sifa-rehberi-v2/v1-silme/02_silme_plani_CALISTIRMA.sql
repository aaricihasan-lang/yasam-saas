-- =============================================================================
-- Şifa Rehberi V1 — SİLME PLANI (ŞABLON) · ⚠️ ONAYSIZ ÇALIŞTIRMA YOK
--   Ön koşullar (README.md): (1) Owner'ın envantere dayalı AYRI uygulama onayı, (2) silme öncesi yedek
--   (V1 tabloları data-only pg_dump + 'stone-photos/healing-guides/' nesnelerinin indirilmesi, SHA-256 listesi),
--   (3) aşağıdaki BEKLENEN sayıların 01_envanter çıktısından doldurulması.
--   Kapsam: YALNIZ healing_guides (+ CASCADE: healing_guide_sections, healing_guide_create_idempotency).
--   DOKUNULMAZ: users / tenants / user_sessions / danışanlar / diğer modüller / admin_library_transfer_batches
--   (denetim kaydı) / yasam_hafizasi_report_snapshots (bağımsız YH kaydı) / 'stone-photos' kovasının diğer önekleri.
--   YH: healing_* üzerindeki CDC tetikleyicileri DELETE'te 'delete' olayı üretir → worker deindex eder
--   (sifa_rehberi:guides / :guide-sections kaynakları aktifse). 03. adımda kalıntı kontrol edilir.
-- =============================================================================
BEGIN;

DO $$
DECLARE
  -- ↓↓↓ 01_envanter çıktısından DOLDURULACAK (tenant listesi + sayılar). Boş bırakılırsa işlem DURUR. ↓↓↓
  v_tenants        uuid[] := ARRAY[]::uuid[];
  v_exp_guides     int    := -1;
  v_exp_sections   int    := -1;
  -- ↑↑↑
  v_guides int; v_sections int; v_other int; v_left int;
BEGIN
  IF cardinality(v_tenants) = 0 OR v_exp_guides < 0 OR v_exp_sections < 0 THEN
    RAISE EXCEPTION 'DUR: tenant listesi / beklenen sayılar doldurulmadı';
  END IF;
  SELECT count(*) INTO v_guides FROM public.healing_guides WHERE tenant_id = ANY (v_tenants);
  SELECT count(*) INTO v_sections FROM public.healing_guide_sections s JOIN public.healing_guides g ON g.id = s.guide_id
   WHERE g.tenant_id = ANY (v_tenants);
  SELECT count(*) INTO v_other FROM public.healing_guides WHERE NOT (tenant_id = ANY (v_tenants));
  IF v_guides <> v_exp_guides OR v_sections <> v_exp_sections THEN
    RAISE EXCEPTION 'DUR: sayılar envanterden farklı (rehber % / beklenen %, bölüm % / beklenen %) — envanter yenilenmeli',
      v_guides, v_exp_guides, v_sections, v_exp_sections;
  END IF;
  IF v_other <> 0 THEN
    RAISE EXCEPTION 'DUR: listede olmayan % tenant kaydı var — kapsam Owner ile yeniden onaylanmalı', v_other;
  END IF;

  DELETE FROM public.healing_guides WHERE tenant_id = ANY (v_tenants);   -- CASCADE: bölümler + idempotency
  GET DIAGNOSTICS v_left = ROW_COUNT;
  IF v_left <> v_exp_guides THEN
    RAISE EXCEPTION 'DUR: silinen satır (%) beklenenden farklı → GERİ ALINDI', v_left;
  END IF;
  IF EXISTS (SELECT 1 FROM public.healing_guide_sections s WHERE NOT EXISTS (SELECT 1 FROM public.healing_guides g WHERE g.id = s.guide_id)) THEN
    RAISE EXCEPTION 'DUR: yetim bölüm kaldı → GERİ ALINDI';
  END IF;
  RAISE NOTICE 'Silinen V1 rehber: %, bölüm (CASCADE): %', v_left, v_exp_sections;
END
$$;

-- Buraya kadar hata yoksa sonuç ekranda doğrulanır; ardından ELLE:  COMMIT;   (şüphede: ROLLBACK;)
-- COMMIT;

-- ── 03 · SİLME SONRASI KONTROL (salt-okunur; COMMIT'ten sonra) ────────────────
-- SELECT count(*) FROM public.healing_guides;                 -- 0 (kapsamdaki tenant'lar için)
-- SELECT count(*) FROM public.healing_guide_sections;         -- 0
-- SELECT source_table, count(*) FROM public.yasam_hafizasi_index
--  WHERE source_table IN ('healing_guides','healing_guide_sections') GROUP BY 1;   -- worker sonrası 0
-- Kalıntı kalırsa (kaynak pasifse CDC olay üretmez): YALNIZ şu hedefli temizlik, ayrı onayla:
--   DELETE FROM public.yasam_hafizasi_index WHERE source_table IN ('healing_guides','healing_guide_sections')
--     AND tenant_id = ANY (<aynı tenant listesi>);
--
-- ── 04 · STORAGE (SQL ile SİLİNMEZ: Supabase storage.protect_delete) ──────────
-- 'stone-photos' kovasında YALNIZ 'healing-guides/<tenant>/' önekli nesneler, Storage API (service_role) ile,
-- önce listelenip SHA-256'larıyla indirildikten (yedek) sonra silinir. Diğer önekler (Danışan Taşları) DOKUNULMAZ.
--
-- ── GERİ DÖNÜŞ ───────────────────────────────────────────────────────────────
-- COMMIT öncesi: ROLLBACK. COMMIT sonrası: silme öncesi alınan data-only dökümden 3 tablo geri yüklenir
-- (healing_guides → healing_guide_sections → healing_guide_create_idempotency; YH tetikleyicileri upsert olayı
-- üretir → yeniden indekslenir) + indirilen nesneler aynı yollara yeniden yüklenir (SHA-256 doğrulamalı).
