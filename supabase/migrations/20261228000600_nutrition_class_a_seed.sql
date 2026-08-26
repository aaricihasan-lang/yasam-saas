-- ============================================================
-- 20261228000600_nutrition_class_a_seed.sql
--
-- Beslenme & Metabolik Yaşam Sistemi — FAZ 2 / Class A System Reference
-- CANONICAL SEED — başlangıç sistem referans verisi (yalnız Class A vocab)
--
-- CANONICAL CONTRACT: docs/beslenme-metabolik-sistem-faz2-asama1-class-a-preflight-2026-08-26.md §P
--
-- KAPSAM: yalnız 6 Class A vocab tablosuna makul başlangıç seti. Class B/C, sources, evidence YOK.
-- IDEMPOTENCY: bu migration tek-seferliktir; tablolar bu noktada BOŞTUR → düz INSERT (ON CONFLICT YOK).
--   "ON CONFLICT DO UPDATE her şeyi ez" gibi tehlikeli yaklaşım KULLANILMAZ; duplicate code doğal olarak
--   reddedilir (UNIQUE), bu istenen güvenliktir. Canonical identity yanlışlıkla overwrite EDİLMEZ.
--
-- SEED KAYNAK/GEREKÇE (her grup):
--   units      : SI/metrik + yaygın mutfak birimleri. base/factor YALNIZ aynı fiziksel boyut (kg/mg/mcg↔g,
--                l↔ml, kj↔kcal). household/count için factor YOK (besne-bağımlı dönüşüm iddia edilmez).
--   nutrients  : USDA FoodData Central / INFOODS standart nutrient adlandırması (yalnız isim; değer içermez).
--   allergens  : Codex Alimentarius / EU FIC Annex II yaygın "major allergen" baseline (region-lock değil).
--   food_groups: yaygın gıda kompozisyon üst-grupları + örnek alt gruplar (hiyerarşi örneği).
--   frameworks : FAZ 1 kilidi (mizac/blood_type/ayurveda/tcm/unani/other) — yalnız çerçeve, profil değil.
--   formulas   : yayınlanmış denklemler (Mifflin-St Jeor 1990, Harris-Benedict rev.1984, WHO BMI, WHtR).
--                DB yalnız METADATA; equation_display/config asla execute edilmez (lib/nutrition/calc/* allowlist).
-- ============================================================

BEGIN;

-- ── 1) UNITS ────────────────────────────────────────────────────────────────
-- Tek statement: self-FK (base_unit_code) statement sonunda doğrulanır → base kodlar (g/ml/kcal) aynı
-- statement içinde mevcut olduğundan sıralama önemli değildir.
INSERT INTO public.nutrition_units (code, symbol, name_tr, name_en, unit_type, base_unit_code, factor_to_base, sort_order) VALUES
  ('g',       'g',           'Gram',          'Gram',        'mass',      NULL,   NULL,       10),
  ('kg',      'kg',          'Kilogram',      'Kilogram',    'mass',      'g',    1000,       11),
  ('mg',      'mg',          'Miligram',      'Milligram',   'mass',      'g',    0.001,      12),
  ('mcg',     'µg',          'Mikrogram',     'Microgram',   'mass',      'g',    0.000001,   13),
  ('ml',      'ml',          'Mililitre',     'Milliliter',  'volume',    NULL,   NULL,       20),
  ('l',       'L',           'Litre',         'Liter',       'volume',    'ml',   1000,       21),
  ('kcal',    'kcal',        'Kilokalori',    'Kilocalorie', 'energy',    NULL,   NULL,       30),
  ('kj',      'kJ',          'Kilojul',       'Kilojoule',   'energy',    'kcal', 0.239006,   31),
  ('piece',   'ad',          'Adet',          'Piece',       'count',     NULL,   NULL,       40),
  ('serving', 'porsiyon',    'Porsiyon',      'Serving',     'household', NULL,   NULL,       50),
  ('cup',     'su b.',       'Su Bardagi',    'Cup',         'household', NULL,   NULL,       51),
  ('tbsp',    'yk',          'Yemek Kasigi',  'Tablespoon',  'household', NULL,   NULL,       52),
  ('tsp',     'tk',          'Tatli Kasigi',  'Teaspoon',    'household', NULL,   NULL,       53);

-- ── 2) NUTRIENTS ────────────────────────────────────────────────────────────
-- default_unit_id units'ten çözülür (units yukarıda ayrı statement'ta eklendi → subquery görür).
INSERT INTO public.nutrition_nutrients (code, name_tr, name_en, aliases, category, default_unit_id, sort_order) VALUES
  ('energy',        'Enerji',        'Energy',        '{}',                              'energy',        (SELECT id FROM public.nutrition_units WHERE code = 'kcal'), 10),
  ('protein',       'Protein',       'Protein',       '{}',                              'macronutrient', (SELECT id FROM public.nutrition_units WHERE code = 'g'),    20),
  ('carbohydrate',  'Karbonhidrat',  'Carbohydrate',  '{"karbonhidrat","carbs"}',        'macronutrient', (SELECT id FROM public.nutrition_units WHERE code = 'g'),    21),
  ('total_fat',     'Toplam Yag',    'Total Fat',     '{"yag","fat"}',                   'macronutrient', (SELECT id FROM public.nutrition_units WHERE code = 'g'),    22),
  ('saturated_fat', 'Doymus Yag',    'Saturated Fat', '{}',                              'macronutrient', (SELECT id FROM public.nutrition_units WHERE code = 'g'),    23),
  ('fiber',         'Lif',           'Dietary Fiber', '{"posa","fibre"}',                'macronutrient', (SELECT id FROM public.nutrition_units WHERE code = 'g'),    24),
  ('sugar',         'Seker',         'Sugar',         '{}',                              'macronutrient', (SELECT id FROM public.nutrition_units WHERE code = 'g'),    25),
  ('sodium',        'Sodyum',        'Sodium',        '{}',                              'mineral',       (SELECT id FROM public.nutrition_units WHERE code = 'mg'),   30),
  ('potassium',     'Potasyum',      'Potassium',     '{}',                              'mineral',       (SELECT id FROM public.nutrition_units WHERE code = 'mg'),   31),
  ('calcium',       'Kalsiyum',      'Calcium',       '{}',                              'mineral',       (SELECT id FROM public.nutrition_units WHERE code = 'mg'),   32),
  ('iron',          'Demir',         'Iron',          '{"demir"}',                       'mineral',       (SELECT id FROM public.nutrition_units WHERE code = 'mg'),   33),
  ('magnesium',     'Magnezyum',     'Magnesium',     '{}',                              'mineral',       (SELECT id FROM public.nutrition_units WHERE code = 'mg'),   34),
  ('zinc',          'Cinko',         'Zinc',          '{}',                              'mineral',       (SELECT id FROM public.nutrition_units WHERE code = 'mg'),   35),
  ('vitamin_a',     'A Vitamini',    'Vitamin A',     '{"retinol"}',                     'vitamin',       (SELECT id FROM public.nutrition_units WHERE code = 'mcg'),  40),
  ('vitamin_c',     'C Vitamini',    'Vitamin C',     '{"askorbik asit","ascorbic acid"}','vitamin',      (SELECT id FROM public.nutrition_units WHERE code = 'mg'),   41),
  ('vitamin_d',     'D Vitamini',    'Vitamin D',     '{"kalsiferol"}',                  'vitamin',       (SELECT id FROM public.nutrition_units WHERE code = 'mcg'),  42),
  ('vitamin_b12',   'B12 Vitamini',  'Vitamin B12',   '{"kobalamin","cobalamin"}',       'vitamin',       (SELECT id FROM public.nutrition_units WHERE code = 'mcg'),  43),
  ('folate',        'Folat',         'Folate',        '{"folik asit","folic acid","b9"}','vitamin',       (SELECT id FROM public.nutrition_units WHERE code = 'mcg'),  44),
  ('epa',           'EPA',           'Eicosapentaenoic Acid', '{}',                      'fatty_acid',    (SELECT id FROM public.nutrition_units WHERE code = 'mg'),   50),
  ('dha',           'DHA',           'Docosahexaenoic Acid',  '{}',                      'fatty_acid',    (SELECT id FROM public.nutrition_units WHERE code = 'mg'),   51);

-- ── 3) ALLERGENS (Codex / EU FIC Annex II baseline; is_major=true) ───────────
INSERT INTO public.nutrition_allergens (code, name_tr, name_en, aliases, is_major, sort_order) VALUES
  ('gluten',      'Gluten Iceren Tahillar',  'Cereals containing gluten',      '{"bugday","wheat","arpa","rye"}', true, 10),
  ('crustaceans', 'Kabuklu Deniz Urunleri',  'Crustaceans',                    '{"karides","yengec","istakoz"}',  true, 11),
  ('eggs',        'Yumurta',                 'Eggs',                           '{}',                              true, 12),
  ('fish',        'Balik',                   'Fish',                           '{}',                              true, 13),
  ('peanuts',     'Yer Fistigi',             'Peanuts',                        '{"fistik"}',                      true, 14),
  ('soybeans',    'Soya',                    'Soybeans',                       '{"soya fasulyesi"}',              true, 15),
  ('milk',        'Sut (Laktoz Dahil)',      'Milk (including lactose)',       '{"laktoz","lactose"}',            true, 16),
  ('tree_nuts',   'Sert Kabuklu Yemisler',   'Tree nuts',                      '{"badem","ceviz","findik"}',      true, 17),
  ('celery',      'Kereviz',                 'Celery',                         '{}',                              true, 18),
  ('mustard',     'Hardal',                  'Mustard',                        '{}',                              true, 19),
  ('sesame',      'Susam',                   'Sesame seeds',                   '{"tahin"}',                       true, 20),
  ('sulphites',   'Sulfitler (SO2)',         'Sulphur dioxide and sulphites',  '{"kukurt dioksit"}',              true, 21),
  ('lupin',       'Aci Bakla (Lupin)',       'Lupin',                          '{}',                              true, 22),
  ('molluscs',    'Yumusakcalar',            'Molluscs',                       '{"midye","kalamar","ahtapot"}',   true, 23);

-- ── 4) FOOD GROUPS — üst seviye (parent_id NULL) ─────────────────────────────
INSERT INTO public.nutrition_food_groups (code, name_tr, name_en, parent_id, sort_order) VALUES
  ('vegetables',     'Sebzeler',                  'Vegetables',       NULL, 10),
  ('fruits',         'Meyveler',                  'Fruits',           NULL, 11),
  ('grains_cereals', 'Tahillar',                  'Grains & Cereals', NULL, 12),
  ('legumes',        'Baklagiller',               'Legumes',          NULL, 13),
  ('nuts_seeds',     'Kuruyemis ve Tohumlar',     'Nuts & Seeds',     NULL, 14),
  ('dairy',          'Sut Urunleri',              'Dairy',            NULL, 15),
  ('meat_poultry',   'Et ve Kumes Hayvanlari',    'Meat & Poultry',   NULL, 16),
  ('fish_seafood',   'Balik ve Deniz Urunleri',   'Fish & Seafood',   NULL, 17),
  ('eggs',           'Yumurta',                   'Eggs',             NULL, 18),
  ('fats_oils',      'Yaglar',                    'Fats & Oils',      NULL, 19),
  ('beverages',      'Icecekler',                 'Beverages',        NULL, 20),
  ('sweets',         'Tatlilar ve Sekerler',      'Sweets & Sugars',  NULL, 21);

-- ── 5) FOOD GROUPS — alt seviye (parent üstteki statement'ta mevcut → subquery çözer) ─
INSERT INTO public.nutrition_food_groups (code, name_tr, name_en, parent_id, sort_order) VALUES
  ('leafy_greens', 'Yesil Yaprakli Sebzeler', 'Leafy Greens',   (SELECT id FROM public.nutrition_food_groups WHERE code = 'vegetables'), 30),
  ('cruciferous',  'Turpgiller',              'Cruciferous',    (SELECT id FROM public.nutrition_food_groups WHERE code = 'vegetables'), 31),
  ('citrus',       'Turuncgiller',            'Citrus Fruits',  (SELECT id FROM public.nutrition_food_groups WHERE code = 'fruits'),     32);

-- ── 6) TRADITIONAL FRAMEWORKS (yalnız çerçeve; profil DEĞİL) ─────────────────
INSERT INTO public.nutrition_traditional_frameworks (code, name_tr, name_en, sort_order) VALUES
  ('mizac',      'Mizac',                   'Temperament',                  10),
  ('blood_type', 'Kan Grubu',               'Blood Type',                   11),
  ('ayurveda',   'Ayurveda',                'Ayurveda',                     12),
  ('tcm',        'Geleneksel Cin Tibbi',    'Traditional Chinese Medicine', 13),
  ('unani',      'Unani (Yunani)',          'Unani',                        14),
  ('other',      'Diger',                   'Other',                        99);

-- ── 7) FORMULAS (yalnız METADATA registry; equation_display/config execute EDİLMEZ) ─
INSERT INTO public.nutrition_formulas
  (code, name_tr, name_en, version, purpose, population_scope, required_inputs, equation_display, config, source_reference, limitations, sort_order) VALUES
  (
    'bmi', 'Vucut Kitle Indeksi', 'Body Mass Index', 1, 'bmi', 'general',
    '[{"key":"weight_kg","type":"number","unit":"kg","required":true},{"key":"height_cm","type":"number","unit":"cm","required":true}]'::jsonb,
    'BMI = agirlik(kg) / boy(m)^2',
    NULL,
    'WHO — Body mass index (BMI) classification',
    'Kas kutlesi, odem ve gebelik durumlarinda yaniltici olabilir; tek basina tani araci degildir.',
    10
  ),
  (
    'bmr_mifflin_st_jeor', 'BMR (Mifflin-St Jeor)', 'BMR (Mifflin-St Jeor)', 1, 'bmr', 'adult',
    '[{"key":"weight_kg","type":"number","unit":"kg","required":true},{"key":"height_cm","type":"number","unit":"cm","required":true},{"key":"age_years","type":"number","unit":"year","required":true},{"key":"sex","type":"enum","values":["male","female"],"required":true}]'::jsonb,
    'BMR = 10*agirlik(kg) + 6.25*boy(cm) - 5*yas + s   (s: erkek +5, kadin -161)',
    '{"sex_offset":{"male":5,"female":-161}}'::jsonb,
    'Mifflin MD, St Jeor ST, et al. Am J Clin Nutr. 1990;51(2):241-247',
    'Yetiskinler icin dogrulanmistir; asiri obezite ve ileri yasta sapma gorulebilir.',
    20
  ),
  (
    'bmr_harris_benedict', 'BMR (Harris-Benedict, rev. 1984)', 'BMR (Harris-Benedict, revised 1984)', 1, 'bmr', 'adult',
    '[{"key":"weight_kg","type":"number","unit":"kg","required":true},{"key":"height_cm","type":"number","unit":"cm","required":true},{"key":"age_years","type":"number","unit":"year","required":true},{"key":"sex","type":"enum","values":["male","female"],"required":true}]'::jsonb,
    'Erkek: 88.362 + 13.397*kg + 4.799*cm - 5.677*yas ; Kadin: 447.593 + 9.247*kg + 3.098*cm - 4.330*yas',
    '{"male":{"base":88.362,"weight":13.397,"height":4.799,"age":-5.677},"female":{"base":447.593,"weight":9.247,"height":3.098,"age":-4.330}}'::jsonb,
    'Roza AM, Shizgal HM. Am J Clin Nutr. 1984 (revised Harris-Benedict)',
    'Mifflin-St Jeor formulune gore enerji ihtiyacini fazla tahmin edebilir.',
    21
  ),
  (
    'tdee', 'TDEE (Aktivite Katsayisi)', 'TDEE (Activity Multiplier)', 1, 'tdee', 'general',
    '[{"key":"bmr_kcal","type":"number","unit":"kcal","required":true},{"key":"activity_level","type":"enum","values":["sedentary","light","moderate","active","very_active"],"required":true}]'::jsonb,
    'TDEE = BMR * aktivite_katsayisi',
    '{"multipliers":{"sedentary":1.2,"light":1.375,"moderate":1.55,"active":1.725,"very_active":1.9}}'::jsonb,
    'Katch/McArdle activity-factor convention (Exercise Physiology)',
    'Aktivite seviyesi oznel bir tahmindir; gercek harcamada +/- %10-15 sapma olabilir.',
    30
  ),
  (
    'whtr', 'Bel/Boy Orani', 'Waist-to-Height Ratio', 1, 'ratio', 'general',
    '[{"key":"waist_cm","type":"number","unit":"cm","required":true},{"key":"height_cm","type":"number","unit":"cm","required":true}]'::jsonb,
    'WHtR = bel_cevresi(cm) / boy(cm)',
    NULL,
    'Ashwell M, Gunn P, Gibson S. Obes Rev. 2012',
    'Tek basina bir tani araci degildir; klinik degerlendirmeyle birlikte yorumlanir.',
    40
  );

COMMIT;
