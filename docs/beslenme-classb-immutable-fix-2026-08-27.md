# Beslenme Class B — APPLY BLOCKER FIX (generated-column immutability)

**Tarih:** 2026-08-27 · **Branch:** `work/nutrition-classb-immutable-fix` (base origin/main `82bc74dc`; PR #213 MERGE'li)
**Durum:** migration fix + harness regression · **DB APPLY YOK** · **legacy import YOK**

## Root cause (exact)
Production'da ilk migration `20261229000000_nutrition_foods.sql` şu hata ile fail etti:
`ERROR 42P17: generation expression is not immutable` → `nutrition_foods.search_tsv GENERATED ALWAYS AS (...)`.

PostgreSQL **generated column** (GENERATED ALWAYS AS ... STORED) ifadesinin **IMMUTABLE** olmasını zorunlu kılar.
İfade fonksiyonları elemeyle incelendi:
- `to_tsvector('simple', …)` (2-arg, sabit config) — IMMUTABLE ✓
- `setweight(...)`, `coalesce(...)`, `||` (concat) — IMMUTABLE ✓
- `public.yh_immutable_unaccent(text)` — kaynak: `20260712000000` `LANGUAGE sql IMMUTABLE PARALLEL SAFE` ✓
- **`array_to_string(anyarray, text)` — PostgreSQL'de STABLE (IMMUTABLE DEĞİL) ✗ → KÖK NEDEN.**

`array_to_string` yalnız **`nutrition_foods`** search_tsv'sinde (aliases join için) kullanılıyordu → bu yüzden
ilk migration'da patladı. `nutrition_topics` ve `nutrition_sources` generated ifadeleri array fonksiyonu
İÇERMİYORDU (yalnız immutable fn) → onlar tek başına geçerdi, ama aynı sınıf riske açıktı.

## Fix (canonical repo deseni)
Üç tablonun (`nutrition_foods`, `nutrition_topics`, `nutrition_sources`) `search_tsv`'i **GENERATED
column → plain `tsvector` kolon + BEFORE INSERT OR UPDATE trigger** olarak değiştirildi. Trigger ifadesi
immutability zorunluluğu **taşımaz** → STABLE `array_to_string` güvenle kullanılır. Bu, repo'nun mevcut
canonical arama deseni (`yh_index_build_search_tsv` @ `20260712`) ve AŞAMA-1 planının belirttiği yapıdır.

- **Search contract KORUNDU:** aynı tsvector içeriği (ağırlık A/B/C), aynı GIN indeksi, aynı `textSearch`
  sorgu yolu. Alias araması korundu. `yh_immutable_unaccent` korpus/sorgu simetrisi aynen.
- **In-place edit güvenli:** migration hiçbir ortama başarıyla uygulanmadı (prod rollback; staging/local yok)
  → dosyayı düzeltmek doğru (yeni telafi migration'ı gerekmez).

## Etkilenen migration'lar
`20261229000000_nutrition_foods.sql` (asıl fail), `20261229000100_nutrition_topics.sql`,
`20261229000400_nutrition_sources.sql` — üçü de trigger desenine çevrildi (uniform + future-proof).
Trigger sırası (alfabetik): `identity_guard` → `search_tsv` → `updated_at` (çakışma yok; INSERT'te yalnız search_tsv).

## Harness regression (§9)
`scripts/beslenme-knowledge/ddlHarness.mjs` `[IMM]` bölümü eklendi (12 assertion):
hiçbir migration'da `tsvector GENERATED ALWAYS` YOK · GENERATED içinde `array_to_string` YOK · 3 tablo
plain tsvector kolon + `_search_tsv()` fonksiyonu + BEFORE INSERT OR UPDATE trigger · trigger yalnız
IMMUTABLE `yh_immutable_unaccent` kullanır. → **knowledge harness 101/0** (89→101). **Class A regression 211/0** korundu.

## Negative contract
production DB **NOT TOUCHED / NOT APPLIED** · legacy **NOT IMPORTED** · YH **NOT ACTIVATED** · manuel workaround YOK.
