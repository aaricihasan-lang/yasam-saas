/**
 * BİYOENERJİ FAZ 1 — Güvenlik Sertleştirme Harness'i (statik + davranışsal).
 *
 * KULLANIM: npx tsx scripts/bioenergy-faz1-security-harness.ts
 *
 * Production'a APPLY EDİLMEDEN, migration semantiği + kod taşımaları statik olarak,
 * rate-limit + resourceConfig parity davranışsal olarak doğrulanır. Canlı DB'ye
 * DOKUNMAZ (revoke testi apply sonrasına aittir).
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getBioResource, pickWritableBioFields } from "../lib/biyoenerji/resourceConfig";
import { checkRateLimit, __resetRateLimitForTest } from "../lib/security/rateLimit";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let pass = 0;
let fail = 0;
const ok = (m: string) => { pass++; console.log(`  ✅ ${m}`); };
const no = (m: string) => { fail++; console.error(`  ❌ ${m}`); };
const assert = (cond: boolean, m: string) => (cond ? ok(m) : no(m));

const BIO_TABLES = [
  "bioenergy_sessions",
  "bioenergy_energy_bodies",
  "bioenergy_subconscious_causes",
  "bioenergy_imaginations",
  "bioenergy_symbols",
  "bioenergy_chakras",
];
const IMPORT_RESOURCES = ["symbols", "imaginations", "chakras", "energy-bodies", "subconscious-causes"];
const REPORT_ROUTES = [
  "app/api/biyoenerji/session-report/route.ts",
  "app/api/biyoenerji/energy-body-report/route.ts",
  "app/api/biyoenerji/subconscious-report/route.ts",
  "app/api/biyoenerji/imagination-report/route.ts",
  "app/api/biyoenerji/symbol-report/route.ts",
  "app/api/biyoenerji/chakra-report/route.ts",
];

console.log("\n═══ 1. RLS + Grants migration semantiği ═══");
{
  const m = read("supabase/migrations/20261001000000_bioenergy_lock_anon_authenticated.sql");
  for (const t of BIO_TABLES) assert(m.includes(`'${t}'`), `migration 6 tabloyu kapsar: ${t}`);
  assert(
    /REVOKE ALL PRIVILEGES ON TABLE public\.%I FROM anon, authenticated/.test(m),
    "REVOKE ALL PRIVILEGES ... FROM anon, authenticated var",
  );
  for (const suffix of ["_select_open", "_insert_no_demo", "_update_no_demo", "_delete_no_demo"]) {
    assert(m.includes(suffix), `eski permissive policy kaldırılıyor: *${suffix}`);
  }
  assert(m.includes("ENABLE ROW LEVEL SECURITY"), "RLS ENABLED korunur");
  assert(!/FORCE ROW LEVEL SECURITY/i.test(m), "RLS FORCE durumu DEĞİŞTİRİLMEZ");
  // Yorum satırlarını (-- ...) hariç tut; yalnız çalıştırılabilir SQL üzerinde negatif kontrol.
  const exec = m.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  assert(!/\bGRANT\b/i.test(exec), "çalıştırılan SQL anon/authenticated'a GRANT VERMEZ");
  assert(!/service_role/i.test(exec), "çalıştırılan SQL service_role'a DOKUNMAZ");
  assert(!/postgres/i.test(exec), "çalıştırılan SQL postgres'a DOKUNMAZ");
  assert((exec.match(/\bREVOKE\b/gi) || []).length === 1, "yalnız TEK REVOKE (anon,authenticated) statement'ı");
}

console.log("\n═══ 2. Admin import endpoint (write → service_role) ═══");
{
  const s = read("app/api/admin/biyoenerji/import/route.ts");
  assert(s.includes("verifyAdminRequest"), "verifyAdminRequest ile korunur");
  assert(s.includes("pickWritableBioFields"), "kolon whitelist (pickWritableBioFields) kullanılır");
  assert(/tenant_id:\s*tenantId/.test(s), "tenant_id SUNUCUDA zorlanır (adminId→users.tenant_id)");
  assert(s.includes('.eq("id", adminId)'), "tenant adminId'den çözülür (istemci tenant_id GÜVENİLMEZ)");
  assert(!s.includes("${error.message}") && !/error:\s*error\.message/.test(s), "ham DB error.message istemciye DÖNMEZ");
  assert(s.includes("console.error"), "hata server-side loglanır");
  for (const r of IMPORT_RESOURCES) assert(s.includes(`"${r}"`), `IMPORTABLE kaynağı içerir: ${r}`);
  assert(!s.includes('"sessions"'), "sessions admin-import edilemez (yeni yetenek eklenmez)");
}

console.log("\n═══ 3. Admin workspace sessions read endpoint ═══");
{
  const s = read("app/api/admin/biyoenerji/sessions/route.ts");
  assert(s.includes("verifyAdminRequest"), "verifyAdminRequest ile korunur");
  assert(s.includes("bioenergy_sessions"), "yalnız bioenergy_sessions okur");
  assert(/UUID_RE\.test\(tenantId\)/.test(s), "tenantId uuid doğrulanır");
  assert(/\.eq\("tenant_id", tenantId\)/.test(s), "tenant scope .eq ile bağlanır");
  assert(!s.includes("${error.message}"), "ham DB error.message DÖNMEZ");
}

console.log("\n═══ 4. Toplu-veri: browser publishable insert KALDIRILDI ═══");
{
  const s = read("app/admin/toplu-veri/page.tsx");
  assert(!/supabase\s*\n?\s*\.from\("bioenergy_/.test(s), "supabase.from('bioenergy_*') doğrudan insert YOK");
  assert(!s.includes('.from("bioenergy_symbols")'), "bioenergy_symbols publishable erişimi YOK");
  const usages = (s.match(/insertBioenergyViaApi\(/g) || []).length;
  assert(usages >= 10, `insertBioenergyViaApi 5 kaynak × (batch+single) kullanılır (${usages} çağrı)`);
  assert(s.includes('"/api/admin/biyoenerji/import"'), "yeni service-role import endpoint'i çağrılır");
  for (const r of IMPORT_RESOURCES) assert(s.includes(`insertBioenergyViaApi("${r}"`), `kaynak rerouted: ${r}`);
  // Regresyon: kapsam dışı minerals publishable path'i DEĞİŞMEDEN kalır.
  assert(s.includes('.from("minerals")'), "kapsam dışı minerals publishable path korunur");
  // Ölü kod kaldırıldı.
  assert(!/bioenergy[A-Za-z]*InsertSucceeded/.test(s), "kullanılmayan bioenergy *InsertSucceeded helper'ları kaldırıldı");
}

console.log("\n═══ 5. Admin workspace: bioenergy_sessions publishable SELECT taşındı ═══");
{
  const s = read("app/admin/users/[id]/workspace/bioenergy/page.tsx");
  assert(s.includes("fetchAdminBioSessionCount"), "sessions sayımı admin endpoint'ine taşındı");
  assert(s.includes("fetchAdminBioSessionRows"), "sessions listesi admin endpoint'ine taşındı");
  assert(s.includes('/api/admin/biyoenerji/sessions'), "service-role sessions endpoint'i çağrılır");
  assert(/section\.table === "bioenergy_sessions"/.test(s), "sadece bioenergy_sessions dallanır (legacy 5 tablo değişmez)");
  assert(/meta\.table === "bioenergy_sessions"/.test(s), "liste dalı bioenergy_sessions'a özel");
  // Legacy tablolara publishable SELECT KASITLI korunur (kapsam dışı).
  assert(s.includes(".from(section.table)") && s.includes(".from(meta.table)"), "legacy 5 sekme publishable SELECT'i korunur (kapsam dışı)");
}

console.log("\n═══ 6. DOCX rapor sertleştirme (6 route) ═══");
for (const rp of REPORT_ROUTES) {
  const s = read(rp);
  const name = rp.split("/").slice(-2, -1)[0];
  assert(s.includes(".limit(MAX_EXPORT_RECORDS)"), `${name}: HARD CAP .limit(MAX_EXPORT_RECORDS)`);
  assert(s.includes("reportRateLimit("), `${name}: rate-limit uygulanır`);
  assert(s.includes("capSelectedIds("), `${name}: seçili id tavanı`);
  assert(s.includes("EXPORT_TRUNCATED_NOTE"), `${name}: kırpma notu (sessiz değil)`);
  assert(!s.includes("${error.message}"), `${name}: ham DB error.message SIZMAZ`);
  assert(s.includes("console.error"), `${name}: hata server-side loglanır`);
}

console.log("\n═══ 7. Rate-limit helper davranışı (deterministik) ═══");
{
  __resetRateLimitForTest();
  const t0 = 1_000_000;
  let allowed = 0;
  for (let i = 0; i < 10; i++) if (checkRateLimit("k", 10, 60_000, t0).ok) allowed++;
  assert(allowed === 10, "ilk 10 istek limitte GEÇER");
  const over = checkRateLimit("k", 10, 60_000, t0);
  assert(!over.ok && over.retryAfterSec > 0, "11. istek 429 (retryAfter>0)");
  const afterWindow = checkRateLimit("k", 10, 60_000, t0 + 60_001);
  assert(afterWindow.ok, "pencere dolunca sayaç sıfırlanır");
  const other = checkRateLimit("k2", 10, 60_000, t0);
  assert(other.ok, "farklı anahtar bağımsız kova");
}

console.log("\n═══ 8. resourceConfig write parity (sessiz veri düşürme YOK) ═══");
{
  const expected: Record<string, string[]> = {
    symbols: ["symbol", "title", "category", "meaning", "source"],
    imaginations: ["source_id", "title", "category", "text", "notes", "source"],
    chakras: ["source_uid", "name", "organs", "glands", "color", "stones", "causes", "physical", "mental", "notes"],
    "energy-bodies": ["source_uid", "genel_tanim", "gorevi", "bozulma", "onerilen_taslar", "not_text"],
    "subconscious-causes": ["source_uid", "title", "category", "content", "note_text"],
  };
  for (const [res, cols] of Object.entries(expected)) {
    const cfg = getBioResource(res);
    assert(!!cfg, `getBioResource("${res}") tanımlı`);
    if (cfg) {
      const missing = cols.filter((c) => !cfg.write.includes(c));
      assert(missing.length === 0, `${res}: whitelist tüm iş kolonlarını içerir (eksik: ${missing.join(",") || "yok"})`);
      // İstemci tenant_id/id server tarafından düşürülür — whitelist'te olmamalı.
      assert(!cfg.write.includes("tenant_id") && !cfg.write.includes("id"), `${res}: tenant_id/id whitelist'te YOK`);
    }
  }
  // pickWritableBioFields davranışı: yabancı alan + tenant_id düşürülür.
  const cfg = getBioResource("symbols")!;
  const picked = pickWritableBioFields(cfg, { symbol: "S", title: "T", tenant_id: "hack", evil: 1 } as Record<string, unknown>);
  assert(!("tenant_id" in picked) && !("evil" in picked) && picked.symbol === "S", "pickWritableBioFields tenant_id/yabancı alanı düşürür");
}

console.log("\n═══ 9. Kapsam dışı: admin→uzman transfer DOKUNULMADI ═══");
{
  const s = read("app/api/admin/veri-paylasimi/transfer/route.ts");
  assert(s.includes("verifyAdminRequest") && s.includes("origin_transfer_batch_id"), "transfer route çekirdeği (verifyAdminRequest + provenance) yerinde");
  for (const t of ["bioenergy_symbols", "bioenergy_chakras", "bioenergy_energy_bodies", "bioenergy_subconscious_causes", "bioenergy_imaginations"]) {
    assert(s.includes(t), `transfer REGISTRY bioenergy kaydı korunur: ${t}`);
  }
}

console.log("\n" + "═".repeat(55));
console.log(`  SONUÇ: ${pass} PASS  /  ${fail} FAIL`);
console.log("═".repeat(55) + "\n");
process.exit(fail > 0 ? 1 : 0);
