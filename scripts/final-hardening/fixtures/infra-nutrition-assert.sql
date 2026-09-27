-- INFRA 0700 assert (--twice sonrası): Türkçe adlar + aliases tekil + ASCII ad kalmadı.
DO $$
DECLARE
  v text;
  a text[];
  n integer;
BEGIN
  SELECT name_tr, aliases INTO v, a FROM public.nutrition_nutrients WHERE code = 'total_fat';
  IF v <> 'Toplam Yağ' THEN RAISE EXCEPTION 'total_fat name_tr=%', v; END IF;
  IF NOT ('toplam yag' = ANY (a)) THEN RAISE EXCEPTION 'total_fat aliases eski adı içermiyor: %', a; END IF;
  IF NOT ('yag' = ANY (a)) THEN RAISE EXCEPTION 'total_fat mevcut alias kayboldu: %', a; END IF;
  SELECT count(*) INTO n FROM unnest(a) x WHERE x = 'toplam yag';
  IF n <> 1 THEN RAISE EXCEPTION 'total_fat alias tekrarlandı (idempotency): %', n; END IF;

  SELECT name_tr INTO v FROM public.nutrition_allergens WHERE code = 'gluten';
  IF v <> 'Gluten İçeren Tahıllar' THEN RAISE EXCEPTION 'gluten name_tr=%', v; END IF;
  SELECT name_tr INTO v FROM public.nutrition_units WHERE code = 'cup';
  IF v <> 'Su Bardağı' THEN RAISE EXCEPTION 'cup name_tr=%', v; END IF;
  SELECT name_tr INTO v FROM public.nutrition_food_groups WHERE code = 'dairy';
  IF v <> 'Süt Ürünleri' THEN RAISE EXCEPTION 'dairy name_tr=%', v; END IF;
  SELECT name_tr INTO v FROM public.nutrition_traditional_frameworks WHERE code = 'mizac';
  IF v <> 'Mizaç' THEN RAISE EXCEPTION 'mizac name_tr=%', v; END IF;
  SELECT name_tr INTO v FROM public.nutrition_formulas WHERE code = 'bmi';
  IF v <> 'Vücut Kitle İndeksi' THEN RAISE EXCEPTION 'bmi name_tr=%', v; END IF;

  -- Seed'de zaten doğru olan ad dokunulmadı.
  SELECT name_tr INTO v FROM public.nutrition_nutrients WHERE code = 'protein';
  IF v <> 'Protein' THEN RAISE EXCEPTION 'protein değişti: %', v; END IF;

  -- Owner'ın elle değiştirdiği değer (infra-nutrition-owner-edit.sql) EZİLMEDİ.
  SELECT name_tr INTO v FROM public.nutrition_allergens WHERE code = 'fish';
  IF v <> 'Owner Özel' THEN RAISE EXCEPTION 'owner değeri ezildi: %', v; END IF;

  -- ASCII seed adı kalmadı (düzeltilen kodlar).
  SELECT count(*) INTO n FROM public.nutrition_food_groups
   WHERE name_tr IN ('Tahillar','Yaglar','Icecekler','Turuncgiller');
  IF n <> 0 THEN RAISE EXCEPTION 'ASCII food group adı kaldı: %', n; END IF;
END $$;
