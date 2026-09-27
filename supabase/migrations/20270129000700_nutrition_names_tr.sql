-- =============================================================================
-- 20270129000700_nutrition_names_tr.sql   [DATA FIX — SİSTEM SÖZLÜĞÜ; UPDATE]
--
-- FAZ1 FINAL HARDENING — PAKET INFRA — Beslenme Class A sistem sözlüğü Türkçe adları.
--
-- AMAÇ: 20261228000600_nutrition_class_a_seed.sql ASCII (Türkçe karaktersiz) name_tr
--   değerleriyle yüklendi ("Toplam Yag", "Gluten Iceren Tahillar", "Su Bardagi" …).
--   Bu migration yalnız o SİSTEM seed satırlarının name_tr'sini doğru Türkçe yazıma çevirir.
--   Uzman içeriği DEĞİLDİR (Class A global vocab; tenant'sız). Uzman kayıtlarına dokunulmaz.
--
-- GÜVENLİK/İDEMPOTENCY:
--   * Her UPDATE `code = <kod> AND name_tr = <eski ASCII seed değeri>` ile sınırlı →
--     değer zaten düzeltilmiş ya da owner tarafından elle değiştirilmişse satır ETKİLENMEZ.
--     İkinci çalıştırma 0 satır günceller.
--   * Identity guard'ları (id/code/created_at; formüllerde version) değişmez → trigger'lar geçer.
--   * Arama geriye uyumluluğu: aliases kolonu olan tablolarda (nutrition_nutrients,
--     nutrition_allergens; text[] NOT NULL, NULL eleman yasak) eski ASCII ad küçük harfle
--     aliases'a eklenir (yoksa). Kodda name_tr ile birebir eşleştirme YOK (grep: .eq("name_tr")
--     / name_tr === yalnız YEBS'te, farklı tablo).
--
-- PRECONDITION: tablolar yoksa RAISE NOTICE + atla.
-- VERİ-YIKICI MI: HAYIR (yalnız görünen ad düzeltmesi; satır silme/ekleme YOK). DİKKAT:
--   bu bir UPDATE'tir (prod sistem sözlüğü ~40 satır).
-- ⚠️ PRODUCTION'A UYGULANMADI. Kodla bağımsız (deploy sırası önemsiz).
--
-- ROLLBACK: aynı eşlemenin tersi (name_tr = eski ASCII WHERE name_tr = yeni Türkçe);
--   aliases'a eklenen ASCII ad zararsızdır (arama yardımcısı), bırakılabilir.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  m record;
  has_aliases boolean;
  n integer;
  total integer := 0;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      -- units (aliases kolonu YOK)
      ('nutrition_units',                  'cup',            'Su Bardagi',              'Su Bardağı'),
      ('nutrition_units',                  'tbsp',           'Yemek Kasigi',            'Yemek Kaşığı'),
      ('nutrition_units',                  'tsp',            'Tatli Kasigi',            'Tatlı Kaşığı'),
      -- nutrients
      ('nutrition_nutrients',              'total_fat',      'Toplam Yag',              'Toplam Yağ'),
      ('nutrition_nutrients',              'saturated_fat',  'Doymus Yag',              'Doymuş Yağ'),
      ('nutrition_nutrients',              'sugar',          'Seker',                   'Şeker'),
      ('nutrition_nutrients',              'zinc',           'Cinko',                   'Çinko'),
      -- allergens
      ('nutrition_allergens',              'gluten',         'Gluten Iceren Tahillar',  'Gluten İçeren Tahıllar'),
      ('nutrition_allergens',              'crustaceans',    'Kabuklu Deniz Urunleri',  'Kabuklu Deniz Ürünleri'),
      ('nutrition_allergens',              'fish',           'Balik',                   'Balık'),
      ('nutrition_allergens',              'peanuts',        'Yer Fistigi',             'Yer Fıstığı'),
      ('nutrition_allergens',              'milk',           'Sut (Laktoz Dahil)',      'Süt (Laktoz Dahil)'),
      ('nutrition_allergens',              'tree_nuts',      'Sert Kabuklu Yemisler',   'Sert Kabuklu Yemişler'),
      ('nutrition_allergens',              'sulphites',      'Sulfitler (SO2)',         'Sülfitler (SO2)'),
      ('nutrition_allergens',              'lupin',          'Aci Bakla (Lupin)',       'Acı Bakla (Lupin)'),
      ('nutrition_allergens',              'molluscs',       'Yumusakcalar',            'Yumuşakçalar'),
      -- food groups (aliases kolonu YOK)
      ('nutrition_food_groups',            'grains_cereals', 'Tahillar',                'Tahıllar'),
      ('nutrition_food_groups',            'nuts_seeds',     'Kuruyemis ve Tohumlar',   'Kuruyemiş ve Tohumlar'),
      ('nutrition_food_groups',            'dairy',          'Sut Urunleri',            'Süt Ürünleri'),
      ('nutrition_food_groups',            'meat_poultry',   'Et ve Kumes Hayvanlari',  'Et ve Kümes Hayvanları'),
      ('nutrition_food_groups',            'fish_seafood',   'Balik ve Deniz Urunleri', 'Balık ve Deniz Ürünleri'),
      ('nutrition_food_groups',            'fats_oils',      'Yaglar',                  'Yağlar'),
      ('nutrition_food_groups',            'beverages',      'Icecekler',               'İçecekler'),
      ('nutrition_food_groups',            'sweets',         'Tatlilar ve Sekerler',    'Tatlılar ve Şekerler'),
      ('nutrition_food_groups',            'leafy_greens',   'Yesil Yaprakli Sebzeler', 'Yeşil Yapraklı Sebzeler'),
      ('nutrition_food_groups',            'citrus',         'Turuncgiller',            'Turunçgiller'),
      -- traditional frameworks (aliases kolonu YOK)
      ('nutrition_traditional_frameworks', 'mizac',          'Mizac',                   'Mizaç'),
      ('nutrition_traditional_frameworks', 'tcm',            'Geleneksel Cin Tibbi',    'Geleneksel Çin Tıbbı'),
      ('nutrition_traditional_frameworks', 'other',          'Diger',                   'Diğer'),
      -- formulas (yalnız name_tr; aliases YOK; version identity değişmez)
      ('nutrition_formulas',               'bmi',            'Vucut Kitle Indeksi',     'Vücut Kitle İndeksi'),
      ('nutrition_formulas',               'tdee',           'TDEE (Aktivite Katsayisi)', 'TDEE (Aktivite Katsayısı)'),
      ('nutrition_formulas',               'whtr',           'Bel/Boy Orani',           'Bel/Boy Oranı')
    ) AS v(tbl, code, old_name, new_name)
  LOOP
    IF to_regclass(format('public.%I', m.tbl)) IS NULL THEN
      RAISE NOTICE 'nutrition_names_tr: public.% yok — atlandı (%).', m.tbl, m.code;
      CONTINUE;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = m.tbl AND column_name = 'aliases'
    ) INTO has_aliases;

    IF has_aliases THEN
      EXECUTE format(
        'UPDATE public.%I
            SET name_tr = $1,
                aliases = CASE WHEN lower($2) = ANY (aliases) THEN aliases
                               ELSE array_append(aliases, lower($2)) END
          WHERE code = $3 AND name_tr = $2',
        m.tbl)
      USING m.new_name, m.old_name, m.code;
    ELSE
      EXECUTE format('UPDATE public.%I SET name_tr = $1 WHERE code = $3 AND name_tr = $2', m.tbl)
      USING m.new_name, m.old_name, m.code;
    END IF;

    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
  END LOOP;

  RAISE NOTICE 'nutrition_names_tr: % satır güncellendi.', total;
END $$;

COMMIT;
