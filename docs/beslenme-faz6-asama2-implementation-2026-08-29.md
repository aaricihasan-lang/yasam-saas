# Beslenme FAZ 6 — AŞAMA 2: Profesyonel Tamamlama (IMPLEMENTATION)

**Tarih:** 2026-08-29 · **Branch:** `work/nutrition-professional-completion` (base origin/main `935f9ef1`, drift 0)
**Durum:** implementation + local/static test PASS · PR-ready · **PRODUCTION APPLY YOK** · **catalog data CONDITIONAL**

## 1. Şema (yalnız 4 template tablosu + 2 RPC migration)
- `20270101000000_nutrition_templates.sql` — template header (`template_type` meal|day, RLS doğuştan-kilitli, identity guard, service_role-only).
- `20270101000100_nutrition_template_meals.sql` — composite FK `(tenant_id, template_id)`; child target UNIQUE `(tenant_id, template_id, id)`.
- `20270101000200_nutrition_template_items.sql` — plan item SNAPSHOT modelinin birebir aynası (food_id soft pointer, physical FK YOK).
- `20270101000300_nutrition_template_item_nutrients.sql` — frozen /100g nutrient set, immutable.
- `20270101000400_nutrition_template_rpcs.sql` — `create_from_meal/day`, `apply_meal` (append) / `apply_day` (target BOŞ → 45012), `duplicate`, internal `emit_into_day`. Hepsi SECURITY INVOKER + service_role-only. Snapshot server-authoritative (kaynağı DB'den okur; client spoof edemez, §39).
- `20270101000500_nutrition_food_search.sql` — `nutrition_food_search` (ts_rank_cd relevance + pagination + SYSTEM∪caller union). SECURITY INVOKER STABLE service_role-only.

**Catalog / alternatives / analytics / word: migration YOK.** Favorites: DEFERRED.

## 2. Katalog (CONDITIONAL — veri UYDURULMADI)
- `scripts/beslenme-food-engine/importCatalog.mjs` — generalize importer (`--manifest`, dry-run default, `--apply` AŞAMA 3). **hashFood fix:** artık name_tr + name_en + **canonically-sorted aliases** + nutrients + portions + food_group + prep_state + fdc_id hash'lenir (TR isim güncellemesi propagate; alias ORDER değişimi fake update üretmez).
- `scripts/beslenme-food-engine/validateCatalog.mjs` — genişletilmiş static validator (`--min` default 0).
- `data/nutrition/usda-curated-v2.json` — v2 manifest. **Verified food count = 20** (mevcut doğrulanmış set verbatim; hiçbir FDC/nutrient/portion UYDURULMADI). 300–500'e genişletme AŞAMA 3'te gerçek USDA FDC sourcing gerektirir → **catalog data gate CONDITIONAL**.

## 3. Kod dosyaları (özet)
- `lib/beslenme/templateContracts.ts`, `templateEngine.ts` (+ API `app/api/beslenme/templates/**`: list/create, [id] get/patch/delete, duplicate, apply).
- `lib/beslenme/alternativeEngine.ts` (pure `scoreAlternatives` + `altGramsForEnergyMatch` + `resolveAlternativesForItem`) + `app/api/beslenme/plans/[id]/items/[itemId]/alternatives/route.ts`.
- `lib/beslenme/analyticsReduce.ts` (pure) + `analytics.ts` + `app/api/beslenme/plans/[id]/analytics/route.ts`.
- `lib/beslenme/word/planDocxBuilder.ts` (pure) + `planDocx.ts` + `app/api/beslenme/plans/[id]/word/route.ts` + `lib/rateLimit.ts` (`rateLimit()` wrapper).
- `app/api/beslenme/foods/route.ts` (search RPC + pagination), `foods/recent/route.ts` (recents, yeni tablo YOK).
- UI: `lib/beslenme/faz6Client.ts`, `app/beslenme/sablonlar/page.tsx`, hub kartı, `PlanTools.tsx` (Analiz/Word/gün-şablon), `Faz6ItemActions.tsx` (öğün-şablon + item alternatif), MealCard entegrasyonu.

## 4. Güvenlik
- Tüm yeni route `requireBeslenmeOwner` + (mutation) `denyDemoMutation` + server tenant + `hasOnlyKeys`→400.
- Template/apply/create snapshot server-authoritative (client food_name/nutrient/ownership SPOOF edemez).
- Alternatif hedef değerleri DB snapshot'tan; client yalnız filter gönderir.
- **Word: remote image / fetch YOK (SSRF-safe); demo export REDDEDİLİR (canonical sifa politikası, §33); rate-limit 10/dk; oversize → 413; archived export izinli.**
- SYSTEM tenant tek canonical helper `lib/beslenme/systemTenant.ts`; `.mjs` importer sabiti "keep in sync" comment'iyle hand-copy (Node ESM sınırı; yeni magic literal üretilmedi).

## 5. Test sonuçları (local/static/PGlite)
| Harness | Sonuç |
|---|---|
| templates DDL+RPC (PGlite) | 21/0 |
| food search RPC (PGlite) | 15/0 |
| catalog | 14/0 |
| catalog validate | 933/0 |
| alternatives | 16/0 |
| analytics (PGlite) | 47/0 |
| word (DOCX + SSRF static) | 37/0 |
| **Regression** class-a | 211/0 |
| knowledge | 110/0 |
| food-engine DDL | 89/0 |
| food-engine calc | 45/0 |
| plan-engine DDL | 205/0 |
| plan-engine calc | 28/0 |
| tsc --noEmit | 0 error |
| eslint (touched) | 0 error |
| next build | (worktree gerçek node_modules ile doğrulandı) |

**Production mutation: SIFIR.** Migration apply YOK, catalog import YOK.

## 6. AŞAMA 3 — Production checklist (ayrı onay)
1. PR merge → controlled prod migration apply: `20270101000000..000500` (6 migration, yetkili kanal).
2. Catalog data: gerçek USDA FDC'den ≥300 curated food manifest'e eklenip `validateCatalog` PASS → `importCatalog --apply` (dry-run→apply; created/updated/unchanged/errors). Mevcut 20 duplicate-safe.
3. Owner prod UAT: search (elma/apple…), template create/apply (meal/day, TARGET_NOT_EMPTY), alternatif (grams), analytics (içerikli-gün ortalama), Word (snapshot, safe filename, rate-limit).
4. Mobile 375/390 manual UAT (FAZ 5 minor da burada kapanır).
5. Baseline doğrulama (system food invariants).

## 7. Sınırlar
Danışan Yolculuğu YOK (client_id yok). Recipe engine, AI, favorites, TürKomp/branded import DEFERRED.
