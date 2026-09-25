/**
 * scripts/cosmic-presale/security-static.mjs
 *
 * §18G/§18H/§28 — Güvenlik REGRESYON GUARD'ı (statik).
 * hacamat_rules izolasyonunun ve cosmic/hacamat API kapılarının kod düzeyinde korunduğunu
 * doğrular (anon-write açığının / admin-only hatasının geri gelmesini önler).
 *
 * NOT: CANLI RLS red-team'i (gerçek anon PostgREST INSERT/DELETE denemeleri) migration'ın
 * bir DB'ye UYGULANMASINI gerektirir → staging'de yapılmalı (rapor "NOT VERIFIED (live)").
 * Bu harness kod sözleşmesini kilitler; canlı kanıt migration apply sonrası eklenir.
 *
 * Çalıştırma: node scripts/cosmic-presale/security-static.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf-8");
let failures = 0;
const has = (txt, re, msg) => (re.test(txt) ? console.log("  ✓ " + msg) : (failures++, console.error("  ✗ " + msg)));
const not = (txt, re, msg) => (!re.test(txt) ? console.log("  ✓ " + msg) : (failures++, console.error("  ✗ " + msg)));

console.log("\n=== Migration: hacamat_rules tenant izolasyonu + RLS kilidi ===");
const mig = read("supabase/migrations/20270125000000_hacamat_rules_tenant_isolation.sql");
has(mig, /ADD COLUMN IF NOT EXISTS tenant_id uuid/i, "tenant_id kolonu eklenir");
has(mig, /ALTER COLUMN tenant_id SET NOT NULL/i, "tenant_id NOT NULL");
has(mig, /ENABLE ROW LEVEL SECURITY/i, "RLS ENABLE");
has(mig, /REVOKE ALL PRIVILEGES ON TABLE public\.hacamat_rules FROM anon, authenticated, PUBLIC/i, "anon/authenticated/PUBLIC REVOKE (anon write açığı KAPALI)");
has(mig, /GRANT ALL PRIVILEGES ON TABLE public\.hacamat_rules TO service_role/i, "service_role GRANT");
has(mig, /is_super_admin|admin@yasamsistemi\.com/i, "sistem sahibi tenant'ı çözümü (backfill hedefi)");
has(mig, /RAISE EXCEPTION/i, "sahiplik çözülemezse fail-closed (tahmin yok)");
// Anti-pattern kontrolü YÜRÜTÜLEN SQL üzerinde (yorum satırları çıkarılır — açıklama amaçlı
// eski açığı alıntılayan `-- ... grant ... to anon` yorumu false-positive üretmesin).
const migSql = mig.split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n");
not(migSql, /grant\s+select\s*,\s*insert[^;]*to\s+anon/i, "anon'a INSERT grant YOK (eski açık geri gelmemiş)");

console.log("\n=== rules/route.ts (GET+POST) ===");
const r = read("app/api/hacamat/rules/route.ts");
has(r, /requireModuleAccess\(req,\s*["']cosmic_calendar["']\)/g, "GET+POST requireModuleAccess(cosmic_calendar)");
not(r, /verifyAdminRequest/, "verifyAdminRequest KULLANILMIYOR (admin-only değil, tenant-scoped)");
has(r, /is_demo_account/, "demo hesap mutasyonu engellenir");
has(r, /tenant_id:\s*tenantId/, "insert tenant_id SESSION'dan (body'den değil)");
has(r, /MAX_RULES_PER_TENANT/, "tenant başına kural tavanı (abuse guard)");

console.log("\n=== rules/[id]/route.ts (PUT+DELETE) ===");
const rid = read("app/api/hacamat/rules/[id]/route.ts");
has(rid, /requireModuleAccess/g, "PUT+DELETE requireModuleAccess");
not(rid, /verifyAdminRequest/, "verifyAdminRequest KULLANILMIYOR");
has(rid, /\.eq\(["']tenant_id["'],\s*tenantId\)/g, "cross-tenant koruması: .eq(tenant_id, tenantId)");
has(rid, /is_demo_account/, "demo mutasyon engeli");

console.log("\n=== report route'ları (pdf + word) ===");
for (const f of ["app/api/hacamat/pdf-report/route.ts", "app/api/hacamat/word-report/route.ts"]) {
  const t = read(f);
  const name = f.includes("pdf") ? "pdf-report" : "word-report";
  has(t, /requireModuleAccess\(request as unknown as NextRequest, ["']cosmic_calendar["']\)/, `${name}: kimlik+modül kapısı`);
  has(t, /validateHacamatReportPayload/, `${name}: payload doğrulaması`);
  has(t, /checkRateLimit/, `${name}: rate limit`);
  has(t, /catch\s*\{[^}]*Rapor oluşturulamadı/s, `${name}: build try/catch (malformed → güvenli 500 değil 4xx)`);
}

console.log("\n=== audit endpoint prod engeli ===");
const audit = read("app/api/cosmic/audit/route.ts");
has(audit, /NODE_ENV === ["']production["']/, "audit: production'da 404 (kimliksiz diagnostic kapalı)");

console.log("\n=== astronomy-engine pin (§15) ===");
const pkg = read("package.json");
has(pkg, /"astronomy-engine":\s*"2\.1\.19"/, "package.json exact pin 2.1.19 (caret YOK)");

console.log(`\n=== SONUÇ: ${failures === 0 ? "✅ GÜVENLİK SÖZLEŞMESİ KİLİTLİ" : `❌ ${failures} EKSİK`} ===`);
process.exit(failures === 0 ? 0 : 1);
