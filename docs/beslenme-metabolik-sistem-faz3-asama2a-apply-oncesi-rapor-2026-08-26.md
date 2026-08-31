# Beslenme & Metabolik Yaşam Sistemi — FAZ 3 / AŞAMA 2A

## OWNER-ONLY KNOWLEDGE CORE — IMPLEMENTATION (APPLY ÖNCESİ RAPOR)

**Tarih:** 2026-08-26 · **Durum:** dosya-seviyesi implementation TAMAM · **DB UYGULANMADI** · commit/push/PR YOK

- **A. Base:** origin/main `aad349f14ae382127d13c9cc3269602c3e08cca2` (drift 0; collision 0)
- **B. Worktree/branch:** `C:/Users/Mustafa/Desktop/yasam-nutrition-knowledge` · `work/nutrition-knowledge-core` (izole; ana repo'ya dokunulmadı)
- **C. Değişen dosyalar:** MODIFIED(5): `app/page.tsx` (owner-only kart+probe), `lib/auth/moduleAccess.ts` (+beslenme key, non-admin→false), `lib/auth/moduleRouteRegistry.ts` (+app/api/beslenme), `package.json` (+1 harness script), `scripts/beslenme-class-a/ddlHarness.mjs` (count-check Class A range'e scope). NEW: 7 migration + `app/api/beslenme/**` (17 route) + `app/beslenme/**` (11 UI) + `lib/beslenme/**` (3) + `scripts/beslenme-knowledge/` + `scripts/beslenme-legacy-import/`.
- **D. Migration'lar (7):** `20261229000000..000600_nutrition_{foods,topics,topic_sections,topic_foods,sources,topic_sources,food_sources}.sql`
- **E. 7 Class B tablo:** foods (+aliases text[], food_group_id→Class A FK, search_tsv GENERATED), topics (topic_type 6-enum, framework_id→Class A FK, framework-invariant CHECK), topic_sections (composite FK CASCADE, section_key), topic_foods (relation 6-enum, topic CASCADE + food RESTRICT), sources (opsiyonel), topic_sources + food_sources (gerçek-FK link, polimorfik DEĞİL).
- **F. RLS/tenant:** her tablo `tenant_id NOT NULL` + doğuştan-kilitli RLS (REVOKE anon/authenticated/PUBLIC + GRANT service_role) + additive UNIQUE(tenant_id,id) + tenant-safe composite FK + identity guard + set_updated_at reuse. Tenant server-session'dan; client body'den tenant_id ASLA.
- **G. Owner gate:** `lib/beslenme/ownerGuard.ts` = `requireModuleAccess("beslenme")` + `requireMainAdmin(db,userId)` (is_super_admin). 17 route bunu taşır. `/api/beslenme/access` probe.
- **H. Normal admin:** module gate geçer AMA requireMainAdmin → **403**. Kart görünmez (owner probe fail).
- **I. Expert:** resolveModuleAccess beslenme→false → **403**. Kart görünmez (isAdminUser false).
- **J–N. CRUD:** Food CRUD + archive; Topic CRUD (framework invariant); Section CRUD + reorder; Topic↔Food (6 relation); Sources CRUD + topic/food link (opsiyonel — source olmadan save PASS).
- **O. Mizaç:** 4 canonical kod `dem/safra/sovdavi/balgam` (contracts MIZAC_PROFILES, nitelik açıklamalı) — mevcut clients.mizac data contract reuse.
- **P. Kan Grubu:** framework=blood_type, profiller 0/A/B/AB ("0 (Sıfır)").
- **Q. Legacy preview:** `scripts/beslenme-legacy-import/preview.mjs` — 4 kayıt (0/A/AB/B) map DOĞRULANDI (summary→Genel Özet, useful→recommended, bad→neutral, harmful→avoid; DROP harmful_foods_v2/diet_plan/A-stray; A-updated_at int epoch flag). IMPORT-READY; DB write AYRI ONAY.
- **R. Dashboard kartı:** owner-only, default hidden, `checkBeslenmeAccess()` probe ile render (fail-closed).
- **S. /beslenme shell:** hub (5 stat + 4 kart) + Besinler + Rehber + Mizaç + Kan Grubu; owner guard hook (redirect).
- **T. Responsive:** iki-kolon desktop / stacked-drawer mobile; loading/empty/error/denied durumları.
- **U. Static harness:** `beslenme:knowledge:harness` → **89 PASS / 0 FAIL** (A–Z + owner-gate + no-YH/Word/evidence/polymorphic).
- **V. Class A regression:** `beslenme:class-a:harness` → **211 PASS / 0 FAIL** (count-check Class A range'e scope edildi).
- **W. tsc:** Beslenme scope **0 hata** (junction ile ana repo deps üzerinden çalıştırıldı). Tek repo-geneli hata: `lib/refleksoloji/atlasImage.ts` `@resvg/resvg-js` (PRE-EXISTING/environmental optional dep — Beslenme DIŞI, benim değişikliğim değil).
- **X. eslint:** Beslenme scope **exit 0 temiz** (UI'daki 6 hata düzeltildi: 5× set-state-in-effect → runInEffect; 1× unescaped-quote → &quot;).
- **Y. build:** çalıştırılmadı (izole worktree node_modules yok; tsc/eslint junction ile koşuldu, junction temizlendi).
- **Z. git diff --check:** temiz.
- **AA. DB apply = NOT APPLIED** · **AB. commit = YOK** · **AC. push = YOK** · **AD (blocker):** yok. Taşınan borç: reportHelpers SSRF + export rate-limit (Word açılmadan önce). Legacy import DB write ayrı onay.

## VERDICT
**`FAZ 3 / AŞAMA 2A — OWNER-ONLY KNOWLEDGE CORE IMPLEMENTATION PASS · READY FOR DB APPLY GATE`**
(DB uygulanmadı — yalnız dosya-seviyesi. Apply + seed/legacy import ayrı onayla.)
