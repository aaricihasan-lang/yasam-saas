# Beslenme — FAZ 5 / Aşama 2: Profesyonel Öğün + Plan Motoru

**Tarih:** 2026-08-29
**Branch:** `work/nutrition-plan-engine` (base: `origin/main` @ c059cd35)
**Durum:** IMPLEMENTATION PASS — PR / PRODUCTION APPLY GATE bekliyor.
**PRODUCTION APPLY YOK · PROD DATA MUTATION YOK · MERGE YOK** (bu tur yalnız kod + yerel doğrulama).

Erişim: **OWNER-ONLY** (`requireBeslenmeOwner` = beslenme modül erişimi + `requireMainAdmin`/`is_super_admin`).
Normal admin/uzman erişimi AÇILMADI. Demo mutation deny korunur.

---

## 1. Kapsam

**VAR:** standalone beslenme planları (1 gün / hafta / aylık date-range), öğünler, yüzlerce
SYSTEM+CUSTOM besin arasından seçim, gram + porsiyon girişi, canlı kcal/protein/karbonhidrat/
yağ/lif (+ ikincil şeker/sodyum/potasyum), günlük kalori hedefi + gün override + öğün hedefi,
copy (öğün/gün/hafta/plan), revizyon (V1/V2), snapshot, archive immutability, responsive editor.

**YOK (bilinçli, sonraki fazlar):** Danışan Yolculuğu entegrasyonu, `client_id`, danışan FK/API/
tab; tarif motoru; Word/PDF; AI/otomatik diyet; supplement; legacy kan-grubu import; Yaşam Hafızası.
**Danışan bağlanması EN SON ayrı faz.** Şema future-additive-ready (Class B → Class C client-private).

---

## 2. Şema (6 additive migration, timestamp 20261231000000–…500)

```
PLAN → DAY → MEAL → ITEM → ITEM_NUTRIENT SNAPSHOT
```

| Tablo | Rol | Kritik kısıt |
|---|---|---|
| `nutrition_plans` | plan kökü | `UNIQUE(tenant_id,id)`; `UNIQUE(tenant_id,plan_family_id,revision_number)`; status draft/active/archived; end≥start; family=plan.id (ilk create) |
| `nutrition_plan_days` | DENSE gün | FK `(tenant_id,plan_id)`→plans CASCADE; `UNIQUE(tenant_id,plan_id,plan_date)`; `UNIQUE(tenant_id,plan_id,id)` |
| `nutrition_plan_meals` | öğün | FK `(tenant_id,plan_id,plan_day_id)`→days CASCADE; `UNIQUE(tenant_id,plan_id,id)`; meal_type NULL/canonical |
| `nutrition_plan_items` | besin satırı | FK `(tenant_id,plan_id,meal_id)`→meals CASCADE; `UNIQUE(tenant_id,id)`; grams>0; ownership system/custom; **food_id fiziksel FK YOK** |
| `nutrition_plan_item_nutrients` | frozen /100 g snapshot | FK `(tenant_id,item_id)`→items CASCADE; `UNIQUE(tenant_id,item_id,nutrient_code)`; **global nutrient/unit FK YOK** |

Her tablo: doğuştan-kilitli RLS (`ENABLE` + `REVOKE anon/authenticated/PUBLIC` + `GRANT service_role`),
identity guard (id/tenant_id/parent/created_at immutable), `set_updated_at()` reuse.

### Parent consistency (bozuk state DB'de İMKANSIZ)
`plan_id` day→meal→item zincirinde taşınır; kompozit FK'ler öğünün plan_id'sini günün plan_id'sine,
item'ın plan_id'sini öğünün plan_id'sine bağlar. "meal plan X + day plan Y" gibi state kurulamaz.

### Snapshot & historical immutability
Client YALNIZ `{foodId, grams}` veya `{foodId, portionId, quantity}` gönderir. Server food'u DB'den
okuyup isim/ownership/nutrient /100 g/porsiyon/provider snapshot'ını KENDİ üretir (`buildItemSnapshot`).
Yazıldıktan sonra canlı food update ya da custom food silinmesi historical planı DEĞİŞTİRMEZ
(item + item_nutrients donmuş kopya). Gram düzenleme frozen /100 g değeri korur; yalnız grams değişip
yeniden hesaplanır. Besin değiştirme (replace) YENİ snapshot üretir (atomik).

`food_id` yalnız soft lineage pointer — fiziksel FK YOK: SYSTEM food farklı sentinel tenant'ta olduğu
ve custom food sonradan silinebileceği için (historical plan bozulmamalı).

---

## 3. Atomik RPC seti (`20261231000500_nutrition_plan_rpcs.sql`)

Hepsi **SECURITY INVOKER**, sabit `search_path`, `REVOKE anon/authenticated/PUBLIC` + `GRANT EXECUTE
service_role`. `tenant_id` istemciden gelmez (API guard verir). Partial state İMKANSIZ.

| Fonksiyon | İş |
|---|---|
| `nutrition_plan_create_with_days` | plan + start..end DENSE gün rows (atomik); family=plan.id, rev=1 |
| `nutrition_plan_sync_range` | genişlet (eksik gün idempotent) / daralt (aralık-dışı DOLU gün → **45011 ZERO deletion**) |
| `nutrition_plan_item_create_or_replace` | item + nutrient snapshot atomik (create + food-replace) |
| `nutrition_plan_item_copy` | item + snapshot hedef öğüne verbatim kopya |
| `nutrition_plan_day_copy` | gün ağacı → boş hedef gün (**45012 TARGET_NOT_EMPTY**) |
| `nutrition_plan_meal_copy` | öğün ağacı → hedef gün (append) |
| `nutrition_plan_week_copy` | span günü date-offset deep copy (aralık **45013**, boş hedef **45012**, atomik) |
| `nutrition_plan_copy` | YENİ AİLE, rev=1, draft; opsiyonel tarih offset |
| `nutrition_plan_revise` | AYNI AİLE, rev=max+1 (race-safe FOR UPDATE), draft |
| `*_copy_meals_into_day`, `*_copy_tree` | internal deep-copy (MATERIALIZED CTE id-remap: gün→öğün→item→nutrient) |

**SQLSTATE:** 45010 archived · 45011 range-has-content · 45012 target-not-empty ·
45013 range-out-of-bounds · 45014 not-found · 45015 bad-input → `mapRpcError` HTTP eşlemesi.

---

## 4. API (16 route · owner-gated)

`GET/POST /plans` · `GET/PATCH/DELETE /plans/[id]` · `POST /plans/[id]/{copy,revise,range,week-copy}` ·
`GET/PATCH /plans/[id]/days/[dayId]` · `POST …/days/[dayId]/{clear,copy}` · `POST …/days/[dayId]/meals` ·
`PATCH/DELETE /plans/[id]/meals/[mealId]` · `POST …/meals/[mealId]/copy` · `POST /plans/[id]/meals/reorder` ·
`POST …/meals/[mealId]/items` · `PATCH(miktar/taşı)/PUT(besin değiştir)/DELETE /plans/[id]/items/[itemId]` ·
`POST …/items/[itemId]/copy`.

Her route: `requireBeslenmeOwner`; mutation → `denyDemoMutation`; `hasOnlyKeys` (mass-assignment); `tenant_id`
gövdeden ASLA (guard `tenantId`); archived → 403; foreign ID fail-closed; ham DB hatası gizli. Item POST/PUT
SNAPSHOT server-authoritative (client `food_name`/kcal gönderemez → 400). Optimistic concurrency: plan PATCH
`expectedUpdatedAt` → stale 409.

---

## 5. UI (`/beslenme/planlar`)

- **Liste:** başlık/tarih/hedef/status/V-rev/son güncelleme; Aç/Kopyala/Yeni Revizyon/Arşivle (2-adım onay).
- **Editör `[id]`:** Gün/Hafta/Ay görünüm; archived salt-okunur banner; meta dialog (title/note/target + range `syncRange`).
- **Gün editörü (mobil-first ana yüzey):** gün nav, günlük totals vs hedef (nötr ton), öğün kartları, quick-create
  (Kahvaltı/Ara/Öğle/Akşam + Özel), gün not/hedef/temizle/kopyala.
- **Öğün kartı:** öğün totals, item satırları, besin ekle, adı/hedef/kopyala/sil/sırala.
- **Food picker:** SYSTEM+CUSTOM arama + gram/porsiyon seçici + canlı `sumNutrients` önizleme (TR ondalık).
- **Item satırı:** miktar/porsiyon düzenle, besini değiştir, çoğalt, taşı, sil.
- Responsive 375–390px, day-first; Hafta/Ay mobilde grid zorlamaz. Hub'a "Beslenme Planları" kartı.

---

## 6. Hesap

Kaynak: item nutrient **snapshot** (frozen /100 g). item katkısı = `grams/100 × amount` (HAM); meal=Σitem,
day=Σmeal. Yuvarlama YALNIZ display (`formatAmount`). Derived total DB'de saklanmaz (dynamic aggregate).
Ana metrik: energy/protein/carbohydrate/total_fat/fiber; ikincil: sugar/sodium/potassium.
Kanıt: Elma 182 g × 52/100g = **94.64 (ham) → 95 kcal (UI)**.

---

## 7. Gate sonuçları (yerel)

| Gate | Sonuç |
|---|---|
| Plan DDL harness (`beslenme:plan-engine:harness`) | **197 PASS · 0 FAIL** |
| Plan calc/totals/target/tarih (`beslenme:plan-engine:calc`) | **28 PASS · 0 FAIL** |
| FAZ 4 food-engine DDL regression | 89 PASS · 0 FAIL |
| FAZ 4 food-engine calc regression | 45 PASS · 0 FAIL |
| Class A DDL | 211 PASS · 0 FAIL |
| Knowledge DDL | 110 PASS · 0 FAIL |
| `tsc --noEmit` (tüm repo) | **0 error** |
| `eslint` (yeni dosyalar) | **0 problem** |
| `git diff --check` | temiz |

---

## 8. Gelecek entegrasyon sınırı

Danışan Yolculuğu, `client_id`, tarif, Word/PDF, AI, YH bu turda YOK. Şema additive genişlemeye
hazır: plan tabloları future `client_id` (nullable, tenant-safe) ile Class C client-private'a
büyütülebilir; snapshot/copy/revision/archived sözleşmeleri değişmez.
