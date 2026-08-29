# Beslenme FAZ 6 — AŞAMA 1: Profesyonel Tamamlama Mimarisi (LOCK)

**Tarih:** 2026-08-29 · **Durum:** ✅ ARCHITECTURE LOCK READY · **Kapsam:** analiz (kod yok — AŞAMA 2'de uygulandı)

FAZ 4 (Food Engine) + FAZ 5 (Plan Engine) prod'da CANLI. FAZ 6, modülü günlük profesyonel
kullanıma hazırlar: geniş katalog, hızlı plan hazırlama (templates + recents), deterministik
alternatifler, plan analitiği, profesyonel Word çıktısı. Danışan Yolculuğu FAZ 7 (bu fazda YOK).

## A. Baseline
- Food engine: `nutrition_foods` (+`_nutrients`/100g `basis_grams=100`, `_portions`, `_external_refs`, `_traditional`), Class A vocab (15 grup, 20 nutrient, 13 unit). Prod: 20 SYSTEM food. SYSTEM tenant `00000000-0000-4000-8000-000000000001` (`lib/beslenme/systemTenant.ts`).
- Importer `scripts/beslenme-food-engine/importUsda.mjs` (dry-run default, `--apply`, idempotent (tenant,provider,external_id), SHA-256 content_hash). Fixture `data/nutrition/usda-foundation-v1.json`.
- Plan engine: `nutrition_plans/_days/_meals/_items/_item_nutrients`; `buildItemSnapshot` server-authoritative; copy RPC ailesi; snapshot immutability + archive + range guards + V1/V2/V3 revision. Server SQL aggregation YOK. `requireBeslenmeOwner` + `denyDemoMutation`.
- Word altyapı: `lib/docx/reportHelpers.ts` (premium builders), `docx@^9.7.1`. **`fetchImageBuffer` SSRF-UNSAFE** (Beslenme kullanmayacak). Repo-genelinde generic rate-limit yoktu.

## Kararlar (A–AP özet)
- **Katalog (C–K):** hedef ≥300 curated SYSTEM food (ideal 300–500), kalite > sayı. Yeni versioned manifest `data/nutrition/usda-curated-v2.json`; importer generalize; `hashFood`'a name_tr+aliases eklenir (TR isim güncellemesi propagate olsun). **Şema DEĞİŞMEZ.** USDA FDC (SR Legacy + Foundation, CC0). **Veri UYDURMA YASAK** — güvenilir kaynak yoksa CONDITIONAL.
- **Search (K):** `limit(300)` yerine ts_rank_cd relevance + pagination RPC (`nutrition_food_search`); SYSTEM∪caller union RPC'de.
- **Recents (M):** INCLUDE — `nutrition_plan_items` aggregate, yeni tablo YOK. **Favorites (L): DEFER.**
- **Templates (N–S, §O):** 4 tablo (`nutrition_templates/_meals/_items/_item_nutrients`), `template_type` meal|day; plan child yapısını aynalar (day katmanı yok); snapshot plan item ile birebir; apply = verbatim deep-copy (yeni IDs). RPC: create_from_meal/day, apply_meal (append) / apply_day (target BOŞ → 45012), duplicate. OPTION C (plans overload) REDDEDİLDİ.
- **Alternatives (T–V):** deterministik (AI YOK); Level 1 energy band (±10→±20), Level 2 weighted macro distance; same-group toggle; amount match `target_energy/cand_energy_per100×100`; zero/missing-energy exclude; dil "Yaklaşık Besin Alternatifleri" (tıbbi iddia YOK). Şema YOK.
- **Analytics (W–X):** server-authoritative, SNAPSHOT-only, batched (N+1 YOK); günlük/haftalık/plan; **boş-gün kilidi: ortalamalar yalnız içerikli günler**, plan-gün vs içerikli-gün ayrı gösterilir. Şema YOK. Score/grade YOK.
- **Word (Y–AD):** `POST /api/beslenme/plans/[id]/word`; snapshot-only; **remote image YOK (SSRF-safe)**; rate-limit 10/dk; archived export izinli; **demo export REDDEDİLİR** (canonical sifa politikası, §33); dosya adı traversal-safe; V<rev> versiyonlu.
- **Şema (AH):** yalnız 4 template tablosu + template/search RPC. Catalog/alternatives/analytics/word migration YOK.
- **Güvenlik (AJ):** tüm yeni route owner + demo-deny + server tenant + hasOnlyKeys; foreign/spoof reddi; SYSTEM tenant tek helper.

## Deferred (AP)
Favorites, recipe engine, AI, TürKomp/branded/bulk import, Danışan/client_id/client Word header,
export history, advanced micronutrient dashboard, PDF, global i18n, supplement/clinical.

Detaylı gerekçeler AŞAMA 2 implementation dokümanında + kod yorumlarında.
