/**
 * DEMO HESABI — ÜCRETLİ SAĞLAYICI POLİTİKASI (D2, owner 2026-11-01). Ağ / DB / ücretli çağrı YOK.
 *
 * CI regresyon listesine (scripts/ci/regression-tests.json) girer. HD transit çözücüsünün davranış testleri
 * (önbellek isabeti / ıskalaması, çağrı sayısı) korunan alanda kalır: scripts/hd-transit/reliability-harness.ts
 * (CI çalıştırıcısının "korunan alan" kuralı gereği orada elle çalıştırılır). Bu dosya korunan alan DIŞINDA,
 * yalnız saf politika + statik denetimle demo hesabının ücretli sağlayıcıya ulaşan yollarının kapalı kaldığını
 * her CI çalıştırmasında doğrular:
 *   A) transitProviderConfigFor: demo → null; demo olmayan / bilinmeyen → yapılandırma AYNEN.
 *   B) GET /api/hd/transit + POST /api/hd/transit/personal yapılandırmayı YALNIZ bu politikadan alır.
 *   C) Diğer ücretli uçlarda demo reddi yerinde (sağlayıcı çağrısından önce): HD grafik, konum araması, değişkenler,
 *      ilişki/penta, kişisel transit, eğitim kurgusal hesap, Numeroloji Klasik; Astroloji + AI/çeviri DEMO_DENIED.
 * Çalıştır: npx tsx scripts/demo-vitrin/provider-policy.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { transitProviderConfigFor } from "../../lib/human-design/transit/demoProviderPolicy";
import { DEMO_DENIED_MODULE_KEYS, resolveModuleAccess } from "../../lib/auth/moduleAccessCore";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const ROOT = path.resolve(__dirname, "..", "..");
const src = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
/** `guard` ifadesi `call` ifadesinden ÖNCE geçiyor mu (ikisi de dosyada var). */
const before = (text: string, guard: RegExp, call: RegExp) => {
  const g = text.search(guard);
  const c = text.search(call);
  return g >= 0 && c >= 0 && g < c;
};

section("A Transit sağlayıcı politikası (saf)");
{
  const cfg = { apiKey: "k", baseUrl: "https://example.invalid" };
  ok(transitProviderConfigFor(true, () => cfg) === null, "demo → yapılandırma null (ücretli çağrı imkânsız)");
  ok(transitProviderConfigFor(false, () => cfg) === cfg, "demo olmayan uzman → yapılandırma AYNEN");
  ok(transitProviderConfigFor(undefined, () => cfg) === cfg, "bilinmeyen (eski çağıran) → yapılandırma AYNEN");
  ok(transitProviderConfigFor(true, () => { throw new Error("okunmamalı"); }) === null, "demo'da yapılandırma hiç OKUNMAZ");
}

section("B Transit uçları yalnız politikayı kullanır (statik)");
{
  const general = src("app/api/hd/transit/route.ts");
  const personal = src("app/api/hd/transit/personal/route.ts");
  ok(/config: transitProviderConfigFor\(guard\.is_demo_account\)/.test(general) && !/readRoxyServerConfig\(/.test(general),
    "GET /api/hd/transit → transitProviderConfigFor(guard.is_demo_account); doğrudan okuma YOK");
  ok(/const config = transitProviderConfigFor\(guard\.is_demo_account\)/.test(personal) && !/readRoxyServerConfig\(/.test(personal),
    "POST /api/hd/transit/personal → aynı politika; doğrudan okuma YOK");
  ok(before(general, /requireModuleAccess\(req, "human_design"\)/, /resolveGeneralTransit\(/), "genel transit: modül kapısı çözücüden önce");
}

section("C Diğer ücretli uçlarda demo reddi sağlayıcıdan ÖNCE (statik)");
{
  const checks: [string, string, RegExp, RegExp][] = [
    ["HD kişisel transit", "lib/human-design/transit/personalTransitService.ts", /if \(ctx\.isDemo\) return fail\(403, "DEMO_READONLY"/, /callTransit\(/],
    ["HD grafik (Roxy bodygraph)", "lib/human-design/api/roxyChartService.ts", /if \(ctx\.isDemo\) \{\s*return fail\(403, "DEMO_READONLY"/, /deps\.callRoxy\(/],
    ["HD konum araması", "app/api/hd/location/search/route.ts", /if \(guard\.is_demo_account\) \{\s*return NextResponse\.json\(\{ ok: false, code: "DEMO_READONLY"/, /searchRoxyLocations\(/],
    ["HD değişkenler / PHS", "lib/human-design/variables/variablesService.ts", /if \(ctx\.isDemo\) return fail\(403, "DEMO_READONLY"/, /callRoxyVariables\(|deps\.call\w*\(/],
    ["HD ilişki / penta", "lib/human-design/relations/relationService.ts", /if \(ctx\.isDemo\) return fail\(403, "DEMO_READONLY"/, /callRoxyConnection\(|deps\.call\w*\(/],
    ["HD eğitim kurgusal hesap", "lib/human-design/education/private/fictionalCompute.ts", /if \(inp\.isDemo\) return fail\(403, "DEMO_READONLY"/, /callRoxyBodygraph\(|deps\.call\w*\(/],
    ["Numeroloji Klasik hesapla (uç)", "app/api/numeroloji-klasik/hesapla/route.ts", /if \(guard\.is_demo_account\) return classicError\("DEMO_READONLY"\)/, /computeClassicResult\(/],
  ];
  for (const [label, file, guard, call] of checks) {
    const text = src(file);
    ok(guard.test(text) && before(text, guard, call), `${label}: demo reddi sağlayıcı çağrısından önce (${file})`);
  }
  const klasik = src("lib/numeroloji-klasik/server/service.ts");
  ok((klasik.match(/if \(ctx\.isDemo\) return classicFail\("DEMO_READONLY"\)/g) ?? []).length >= 2, "Numeroloji Klasik servis: hesap + kayıt yollarında demo reddi (2+)");
  for (const k of ["astrology", "video_ceviri", "ders_notu", "belge_ceviri", "belge_ceviri_ai"]) {
    ok(DEMO_DENIED_MODULE_KEYS.has(k) && resolveModuleAccess("expert", { [k]: true }, k, { isDemo: true }) === false,
      `${k}: bayrak olsa da demo KAPALI (Astroloji motoru / AI-çeviri uçları modül kapısında reddeder)`);
  }
  ok(/if \(guard\.is_demo_account\)/.test(src("lib/auth/requireUser.ts")), "Dijital İçerik AI uçları (requireDigitalContentUser): demo reddi yerinde");
  ok(resolveModuleAccess("expert", { human_design: true }, "human_design", { isDemo: true }) === true,
    "demo HD modülünü GÖRÜR (ücretli yol yalnız politika ile kapalı; görüntüleme sürer)");
}

console.log(`\nDEMO SAĞLAYICI POLİTİKASI: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) {
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
