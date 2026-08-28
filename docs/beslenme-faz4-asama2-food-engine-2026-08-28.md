# Beslenme FAZ 4 / Aşama 2 — Profesyonel Besin Motoru (Implementation)

**Tarih:** 2026-08-28 · **Branch:** `work/nutrition-food-engine` (base `origin/main` `14024299`)
**Durum:** Kod + migration + fixture + importer + UI + harness HAZIR. **Production APPLY/mutation YOK. PR bekliyor.**

## Canonical şema (4 additive migration; RLS-locked, tenant-safe composite FK)
- `nutrition_food_nutrients` (`20261230000000`) — Food↔Nutrient /100 g. **`CHECK basis_grams = 100` invariant** (per-serving storage yok). `UNIQUE(tenant_id,food_id,nutrient_id)` (dup-nutrient engeli), `CHECK amount >= 0`, nutrient/unit RESTRICT FK, food composite CASCADE. Unit↔kategori uyumu server validator (`isUnitAllowedForCategory`; energy→kcal, makro→g, mineral→mg/mcg…).
- `nutrition_food_portions` (`20261230000100`) — ev ölçüsü → **`gram_weight` köprüsü** (units household conversion NULL bıraktığı için besne-özel gram burada). `CHECK quantity>0 & gram_weight>0`, `UNIQUE(tenant,food,lower(label))`, measure_unit count/household/volume (app-layer).
- `nutrition_food_external_refs` (`20261230000200`) — provenance + **dup-import engeli** `UNIQUE(tenant,provider,external_id)`. `provider ∈ {usda_fdc,turkomp,manual}`. **RAW JSON saklanmaz**; yalnız `content_hash`.
- `nutrition_food_traditional` (`20261230000300`) — besin-**içsel** geleneksel nitelik (thermal `hot|cold|neutral`, moisture `wet|dry|neutral`, framework FK). Nutrient facts'ten AYRI; profil↔food ilişkisi (`nutrition_topic_foods`) BURADA duplicate edilmez. **`mizac_*` tablo ailesi YOK.**

## System / Custom ownership (`lib/beslenme/systemTenant.ts` — tek kaynak)
- **SYSTEM food** = rezerve tenant `SYSTEM_NUTRITION_TENANT_ID` (`00000000-0000-4000-8000-000000000001`; sahte tenant row'u yok). Kaynaklı katalog; tüm tenant'lar OKUR; normal attribute API'siyle **DEĞİŞTİRİLEMEZ** (`SYSTEM_READONLY` 403).
- **CUSTOM food** = current tenant; uzman kendi nutrient/portion/traditional değerlerini düzenler; yalnız kendisi görür.
- **Read** = `{ SYSTEM, caller }` (üçüncü tenant ASLA). **Write** = yalnız caller-owned (`resolveFoodForWrite`). `tenant_id` client body'den ASLA alınmaz. UUID literal yalnız `systemTenant.ts`'te (route/UI hardcode etmez — harness kanıtlar).

## /100 g invariant + hesap (`lib/beslenme/calc/nutrients.ts`, server-authoritative)
`total = grams / 100 × per100g` (tek, deterministik). Porsiyon: `grams = quantity × gram_weight → aynı hesap`. Ör. Elma 52 kcal/100 g → 1 orta (182 g) = **94.64 kcal**. Ham hesap ile display-rounding (`formatAmount`) AYRI. **Dinamik eval YOK.** DB tipi `numeric` (decimal-safe).

## USDA fixture + importer
- `data/nutrition/usda-foundation-v1.json` — **20 temel besin, tümü gerçek USDA FoodData Central (SR Legacy) kaydından** (fdc_id ile doğrulanabilir): elma, muz, portakal, çilek, domates, salatalık, havuç, patates, yumurta, yoğurt, tavuk göğsü, süt, yulaf, pirinç, mercimek, nohut, badem, ceviz, zeytinyağı, ıspanak. MVP nutrient (energy/protein/carb/total_fat/fiber + sugar/sodium/potassium). **Kayıtta olmayan nutrient ATLANDI (0 uydurulmadı).** Lisans **CC0 1.0 (public domain)**; attribution: USDA FoodData Central.
- `scripts/beslenme-food-engine/importUsda.mjs` — **idempotent** (external_ref hash ile create/update/unchanged), **dry-run varsayılan** (`--apply` ile SYSTEM tenant'a yazar; service_role env). RAW dump yok. **Bu turda apply YOK** (dry-run: 20 food / 146 nutrient / 30 porsiyon).

## TürKomp (lisans kapısı)
Ticari SaaS kullanımı **ücretli yıllık lisans** gerektirir (resmi *Veri Kullanımı*). → **veri import EDİLMEZ**; `turkomp` yalnız provider ENUM'u olarak geleceğe hazır. `IMPORT_PROVIDERS = ["usda_fdc"]` (CC0). Lisans alınırsa aynı mimariden beslenir (ayrı onay).

## API (owner-only korunur; ~min route)
- `GET /foods` → SYSTEM+CUSTOM union + `is_system`. `GET /foods/[id]` → food + nutrients + portions + traditional + sources + externalRefs.
- `PUT /foods/[id]/nutrients` · `PUT /foods/[id]/portions` · `PUT /foods/[id]/traditional` (collection-set; **yalnız custom**; SYSTEM → 403). Her biri: owner guard + demo deny + tenant server-side + hasOnlyKeys + resolveFoodForWrite + raw-error hidden.
- `foods/[id]` PATCH/DELETE → SYSTEM write guard eklendi.

## UI (food detail — 5 sekme)
Genel Bilgi (+ **Sistem/Özel rozet**, sistem salt-okunur) · **Besin Değerleri** (100 g için; eksik "—", 0 değil) · **Porsiyonlar** (gram + porsiyon-başı nutrient preview) · **Geleneksel** (thermal/moisture + **disclaimer**: "besin kompozisyonu/klinik değer değildir") · Kaynaklar (mevcut SourcesPanel). Nutrient facts ile geleneksel görsel olarak AYRI.

## Snapshot future contract (KİLİT; tablo yok)
Gelecek meal-plan item = `food_id` (lineage) + **nutrient/portion/gram + external_version SNAPSHOT** (denormalize). Canlı JOIN ile eski plan değiştirilmez → 2027 veri güncellemesi 2026 danışan planını bozmaz.

## Gate sonuçları
food-engine DDL **89/0** · fixture **821/0** · calc **45/0** · knowledge regresyon **110/0** · Class-A **211/0** · tsc **0** · eslint **0** · `git diff --check` temiz. Security harness: anon/expert/admin denial (module gate), demo deny, SYSTEM read-only, foreign-tenant excluded, tenant-body-injection reddi, dup-nutrient/negative/zero-gram/wrong-unit/dup-external CHECK'leri kanıtlandı.

## Sınır
Meal planner / günlük-aylık plan / danışan entegrasyonu / tarif / Word / AI / legacy import / YH = **bu fazda YOK**. Besin motoru gelecekteki öğün motorunun üzerine kurulabilecek şekilde TAM.
