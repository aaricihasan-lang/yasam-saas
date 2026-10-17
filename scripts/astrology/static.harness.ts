/**
 * ASTROLOJİ AŞAMA 1 — STATİK + KABUK KAPISI harness'i.
 *
 *   • app/api/admin/astroloji/** her route'un İLK işi requireAstrologyOwner + erken dönüş
 *   • "use client" dosyaları sunucu-yalnız astroloji modüllerini / supabase-server'ı import etmez
 *   • sunucu modülleri `import "server-only"` + assertServerOnly taşır
 *   • app/admin/astroloji/layout.tsx: kill switch + katı owner + notFound()
 *   • admin menü bağlantısı yalnız showAstrology (sunucu kararı) ile render edilir
 *   • 4 yetki anahtarı Üye Yönetimi / module_permissions / ModuleGateKey'e EKLENMEDİ (Aşama 1)
 *   • NEXT_PUBLIC_ astroloji/roxy değişkeni yok; ROXY_API_KEY istemci dosyasında geçmez
 *   • Human Design / mühürlü modül dosyalarına dokunulmadı (origin/main'e göre diff)
 *   • isAstrologyShellOwner kararı (owner / admin / kill switch / oturumsuz)
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/static.harness.ts
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { isAstrologyShellOwner } from "@/lib/astrology/access/ownerGate";
import { createFakeClient, createStore } from "./fakeSupabase";

const ROOT = join(__dirname, "..", "..");
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

const SERVER_ONLY_MODULES = [
  "lib/astrology/access/ownerGate",
  "lib/astrology/persistence/repo",
  "lib/astrology/engine/service",
  "lib/astrology/profiles/service",
  "lib/astrology/providers/roxy/client",
  "lib/astrology/birth/location",
  "lib/astrology/http",
  "lib/astrology/kb/service",
  "lib/astrology/analyses/service",
  "lib/astrology/audit/unmapped",
  "lib/astrology/report/service",
  "lib/astrology/report/chartPng",
  "lib/astrology/limits",
];

async function main() {
  const routeFiles = walk(join(ROOT, "app/api/admin/astroloji")).filter((f) => f.endsWith("route.ts"));
  const astroFiles = [...walk(join(ROOT, "lib/astrology")), ...walk(join(ROOT, "app/admin/astroloji")), ...routeFiles];

  await t(`route: ${routeFiles.length} route'un her handler'ı önce requireAstrologyAccess çağırır (alan denetimi ownerOnly)`, () => {
    assert.ok(routeFiles.length >= 7, `route sayısı ${routeFiles.length}`);
    for (const f of routeFiles) {
      const s = readFileSync(f, "utf8");
      const handlers = [...s.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\([^)]*\)[^{]*\{\s*\n([^\n]*)\n([^\n]*)/g)];
      assert.ok(handlers.length > 0, `${rel(f)}: handler yok`);
      const ownerOnly = /\/unmapped\/route\.ts$/.test(rel(f));
      for (const h of handlers) {
        assert.match(h[2], ownerOnly ? /const gate = await requireAstrologyAccess\(req, \{ ownerOnly: true \}\);/ : /const gate = await requireAstrologyAccess\(req\);/, `${rel(f)} ${h[1]}: ilk satır kapı değil`);
        assert.match(h[3], /if \(!gate\.ok\) return gate\.response;/, `${rel(f)} ${h[1]}: erken dönüş yok`);
      }
      // Kapı route'ta DEĞİL tek merkezde (lib/astrology/access/ownerGate.requireAstrologyAccess).
      assert.ok(!/verifyUserRequest|requireModuleAccess|requireAstrologyOwner/.test(s), `${rel(f)}: kapı tek merkezden geçmeli`);
    }
  });

  await t("7C: uzman yüzeyi app/api/astroloji/** admin route'larının BİREBİR aynası (yalnız re-export, kendi mantığı yok)", () => {
    const expert = walk(join(ROOT, "app/api/astroloji")).filter((f) => f.endsWith("route.ts"));
    const adminRel = routeFiles.map((f) => rel(f).replace(/^app\/api\/admin\/astroloji/, "")).sort();
    const expertRel = expert.map((f) => rel(f).replace(/^app\/api\/astroloji/, "")).sort();
    assert.deepEqual(expertRel, adminRel, "uzman / admin route kümeleri aynı olmalı");
    for (const f of expert) {
      const s = readFileSync(f, "utf8").replace(/\r\n/g, "\n").replace(/^\s*\/\/.*$/gm, "").trim();
      const sub = rel(f).replace(/^app\/api\/astroloji/, "").replace(/\/route\.ts$/, "");
      const adminSrc = read(`app/api/admin/astroloji${sub}/route.ts`);
      const methods = [...adminSrc.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
      // 9A-P2-02: admin route `maxDuration` taşıyorsa ayna da AYNI değeri taşır (segment ayarı yeniden dışa aktarılamaz).
      const md = /^export const maxDuration = (\d+);$/m.exec(adminSrc);
      assert.equal(s, `export { ${methods.join(", ")} } from "@/app/api/admin/astroloji${sub}/route";\nexport const runtime = "nodejs";${md ? `\nexport const maxDuration = ${md[1]};` : ""}`, `${rel(f)}: yalnız re-export olmalı`);
    }
    // Kapı yüzeyi yoldan seçer: admin yolu owner-only, uzman yolu modül yetkisi; başka yol 404.
    const g = read("lib/astrology/access/ownerGate.ts");
    assert.match(g, /if \(path === "\/api\/admin\/astroloji" \|\| path\.startsWith\("\/api\/admin\/astroloji\/"\)\) return requireAstrologyOwner\(req, deps\);/);
    assert.match(g, /requireModuleAccess\)\(req, "astrology"\)/);
  });

  await t("istemci: 'use client' dosyaları sunucu-yalnız modülleri / supabase-server'ı import etmez", () => {
    const clientFiles = astroFiles.filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
    assert.ok(clientFiles.length >= 5, `istemci dosyası ${clientFiles.length}`);
    for (const f of clientFiles) {
      const s = readFileSync(f, "utf8");
      const imports = [...s.matchAll(/^import\s+(?!type\b)[^;]*from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
      for (const i of imports) {
        assert.ok(!SERVER_ONLY_MODULES.some((m) => i.endsWith(m.replace(/^lib\//, "")) || i === `@/${m}`), `${rel(f)} → ${i}`);
        assert.ok(!/supabase-server|dbRateLimit|adminGuard|server\/search/.test(i), `${rel(f)} → ${i}`);
        // Aşama 3: sağlayıcı adaptörleri (ham alan adları) ve motor (hash/plan) istemci paketine girmez.
        assert.ok(!/astrology\/providers\/|astrology\/engine\/|astrology\/persistence\//.test(i), `${rel(f)} → ${i} (sunucu tarafı modül)`);
      }
      assert.ok(!/ROXY_API_KEY|SUPABASE_SERVICE_ROLE_KEY/.test(s), `${rel(f)}: gizli env adı istemcide`);
    }
  });

  await t("sunucu: sunucu-yalnız modüller `import \"server-only\"` + assertServerOnly taşır", () => {
    for (const m of SERVER_ONLY_MODULES) {
      const s = read(`${m}.ts`);
      assert.match(s, /^import "server-only";$/m, `${m}: server-only yok`);
      assert.match(s, /assertServerOnly\("lib\/astrology\//, `${m}: assertServerOnly yok`);
    }
  });

  await t("sunucu: kalıcılık okuma kolonları raw_response İÇERMEZ", () => {
    const s = read("lib/astrology/persistence/repo.ts");
    const m = /const RESULT_SAFE_COLUMNS =\s*\n?\s*"([^"]+)"/.exec(s);
    assert.ok(m, "RESULT_SAFE_COLUMNS bulunamadı");
    assert.ok(!m![1].includes("raw_response"));
    const code = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const uses = code.match(/raw_response/g) ?? [];
    assert.equal(uses.length, 1, `raw_response kodda yalnız INSERT'te geçmeli (bulunan ${uses.length})`);
    assert.match(code, /raw_response: r\.raw,/);
  });

  await t("kabuk: app/admin/astroloji/layout.tsx kill switch + katı owner + notFound()", () => {
    const s = read("app/admin/astroloji/layout.tsx");
    assert.match(s, /if \(!isAstrologyModuleEnabled\(\)\) notFound\(\);/);
    assert.match(s, /isAstrologyShellOwner\(db, adminId\)/);
    assert.match(s, /if \(!allowed\) notFound\(\);/);
    assert.ok(!/["']use client["']/.test(s), "layout sunucu bileşeni olmalı");
  });

  await t("menü: admin bağlantısı yalnız sunucu kararı showAstrology ile render edilir", () => {
    const s = read("app/admin/layout.tsx");
    assert.match(s, /showAstrology = await isAstrologyShellOwner\(getServerDb\(\), adminId\)/);
    assert.match(s, /\{showAstrology && \(\s*<Link href="\/admin\/astroloji"/);
    assert.equal((s.match(/\/admin\/astroloji/g) ?? []).length, 1, "astroloji bağlantısı tek ve koşullu olmalı");
  });

  await t("7C yetki: astrology (modül) + astrology_provider_interp (alt-yetki) MEVCUT yetki sistemine eklendi; Premium payload'ında YOK; demo reddi", async () => {
    const mp = await import("@/lib/auth/modulePermissions");
    const um = await import("@/lib/admin/userManagement");
    const core = await import("@/lib/auth/moduleAccessCore");
    const reg = await import("@/lib/auth/moduleRouteRegistry");
    for (const k of ["astrology", "astrology_provider_interp"] as const) {
      assert.ok(mp.MODULE_PERMISSION_KEYS.includes(k), `MODULE_PERMISSION_KEYS: ${k}`);
      assert.equal(mp.DEFAULT_MODULE_PERMISSIONS[k], false, `varsayılan kapalı: ${k}`);
      assert.ok((um.ADMIN_MODULE_UI_KEYS as readonly string[]).includes(k), `Üye Yönetimi: ${k}`);
      assert.equal(um.DEFAULT_ADMIN_MODULE_PERMISSIONS[k], false);
    }
    assert.equal(um.ADMIN_MODULE_KIND.astrology, "module");
    assert.equal(um.ADMIN_MODULE_KIND.astrology_provider_interp, "capability", "Roxy yorumu tek başına erişim açmaz");
    assert.equal(um.ADMIN_MODULE_UI_DESCRIPTIONS.astrology, "Uzmanın Astroloji modülüne erişmesini sağlar.");
    assert.match(String(um.ADMIN_MODULE_UI_DESCRIPTIONS.astrology_provider_interp), /^Uzmanın Astroloji hesaplamalarına ait sistem yorumlarını kullanmasına izin verir\./);
    assert.ok("astrology" in core.MODULE_ALIASES, "ModuleGateKey: astrology");
    assert.ok(!("astrology_provider_interp" in core.MODULE_ALIASES), "alt-yetki gate anahtarı değildir");
    assert.ok(core.DEMO_DENIED_MODULE_KEYS.has("astrology"), "demo hesap Astroloji'yi görmez");
    assert.ok(reg.MODULE_ROUTE_PREFIXES.some((p) => p.prefix === "app/api/astroloji" && p.key === "astrology"));
    assert.ok(!reg.MODULE_ROUTE_PREFIXES.some((p) => p.prefix.startsWith("app/api/admin")), "admin yüzeyi modül-gate'e girmez");
    const prem = mp.buildPremiumModulePermissionsPayload?.() as Record<string, unknown> | undefined;
    if (prem) assert.ok(prem.astrology !== true && prem.astrology_provider_interp !== true, "Premium payload Astroloji açmaz (admin uzman bazında açar)");
    assert.ok(!(mp.PREMIUM_HOME_MODULE_KEYS as string[]).includes("astrology"));
    assert.match(read("lib/auth/routeModuleAccess.ts"), /\{ prefix: "\/astroloji", keys: \["astrology"\] \}/);
    // 2026-10-15 (owner kararı): Gökyüzü Atlası ana panelde ayrı kart DEĞİL; Yaşam Analiz Merkezi'nin içinde. Merkez kartı
    // Atlas yetkili uzmana da görünür; içerideki Atlas kartı yalnız sunucu erişim yoklamasıyla (fail-closed) çizilir.
    const home = read("app/page.tsx");
    assert.ok(!/href: "\/astroloji"/.test(home), "ana panelde ayrı Gökyüzü Atlası kartı olmamalı");
    // 2026-10-17: merkez Kozmik Ajanda'yı da barındırır → ek yetki listesi "astrology"yi İÇERMELİ (yalnız ondan ibaret olmak zorunda değil).
    assert.match(home, /href: "\/life-analysis",\s*\n\s*permissionKey: "numerology",[\s\S]{0,400}extraPermissionKeys: \["astrology"(, "[a-z_]+")*\]/);
    assert.match(home, /item\.extraPermissionKeys\?\.some\(\(k\) => hasModulePermission\(user, k\)\)\) return true;/);
    const la = read("app/life-analysis/page.tsx");
    assert.ok(la.includes("<AtlasCenterCard />"), "Analiz Merkezi Atlas kartını içerir");
    const card = read("app/life-analysis/AtlasCenterCard.tsx");
    assert.ok(/astroFetch<[^>]*>\("\/api\/admin\/astroloji\/access"\)/.test(card) && /if \(!allowed\) return null;/.test(card) && /href="\/astroloji"/.test(card), "kart yalnız erişim yoklaması 200 iken, /astroloji adresine");
    assert.ok(read("app/admin/astroloji/_components/atlas/AtlasHero.tsx").includes('href="/life-analysis"'), "Atlas ana ekranından Analiz Merkezi'ne dönüş");
  });

  await t("7C: paylaşılan sistem dosyalarındaki fark YALNIZ Astroloji satırları (başka modül davranışı değişmez)", () => {
    let base = "";
    try {
      base = execSync("git merge-base HEAD origin/main", { cwd: ROOT, encoding: "utf8" }).trim();
    } catch {
      return;
    }
    const SHARED = [
      "lib/auth/modulePermissions.ts", "lib/auth/moduleAccessCore.ts", "lib/admin/userManagement.ts", "lib/auth/moduleRouteRegistry.ts",
      "lib/auth/routeModuleAccess.ts", "lib/admin/stats/moduleUsageRegistry.ts", "lib/usage/usageTaxonomy.ts",
      "messages/tr/home.json", "messages/en/home.json",
    ];
    for (const f of SHARED) {
      const diff = execSync(`git diff -U0 ${base} -- "${f}"`, { cwd: ROOT, encoding: "utf8" });
      const minus = diff.split(/\r?\n/).filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => l.slice(1).trim());
      const plus = diff.split(/\r?\n/).filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1).trim());
      // Usage360 tip daraltması (Astroloji kullanım kapsamı dışı): ModuleGateKey → UsageTrackedModuleKey eşdeğer sayılır.
      const strip = (x: string) => x.replace(/[,;]\s*$/, "").replace(/UsageTrackedModuleKey/g, "ModuleGateKey").replace(/, type ModuleGateKey \}/, " }").replace("isUsageModuleKey(module) && ", "");
      // 2026-10-15: Astroloji'nin KENDİ satırı (anahtarı astrology_*) metin olarak güncellenebilir (ör. yetki etiketinden sağlayıcı
      // adı kaldırıldı); anahtar aynı kalmalı. Başka modül satırı hâlâ değiştirilemez.
      const astroKey = (x: string) => /^(astrology\w*)\s*:/.exec(x)?.[1] ?? null;
      for (const m of minus) assert.ok(plus.some((p) => strip(p) === strip(m) || (astroKey(m) !== null && astroKey(p) === astroKey(m))), `${f}: silinen/değişen satır: ${m}`);
      for (const p of plus) {
        const ok = minus.some((m) => strip(m) === strip(p)) || /^export type UsageTrackedModuleKey = Exclude<ModuleGateKey, "astrology">;$|^return isUsageModuleKey\(module\) && USAGE_SUB_ENTITIES\[module\]\.includes\(sub\);$|astrolog|astroloji|Astroloji|Astrology|Roxy|owner kuralı|^\/\/|^\*|^\/\*\*$|^\}|^\{|^\],?$|^\),?$|^[a-z_]+: \[\],?$|^(label|key|hasDurableTrace|recordSources|note|href|permissionKey|emoji|Icon|theme|iconWrap|cardBg|border):/.test(p) || p === "";
        assert.ok(ok, `${f}: Astroloji dışı eklenen satır: ${p}`);
      }
    }
  });

  await t("env: NEXT_PUBLIC_ astroloji/roxy değişkeni yok; kill switch tam 'true' karşılaştırması", () => {
    for (const f of astroFiles) assert.ok(!/NEXT_PUBLIC_[A-Z_]*(ASTRO|ROXY)/.test(readFileSync(f, "utf8")), rel(f));
    assert.match(read("lib/astrology/config.ts"), /env\.ASTROLOGY_MODULE_ENABLED === "true"/);
  });

  await t("izolasyon: origin/main'e göre Human Design / mühürlü modül dosyası değişmedi", () => {
    let base = "";
    try {
      base = execSync("git merge-base HEAD origin/main", { cwd: ROOT, encoding: "utf8" }).trim();
    } catch {
      return; // git yoksa atla
    }
    const changed = execSync(`git diff --name-only ${base}`, { cwd: ROOT, encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);
    const untracked = execSync("git ls-files --others --exclude-standard", { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
    const all = [...changed, ...untracked];
    const allowed = [
      /^lib\/astrology\//,
      /^app\/admin\/astroloji\//,
      /^app\/api\/admin\/astroloji\//,
      /^scripts\/astrology\//,
      /^supabase\/migrations\/20271101000000_astrology_foundation\.sql$/,
      /^supabase\/migrations\/20271101000100_astrology_kb_analyses\.sql$/,
      /^supabase\/migrations\/20271101000200_astrology_timing_relationship\.sql$/,
      /^supabase\/migrations\/20271101000300_astrology_owner_isolation\.sql$/,
      /^supabase\/migrations\/20271101000400_astrology_client_list\.sql$/,
      /^supabase\/migrations\/20271101000500_astrology_profile_delete\.sql$/,
      // 9B P2 kapatma: atomik kayıt tavanı + eski Bilgi Bankası kopyalarının güvenli temizliği (yalnız yerel).
      /^supabase\/migrations\/20271101000600_astrology_record_caps\.sql$/,
      /^supabase\/migrations\/20271101000700_astrology_kb_snapshot_cleanup\.sql$/,
      // Analiz Arşivi "A — yalnızca analizleri sil" fonksiyonu.
      /^supabase\/migrations\/20271101000800_astrology_analysis_delete\.sql$/,
      /^app\/admin\/layout\.tsx$/,
      // 2026-10-14: rapor sembol yedek yazı tipleri (Yunanca + astroloji glifleri; DejaVu/Noto alt kümeleri + lisansları).
      /^public\/fonts\/YasamAstroSymbols(A|B)\.ttf$/,
      /^public\/fonts\/YasamAstroSymbolsA-LICENSE\.txt$/,
      /^public\/fonts\/YasamAstroSymbolsB-OFL\.txt$/,
      // next.config.ts: yalnız astroloji rapor route'larının font izleme satırları ("8" testi satır satır denetler).
      /^next\.config\.ts$/,
      /^lib\/backup\/ownerPilotTables\.ts$/,
      /^lib\/backup\/schema\.generated\.ts$/,
      /^scripts\/final-hardening\/backup\.harness\.ts$/,
      /^package\.json$/,
      // Aşama 5: @roxyapi/ui (MIT) tam sürüm bağımlılığı — kilit dosyası değişir.
      /^package-lock\.json$/,
      /^docs\/astrology\//,
      /^ASTROLOGY-PHASE5-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE5-1-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE5-2-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE6-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE6-1-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE6-2-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE7A-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE7B-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE7C-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE8-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE9A-AUDIT\.md$/,
      /^ASTROLOGY-PHASE9A-P2-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE9B-AUDIT\.md$/,
      /^ASTROLOGY-PHASE9B-P2-PROGRESS\.md$/,
      /^ASTROLOGY-PHASE9C-READINESS\.md$/,
      /^ASTROLOGY-FINAL-LOCAL-INTEGRATION\.md$/,
      // Aşama 8: rapor route'larının font dosyası izleme kaydı — fark ayrıca satır satır sınırlanır.
      /^next\.config\.ts$/,
      // Aşama 7C: uzman yüzeyi (sayfa + API aynası) ve mevcut yetki sistemine Astroloji kayıtları.
      // Paylaşılan dosyalar ayrıca "yalnız Astroloji satırları" testiyle satır satır sınırlanır.
      /^app\/astroloji\//,
      /^app\/api\/astroloji\//,
      /^lib\/auth\/modulePermissions\.ts$/,
      /^lib\/auth\/moduleAccessCore\.ts$/,
      /^lib\/admin\/userManagement\.ts$/,
      /^lib\/auth\/moduleRouteRegistry\.ts$/,
      /^lib\/auth\/routeModuleAccess\.ts$/,
      /^lib\/admin\/stats\/moduleUsageRegistry\.ts$/,
      /^lib\/usage\/usageTaxonomy\.ts$/,
      /^app\/page\.tsx$/,
      /^messages\/(tr|en)\/home\.json$/,
      // Aşama 7B: DY durum rozeti — bileşen Astroloji'ye ait; DY sayfasındaki fark ayrıca satır satır denetlenir.
      /^components\/astrology\//,
      /^app\/dashboard\/clients\/\[id\]\/page\.tsx$/,
      // 2026-10-15 (owner kararı): Astroloji Word/PDF her cihazda — ortak mobil/çıktı testleri Astroloji beklentisini
      // HD'den ayırır (HD kuralı aynen korunur; bu iki dosyada yalnız test beklentisi değişir).
      /^scripts\/final-hardening\/output-visibility\.harness\.ts$/,
      /^scripts\/mobile-files\/ui\.harness\.ts$/,
      // 2026-10-15 menü taşıma: Yaşam Analiz Merkezi'ne Gökyüzü Atlası kartı (Numeroloji / HD kartları değişmez).
      /^app\/life-analysis\/AtlasCenterCard\.tsx$/,
      /^app\/life-analysis\/page\.tsx$/,
    ];
    const outside = all.filter((p) => !allowed.some((r) => r.test(p)));
    assert.deepEqual(outside, [], `kapsam dışı değişiklik: ${outside.join(", ")}`);
    assert.ok(!all.some((p) => /^lib\/human-design\/|^app\/api\/hd\/|^app\/human-design\//.test(p)), "HD dosyası değişti");
  });

  await t("2026-10-15 menü taşıma: app/page.tsx farkı YALNIZ Atlas kartının kaldırılması + merkez kartının ek yetkisi (başka kart değişmez)", () => {
    let base = "";
    try {
      base = execSync("git merge-base HEAD origin/main", { cwd: ROOT, encoding: "utf8" }).trim();
    } catch {
      return;
    }
    const diff = execSync(`git diff -U0 ${base} -- app/page.tsx`, { cwd: ROOT, encoding: "utf8" });
    const minus = diff.split(/\r?\n/).filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => l.slice(1).trim());
    const plus = diff.split(/\r?\n/).filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1).trim());
    const removedCard = new Set([
      "// Astroloji (Aşama 7C): yalnız module_permissions.astrology açık uzmana görünür (admin uzman bazında",
      "// açar; varsayılan kapalı). Erişim ayrıca route kuralı + API'de requireAstrologyAccess ile korunur.",
      "{", 'href: "/astroloji",', 'permissionKey: "astrology",', 'emoji: "✨",', "Icon: Sparkles,", "theme: {",
      'iconWrap: "from-violet-600 to-indigo-700",', 'cardBg: "from-violet-100/90 via-indigo-50/95 to-white",', 'border: "border-violet-200/70",', "},",
      "const lockReason = item.anyPermissionKeys",
    ]);
    for (const m of minus) assert.ok(removedCard.has(m), `beklenmeyen silinen satır: ${m}`);
    for (const p of plus) {
      assert.ok(p === "" || /^(\/\/|\/\*\*|\*)|extraPermissionKeys|^const baseLock = item\.anyPermissionKeys$|^const lockReason = baseLock === "permission"/.test(p), `beklenmeyen eklenen satır: ${p}`);
    }
  });

  await t("7B: Danışan Yolculuğu detay sayfasındaki fark YALNIZ Astroloji durum rozeti (dynamic import + tek JSX satırı)", () => {
    let base = "";
    try {
      base = execSync("git merge-base HEAD origin/main", { cwd: ROOT, encoding: "utf8" }).trim();
    } catch {
      return;
    }
    const diff = execSync(`git diff -U0 ${base} -- "app/dashboard/clients/[id]/page.tsx"`, { cwd: ROOT, encoding: "utf8" });
    const lines = diff.split(/\r?\n/).filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l));
    assert.ok(lines.every((l) => l.startsWith("+")), "DY sayfasında satır silindi/değişti");
    const allowedLines = [
      /^\+\/\/ Astroloji Aşama 7B: yalnız durum rozeti/,
      /^\+const AstrologyClientStatus = dynamic\(\(\) => import\("@\/components\/astrology\/AstrologyClientStatus"\), \{ ssr: false \}\);$/,
      /^\+\s*<AstrologyClientStatus clientId=\{client\.id\} \/>$/,
    ];
    assert.ok(lines.length <= 3 && lines.every((l) => allowedLines.some((r) => r.test(l))), `beklenmeyen DY farkı:\n${lines.join("\n")}`);
  });

  await t("8: next.config.ts farkı YALNIZ Astroloji rapor route'larının (tekli + toplu) font izleme satırları (+ açıklama)", () => {
    let base = "";
    try {
      base = execSync("git merge-base HEAD origin/main", { cwd: ROOT, encoding: "utf8" }).trim();
    } catch {
      return;
    }
    const diff = execSync(`git diff -U0 ${base} -- next.config.ts`, { cwd: ROOT, encoding: "utf8" });
    const lines = diff.split(/\r?\n/).filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l));
    // 2026-10-14: astroloji rapor satırlarının yeni biçimi (Geist + sembol yedek fontları). Eski Geist-yalnız satırın
    // yerini alması YALNIZ bu dört route (+ açıklama) için kabul edilir; başka her silme/değişiklik FAIL.
    const ROUTES = ["/api/admin/astroloji/analyses/[id]/report", "/api/astroloji/analyses/[id]/report", "/api/admin/astroloji/analyses/report", "/api/astroloji/analyses/report"];
    const FONT_OLD = '["./public/fonts/Geist-Regular.ttf"],';
    const FONT_NEW = '["./public/fonts/Geist-Regular.ttf", "./public/fonts/YasamAstroSymbolsA.ttf", "./public/fonts/YasamAstroSymbolsB.ttf"],';
    const isRoute = (l: string, sign: "-" | "+", fonts: string) => ROUTES.some((r) => l.replace(/^[+-]\s*/, "") === `"${r}": ${fonts}` && l.startsWith(sign));
    const COMMENT_OLD = "// Astroloji Word/PDF raporu: PDF fontu + çark PNG'si (resvg) aynı Geist TTF'yi fs ile okur.";
    const COMMENT_NEW = "// Astroloji Word/PDF raporu: PDF fontu + sembol yedek fontları (Yunanca + astroloji glifleri; 2026-10-14) + çark PNG'si (resvg) aynı Geist TTF'yi fs ile okur.";
    const removed = lines.filter((l) => l.startsWith("-"));
    if (removed.length > 0) {
      assert.ok(removed.every((l) => l.replace(/^-\s*/, "") === COMMENT_OLD || isRoute(l, "-", FONT_OLD)), `next.config.ts beklenmeyen satır silindi/değişti:\n${removed.join("\n")}`);
      const added = lines.filter((l) => l.startsWith("+"));
      assert.ok(added.every((l) => l.replace(/^\+\s*/, "") === COMMENT_NEW || isRoute(l, "+", FONT_NEW)), `next.config.ts beklenmeyen eklenen satır:\n${added.join("\n")}`);
      assert.equal(added.length, removed.length, "satır sayısı korunmalı (yalnız 4 route + açıklama güncellendi)");
      return;
    }
    assert.ok(lines.every((l) => l.startsWith("+")), "next.config.ts satır silindi/değişti");
    const allowedLines = [
      /^\+\s*\/\/ Astroloji Word\/PDF raporu: PDF fontu \+ çark PNG'si \(resvg\) aynı Geist TTF'yi fs ile okur\.$/,
      /^\+\s*"\/api\/admin\/astroloji\/analyses\/\[id\]\/report": \["\.\/public\/fonts\/Geist-Regular\.ttf"\],$/,
      /^\+\s*"\/api\/astroloji\/analyses\/\[id\]\/report": \["\.\/public\/fonts\/Geist-Regular\.ttf"\],$/,
      // UAT 2. tur (madde L): seçili / tüm analizler toplu rapor ucu (admin + uzman aynası).
      /^\+\s*"\/api\/admin\/astroloji\/analyses\/report": \["\.\/public\/fonts\/Geist-Regular\.ttf"\],$/,
      /^\+\s*"\/api\/astroloji\/analyses\/report": \["\.\/public\/fonts\/Geist-Regular\.ttf"\],$/,
    ];
    assert.ok(lines.length <= 5 && lines.every((l) => allowedLines.some((r) => r.test(l))), `beklenmeyen next.config farkı:\n${lines.join("\n")}`);
  });

  await t("7C: DY durum rozeti yalnız durum ucunu çağırır (owner → admin ucu, uzman → uzman ucu), iç modül içe aktarmaz, içerik göstermez", () => {
    const s = readFileSync(join(ROOT, "components/astrology/AstrologyClientStatus.tsx"), "utf8");
    const code = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const urls = [...code.matchAll(/`(\/api\/[^`]+)`/g)].map((m) => m[1]).sort();
    assert.deepEqual(urls, ["/api/admin/astroloji/${q}", "/api/astroloji/${q}"]);
    assert.match(code, /const q = `client-status\?clientId=\$\{encodeURIComponent\(clientId\)\}`;/);
    assert.equal((code.match(/fetch\(/g) ?? []).length, 1);
    assert.ok(!/from "@\/lib\/astrology|from "@\/app\/admin|server-only/.test(s), "durum rozeti iç modül içe aktarıyor");
    assert.match(code, /if \(!isAdmin && \(user\.is_demo_account === true \|\| perms\?\.astrology !== true\)\) return;/, "izni görünmeyen uzman / demo istek atmamalı");
    assert.ok(!/astrology_provider_interp/.test(code), "rozet Roxy yorum alt-yetkisine bağlı değildir");
    assert.ok(!/interpretation|technical|kbMatches|notes/.test(code), "rozet analiz içeriğine dokunuyor");
  });

  await t("kabuk kararı: owner → true; owner olmayan admin / oturumsuz → false; kill switch kapalı → DB'ye gitmeden false", async () => {
    const OWNER = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
    const ADMIN = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
    const store = createStore({
      users: [
        { id: OWNER, role: "admin", active: true, is_super_admin: true, is_demo_account: false, tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
        { id: ADMIN, role: "admin", active: true, is_super_admin: false, is_demo_account: false, tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      ],
    });
    const db = createFakeClient(store);
    const on = { ASTROLOGY_MODULE_ENABLED: "true" } as unknown as NodeJS.ProcessEnv;
    assert.equal(await isAstrologyShellOwner(db, OWNER, on), true);
    assert.equal(await isAstrologyShellOwner(db, ADMIN, on), false);
    assert.equal(await isAstrologyShellOwner(db, null, on), false);
    const n = store.log.length;
    assert.equal(await isAstrologyShellOwner(db, OWNER, {} as unknown as NodeJS.ProcessEnv), false);
    assert.equal(store.log.length, n, "kill switch kapalıyken DB sorgusu");
  });

  console.log(`\nastrology static harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}

void main().catch((e) => {
  console.error("static harness çöktü:", e);
  process.exit(1);
});
