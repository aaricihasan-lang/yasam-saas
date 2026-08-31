# Beslenme & Metabolik Yaşam Sistemi — FAZ 2 / AŞAMA 2

## CLASS A SYSTEM REFERENCE — IMPLEMENTATION (APPLY ÖNCESİ RAPOR)

**Tarih:** 2026-08-26
**Canonical sözleşme:** `docs/beslenme-metabolik-sistem-faz2-asama1-class-a-preflight-2026-08-26.md`
**Durum:** dosya-seviyesi implementation tamam · **DB'ye UYGULANMADI** · commit/push/PR YOK

---

### A. Base origin/main SHA
`008f5e2dba5b83f95c32e844499c6a6368ad025b` (fetch sonrası; PR #208 merge'li)

### B. Worktree path
`C:/Users/Mustafa/Desktop/yasam-nutrition-class-a` (izole; ana repo `work/private-memory-tur2`'ye dokunulmadı)

### C. Branch
`work/nutrition-class-a-foundation` — doğrudan güncel `origin/main`'den doğdu (reset/rebase/cherry-pick YOK)

### D. Değişen/eklenen dosyalar (yalnız additive; scope-izole)
```
 M package.json                                                     (+1 script satırı)
?? supabase/migrations/20261228000000_nutrition_units.sql
?? supabase/migrations/20261228000100_nutrition_nutrients.sql
?? supabase/migrations/20261228000200_nutrition_allergens.sql
?? supabase/migrations/20261228000300_nutrition_food_groups.sql
?? supabase/migrations/20261228000400_nutrition_traditional_frameworks.sql
?? supabase/migrations/20261228000500_nutrition_formulas.sql
?? supabase/migrations/20261228000600_nutrition_class_a_seed.sql
?? scripts/beslenme-class-a/ddlHarness.mjs
```
İlgisiz modüllere (HD, Kupa/Hacamat, Private Memory, Aromaterapi, admin UI, danışan, YH) **dokunulmadı**.

### E. 7 migration ismi
Timestamp bloğu `20261228000000…000600` — worktree'deki en son migration `20261227000000`'dan **büyük**,
çakışmasız. Sıra: units → nutrients → allergens → food_groups → traditional_frameworks → formulas → seed.

### F. Her migration'ın amacı
| # | Dosya | Amaç |
|---|-------|------|
| 1 | `…000000_nutrition_units` | Ölçü birimi vocab + yalnız aynı-boyut base/factor (self-FK) |
| 2 | `…000100_nutrition_nutrients` | Nutrient vocab; nullable FK→units; aliases text[]; category enum |
| 3 | `…000200_nutrition_allergens` | Alerjen vocab; is_major bayrağı; region-lock yok |
| 4 | `…000300_nutrition_food_groups` | Besin grubu vocab; self-FK parent + no-self-loop |
| 5 | `…000400_nutrition_traditional_frameworks` | Geleneksel çerçeve vocab (profil değil) |
| 6 | `…000500_nutrition_formulas` | Hesaplama METADATA registry (versiyonlu; DB'de exec yok) |
| 7 | `…000600_nutrition_class_a_seed` | Canonical başlangıç referans verisi (düz INSERT, ON CONFLICT yok) |

### G. 6 tablo exact özet
Hepsi **tenant-siz**, `code` lowercase-snake CHECK regex + UNIQUE, identity guard (id/code/created_at immutable;
formulas +version), `set_updated_at()` reuse, `is_active`+`sort_order` lifecycle. `nutrition_units`: unit_type
6-enum + conversion pairing CHECK + self-FK base. `nutrition_nutrients`: nullable default_unit_id FK→units +
category 6-enum + aliases no-NULL CHECK. `nutrition_allergens`: is_major. `nutrition_food_groups`: self-FK
parent + no-self-loop. `nutrition_traditional_frameworks`: yalnız çerçeve. `nutrition_formulas`:
(code,version) UNIQUE + required_inputs/config jsonb (typeof CHECK).

### H. Seed kayıt sayıları
units **13** · nutrients **20** · allergens **14** · food_groups **15** (12 üst + 3 alt) ·
traditional_frameworks **6** · formulas **5**. **Toplam 73 satır.** Kaynak/gerekçe her grup için migration
comment'inde (USDA/INFOODS, Codex/EU FIC, WHO, Mifflin-St Jeor 1990, Harris-Benedict 1984, Ashwell 2012).

### I. RLS / GRANT özeti
Her tablo: `ENABLE ROW LEVEL SECURITY` (policy yok) → `REVOKE ALL FROM anon, authenticated, PUBLIC` →
`REVOKE ALL FROM service_role` → `GRANT SELECT,INSERT,UPDATE,DELETE TO service_role` (**GRANT ALL yok**;
anon/authenticated'a **hiç grant yok** → server-mediated). tenant_id yok → PRIVATE değil.

### J. Identity / lifecycle özeti
id + code + created_at (formulas +version) UPDATE'te immutable (SQLSTATE 23514). Yanlış kayıt = yeni satır +
eskiyi `is_active=false`. Class B→A gerçek FK planı için Class A stabil id/code sağlar; referanslı satır
`ON DELETE RESTRICT` ile silinemez (archive tek lifecycle).

### K. Formula execution safety
DB **formül çalıştırma motoru DEĞİL**. `equation_display`/`config`/`required_inputs` yalnız metadata; hiçbir
migration/plpgsql bunları execute etmez. plpgsql gövdeleri **yalnız** kimlik karşılaştırması + RAISE + RETURN
NEW (harness: 6 gövde, EXECUTE yok, DML yok, equation_display okunmuyor). Gerçek hesaplama ileride
`lib/nutrition/calc/*` allowlist impl (code→impl yoksa fail-closed). Bu turda calc runtime YAZILMADI.

### L. Harness sonuçları
`node scripts/beslenme-class-a/ddlHarness.mjs` → **211 PASS · 0 FAIL** (A–Z + scope). Env-siz, deterministik.
`node --check` → JS syntax OK.

### M. TypeScript sonucu
**N/A** — bu turda hiç `.ts` dosyası eklenmedi (harness `.mjs`, tip yok). tsc scope dışı.

### N. Lint sonucu
İzole worktree'de `node_modules` yok (git worktree paylaşmaz); `npx eslint` yanlış sürüm indirmeye çalıştı →
paket kurulumu bu turun scope'u dışı. Harness `.mjs` mevcut `scripts/*.mjs` harness stilini birebir izler,
yalnız node builtin import eder ve `node --check` + çalıştırma temiz. **Apply gate'inde (ayrı onay) ana repo
deps ile eslint/tsc çalıştırılabilir.**

### O. git diff --check
Temiz — whitespace hatası yok. Yeni dosyalarda trailing whitespace yok. Her migration BEGIN=1/COMMIT=1 dengeli.

### P. DB apply durumu
**NOT APPLIED.** Hiçbir local/remote/prod DB'ye migration uygulanmadı.

### Q. DB write
**ZERO.** Seed RUN edilmedi.

### R. Commit
**YOK.**

### S. Push
**YOK.**

### T. PR
**YOK.**

### U. Açık risk / blocker
- **Blocker YOK.**
- **Apply-time doğrulanacak (düşük risk):** SQL yalnız statik olarak doğrulandı (ortamda DB apply yok).
  `array_position(aliases, NULL) IS NULL` CHECK ve self/subquery-FK'ler apply anında canlı DB harness'iyle
  teyit edilecek (Postgres bu idiomları kabul eder; risk düşük).
- **Taşınan (scope dışı) güvenlik borcu:** `lib/docx/reportHelpers.ts` remote-image SSRF + export rate-limit
  → **Beslenme Word/export açılmadan önce kapatılacak blocker** (bu turda fix YOK).

### V. Diff scope doğrulaması
`git status --short`: yalnız `package.json` (M) + 7 nutrition migration + `scripts/beslenme-class-a/` (??).
Harness "yalnız 7 nutrition migration" + "yalnız 6 canonical tablo CREATE" + "beklenmeyen ek tablo yok" PASS.
İlgisiz worktree/branch'e dokunulmadı.

---

## VERDICT

**`FAZ 2 / AŞAMA 2A — IMPLEMENTATION PASS · READY FOR DB APPLY GATE`**

(Bu, DB'nin uygulandığı anlamına GELMEZ — yalnız dosya-seviyesi implementation hazırdır. DB apply + seed run
ayrı onayla açılacaktır.)
