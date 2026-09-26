/**
 * scripts/cosmic-presale/hacamat-tenant-init.ts
 *
 * §KAJ-P1-04 / B MODELİ — STATİK sözleşme guard'ı:
 *   1) Cosmic GERÇEK modül kapısı (always-on kaldırıldı; route rule eklendi)
 *   2) Hacamat varsayılan kural TEK KAYNAK + tarihsel migration ile drift-yok
 *   3) Seed migration + ensure_hacamat_rules_seeded RPC sözleşmesi (idempotent, race-safe,
 *      no-reseed, RLS-locked)
 *   4) GET route seed entegrasyonu (demo hariç) + §9 "varsayılana dön" ÖZELLİĞİ YOK
 *
 * NOT: CANLI tenant-izolasyon red-team'i (A/B ayrı satır, cross-tenant, anon, forged tenant)
 * migration'ın bir DB'ye UYGULANMASINI gerektirir → staging'de (rapor "NOT VERIFIED (live)").
 * Bu harness kod+SQL sözleşmesini kilitler; canlı kanıt APPLY sonrası eklenir.
 *
 * Çalıştırma: npx tsx scripts/cosmic-presale/hacamat-tenant-init.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_HACAMAT_RULES,
  DEFAULT_HACAMAT_RULE_COUNT,
} from "../../lib/cosmic/hacamatDefaultRules";
import { resolveModuleAccess } from "../../lib/auth/moduleAccessCore";
import { findRouteModuleRule } from "../../lib/auth/routeModuleAccess";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8");
let failures = 0;
const ok = (cond: boolean, msg: string) =>
  cond ? console.log("  ✓ " + msg) : (failures++, console.error("  ✗ " + msg));
const has = (txt: string, re: RegExp, msg: string) => ok(re.test(txt), msg);
const not = (txt: string, re: RegExp, msg: string) => ok(!re.test(txt), msg);

// ── 1) Cosmic GERÇEK modül kapısı ────────────────────────────────────────────
console.log("\n=== Cosmic gerçek modül kapısı (always-on KALDIRILDI) ===");
ok(resolveModuleAccess("admin", {}, "cosmic_calendar") === true, "admin → cosmic erişir");
ok(resolveModuleAccess("expert", { cosmic_calendar: true }, "cosmic_calendar") === true, "izinli expert → cosmic erişir");
ok(resolveModuleAccess("expert", {}, "cosmic_calendar") === false, "izinsiz expert → cosmic REDDEDİLİR (403)");
ok(resolveModuleAccess("expert", { stones: true }, "cosmic_calendar") === false, "cosmic başka izinle AÇILMAZ");

const cosmicRule = findRouteModuleRule("/cosmic-calendar");
ok(cosmicRule !== null && cosmicRule.keys.includes("cosmic_calendar"), "route rule: /cosmic-calendar → cosmic_calendar");
for (const sub of ["/cosmic-calendar/hacamat", "/cosmic-calendar/retro-calendar", "/cosmic-calendar/moon-phases", "/cosmic-calendar/power-days"]) {
  const r = findRouteModuleRule(sub);
  ok(r !== null && r.keys.includes("cosmic_calendar"), `route rule: ${sub} (alt yol) → cosmic_calendar`);
}
// resolver kaynağında cosmic always-on short-circuit KALMAMALI
const core = read("lib/auth/moduleAccessCore.ts");
not(core, /if\s*\(\s*moduleKey\s*===\s*["']cosmic_calendar["']\s*\)\s*return\s+true/, "moduleAccessCore: cosmic always-on short-circuit YOK");
const perms = read("lib/auth/modulePermissions.ts");
not(perms, /if\s*\(\s*key\s*===\s*["']cosmic_calendar["']\s*\)\s*return\s+true/, "modulePermissions: cosmic always-on short-circuit YOK");
// hacamat API'leri gate kapsamında (envanter registry)
const reg = read("lib/auth/moduleRouteRegistry.ts");
has(reg, /prefix:\s*["']app\/api\/hacamat["'],\s*key:\s*["']cosmic_calendar["']/, "registry: app/api/hacamat → cosmic_calendar (gate kapsamı)");

// ── 2) Varsayılan kural TEK KAYNAK + drift-yok ───────────────────────────────
console.log("\n=== Varsayılan 12 kural: tek kaynak + tarihsel migration parity ===");
ok(DEFAULT_HACAMAT_RULE_COUNT === 12, "DEFAULT_HACAMAT_RULES tam 12 kural");
const beforeN = DEFAULT_HACAMAT_RULES.filter((r) => r.category === "before").length;
const afterN = DEFAULT_HACAMAT_RULES.filter((r) => r.category === "after").length;
ok(beforeN === 6 && afterN === 6, `kategori dağılımı 6 before + 6 after (${beforeN}/${afterN})`);
// sort_order kategori içinde 1..6 benzersiz
for (const cat of ["before", "after"] as const) {
  const orders = DEFAULT_HACAMAT_RULES.filter((r) => r.category === cat).map((r) => r.sort_order).sort((a, b) => a - b);
  ok(JSON.stringify(orders) === JSON.stringify([1, 2, 3, 4, 5, 6]), `${cat}: sort_order 1..6 benzersiz`);
}
// DRIFT GUARD: her metin tarihsel ilk-seed migration'ında (20260618) BİREBİR geçmeli.
const origMig = read("supabase/migrations/20260618000000_hacamat_rules.sql");
let parity = true;
for (const r of DEFAULT_HACAMAT_RULES) {
  if (!origMig.includes(r.rule_text)) { parity = false; console.error("    ↳ eksik: " + r.rule_text.slice(0, 40) + "…"); }
}
ok(parity, "12 metin tarihsel migration ile BİREBİR (drift yok)");

// ── 3) Seed migration + RPC sözleşmesi ───────────────────────────────────────
console.log("\n=== Seed migration + ensure_hacamat_rules_seeded RPC ===");
const mig = read("supabase/migrations/20270126000000_hacamat_rules_default_seed.sql");
has(mig, /CREATE TABLE IF NOT EXISTS public\.hacamat_rules_init/i, "hacamat_rules_init tablosu");
has(mig, /tenant_id\s+uuid\s+PRIMARY KEY/i, "tenant_id PRIMARY KEY (tenant başına tek init)");
has(mig, /ENABLE ROW LEVEL SECURITY/i, "init tablosu RLS ENABLE");
has(mig, /REVOKE ALL PRIVILEGES ON TABLE public\.hacamat_rules_init FROM anon, authenticated, PUBLIC/i, "init tablosu anon/authenticated REVOKE");
has(mig, /GRANT ALL PRIVILEGES ON TABLE public\.hacamat_rules_init TO service_role/i, "init tablosu service_role GRANT");
// §7 mevcut rule'lu tenantları initialized backfill (duplicate önle)
has(mig, /INSERT INTO public\.hacamat_rules_init[\s\S]*FROM public\.hacamat_rules[\s\S]*GROUP BY[\s\S]*ON CONFLICT\s*\(tenant_id\)\s*DO NOTHING/i, "§7 backfill: mevcut rule'lu tenant initialized (ON CONFLICT DO NOTHING)");
// RPC atomik + no-reseed
has(mig, /CREATE OR REPLACE FUNCTION public\.ensure_hacamat_rules_seeded\s*\(\s*p_tenant_id\s+uuid\s*,\s*p_rules\s+jsonb\s*\)/i, "RPC imzası (p_tenant_id uuid, p_rules jsonb)");
has(mig, /INSERT INTO public\.hacamat_rules_init[\s\S]*ON CONFLICT\s*\(tenant_id\)\s*DO NOTHING/i, "RPC: init INSERT ON CONFLICT DO NOTHING (race-safe)");
has(mig, /IF NOT FOUND THEN[\s\S]*RETURN false/i, "RPC: zaten init ise RETURN false (no-reseed — §6)");
has(mig, /jsonb_array_elements\s*\(\s*COALESCE\s*\(\s*p_rules/i, "RPC: p_rules jsonb'dan tenant satırları üretilir");
has(mig, /tenant_id,\s*category,\s*rule_text,\s*sort_order/i, "RPC: seed insert tenant_id + alanlar");
has(mig, /SECURITY DEFINER/i, "RPC SECURITY DEFINER");
has(mig, /SET search_path = public, pg_temp/i, "RPC search_path pinned");
has(mig, /REVOKE ALL ON FUNCTION public\.ensure_hacamat_rules_seeded\(uuid, jsonb\) FROM PUBLIC, anon, authenticated/i, "RPC anon/authenticated EXECUTE REVOKE");
has(mig, /GRANT EXECUTE ON FUNCTION public\.ensure_hacamat_rules_seeded\(uuid, jsonb\) TO service_role/i, "RPC service_role EXECUTE GRANT");
// 0-satır → re-seed ANTİPATTERN'i YOK (count=0 ise insert değil; init işareti esas)
not(mig, /count\s*\(\s*\*\s*\)\s*=\s*0/i, "0-satır→reseed antipattern YOK (init işareti esas)");

// ── 4) GET route seed entegrasyonu + §9 restore YOK ──────────────────────────
console.log("\n=== GET seed entegrasyonu + §9 'varsayılana dön' YOK ===");
const getRoute = read("app/api/hacamat/rules/route.ts");
has(getRoute, /from ["']@\/lib\/cosmic\/hacamatDefaultRules["']/, "GET: DEFAULT_HACAMAT_RULES import");
has(getRoute, /\.rpc\(\s*["']ensure_hacamat_rules_seeded["']/, "GET: ensure_hacamat_rules_seeded RPC çağrısı");
has(getRoute, /p_rules:\s*\[\s*\.\.\.DEFAULT_HACAMAT_RULES\s*\]/, "GET: p_rules = DEFAULT_HACAMAT_RULES");
has(getRoute, /if\s*\(\s*!guard\.is_demo_account\s*\)/, "GET: demo hesap seed EDİLMEZ (read-only)");
// §9: bu turda "varsayılanlara dön / geri yükle" ÖZELLİĞİ EKLENMEZ
const page = read("app/cosmic-calendar/hacamat/page.tsx");
not(page, /Varsayılanlara dön|Varsayılanları geri yükle|Kuralları geri yükle|restoreDefaults/i, "§9: 'varsayılana dön' özelliği YOK");
has(page, /confirmingDeleteId/, "UI: silme onayı (yanlış dokunma koruması)");

console.log(`\n=== SONUÇ: ${failures === 0 ? "✅ HACAMAT B-MODELİ + COSMIC GATE SÖZLEŞMESİ KİLİTLİ" : `❌ ${failures} EKSİK`} ===`);
process.exit(failures === 0 ? 0 : 1);
