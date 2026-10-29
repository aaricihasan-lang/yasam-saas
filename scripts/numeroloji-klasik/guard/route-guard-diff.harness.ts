/**
 * Ortak yetki dosyalarındaki eklemelerin MEVCUT davranışı değiştirmediğini kanıtlar.
 *
 * Taban sürüm (8a58ac1a) ile HEAD sürümü routeModuleAccess + moduleRouteRegistry yan yana yüklenir;
 * yeni öneklerin DIŞINDAKİ her yol × her kullanıcı profili için karar birebir aynı olmalı.
 * Taban dosyalar `git show` ile geçici klasöre yazılır (çalışma ağacı değişmez).
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/guard/route-guard-diff.harness.ts
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(__dirname, "../../..");
const BASE = process.env.NUM_KLASIK_BASE ?? "8a58ac1a";
const NEW_PREFIXES = ["/numeroloji-merkezi", "/numeroloji-klasik", "/numeroloji-karsilastirma"];

let pass = 0;
let fail = 0;
const ok = (c: boolean, label: string, detail?: unknown) => {
  if (c) pass++;
  else {
    fail++;
    console.log(`✗ ${label}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
  }
};

async function main(): Promise<void> {
  // Taban dosyayı aynı dizin yapısında geçici kopyaya yaz (göreli @/ importları HEAD'deki ortak modüllere çözülür).
  const tmp = mkdtempSync(path.join(tmpdir(), "numk-route-base-"));
  const baseFile = path.join(tmp, "routeModuleAccess.base.ts");
  const src = execFileSync("git", ["show", `${BASE}:lib/auth/routeModuleAccess.ts`], { cwd: ROOT, encoding: "utf8" });
  // @/ alias'ı yerine mutlak yol: taban dosya HEAD'deki bağımlılıkları kullanır (yalnız kural tablosu karşılaştırılır).
  const abs = (p: string) => path.join(ROOT, p).replace(/\\/g, "/");
  writeFileSync(baseFile, src.replace(/from "@\/(lib\/[^"]+)"/g, (_m, p) => `from "${abs(p)}"`));
  const regTmp = path.join(tmp, "reg");
  mkdirSync(regTmp);
  const regSrc = execFileSync("git", ["show", `${BASE}:lib/auth/moduleRouteRegistry.ts`], { cwd: ROOT, encoding: "utf8" });
  writeFileSync(path.join(regTmp, "moduleRouteRegistry.base.ts"), regSrc.replace(/from "@\/(lib\/[^"]+)"/g, (_m, p) => `from "${abs(p)}"`));

  const base = await import(pathToFileURL(baseFile).href);
  const head = await import(pathToFileURL(path.join(ROOT, "lib/auth/routeModuleAccess.ts")).href);
  const baseReg = await import(pathToFileURL(path.join(regTmp, "moduleRouteRegistry.base.ts")).href);
  const headReg = await import(pathToFileURL(path.join(ROOT, "lib/auth/moduleRouteRegistry.ts")).href);

  // Kanıtın anlamlı olduğunu doğrula: taban kopya gerçekten yeni önekleri tanımıyor, HEAD tanıyor.
  ok(base.findRouteModuleRule("/numeroloji-klasik") === null && head.findRouteModuleRule("/numeroloji-klasik") !== null, "taban kopya gerçekten tabandır (yeni önek yok)");

  const paths = [
    "/", "/numeroloji", "/numeroloji/", "/numeroloji/analiz", "/numeroloji/liste", "/numeroloji/liste/abc", "/numeroloji/bilgi-bankasi",
    "/NUMEROLOJI/Analiz", "/numerolojix", "/numeroloji-test", "/dashboard/numeroloji-test", "/dashboard/clients/1", "/human-design", "/astroloji",
    "/dogaltas", "/dogaltas/kutuphane", "/admin", "/admin/sistem-sagligi/numeroloji", "/life-analysis", "/register", "/video-ceviri", "/yebs",
    "/refleksoloji", "/aromaterapi", "/urun-stok", "/danisan-yolculugu", "/settings", "/numerology", "/numeroloji?x=1",
  ];
  const perms = (o: Record<string, boolean>) => ({ module_permissions: o });
  const users: (Record<string, unknown> | null)[] = [
    null,
    { id: "u1", role: "admin", active: true, approval_status: "approved" },
    { id: "u2", role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium", ...perms({ numerology: true }) },
    { id: "u3", role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium", ...perms({ numeroloji: true }) },
    { id: "u4", role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium", ...perms({ numerology: false, clients: true }) },
    { id: "u5", role: "expert", active: true, approval_status: "approved", ...perms({ numerology: true }) },
    { id: "u6", role: "expert", active: false, approval_status: "approved", package_type: "premium", ...perms({ numerology: true }) },
  ];

  for (const p of paths) {
    ok(JSON.stringify(base.findRouteModuleRule(p)) === JSON.stringify(head.findRouteModuleRule(p)), `kural eşleşmesi aynı: ${p}`, { base: base.findRouteModuleRule(p), head: head.findRouteModuleRule(p) });
    ok(base.isAdminOnlyRoutePath(p) === head.isAdminOnlyRoutePath(p), `admin-only aynı: ${p}`);
    for (const u of users) {
      const b = base.evaluateRouteModuleGuard(p, u);
      const h = head.evaluateRouteModuleGuard(p, u);
      ok(b === h, `karar aynı: ${p} × ${u?.id ?? "anon"}`, { b, h });
      ok(base.canExpertAccessRoutePath(u, p) === head.canExpertAccessRoutePath(u, p), `erişim aynı: ${p} × ${u?.id ?? "anon"}`);
    }
  }
  // Yeni önekler: oturumsuz → deny, numeroloji izni olan uzman → mevcut /numeroloji ile aynı karar.
  for (const np of NEW_PREFIXES) {
    for (const sub of ["", "/", "/x/y"]) {
      const p = `${np}${sub}`;
      ok(JSON.stringify(head.findRouteModuleRule(p)?.keys) === JSON.stringify(["numerology", "numeroloji"]), `yeni önek numeroloji izniyle korunuyor: ${p}`);
      for (const u of users) ok(head.evaluateRouteModuleGuard(p, u) === head.evaluateRouteModuleGuard("/numeroloji", u), `yeni önek kararı /numeroloji ile aynı: ${p} × ${u?.id ?? "anon"}`);
    }
  }
  // Registry: tabandaki her giriş aynen duruyor; tek fark yeni API öneki.
  const b = baseReg.MODULE_ROUTE_PREFIXES as { prefix: string; key: string }[];
  const h = headReg.MODULE_ROUTE_PREFIXES as { prefix: string; key: string }[];
  ok(b.every((x) => h.some((y) => y.prefix === x.prefix && y.key === x.key)), "registry: tabandaki tüm girişler korunuyor");
  const added = h.filter((y) => !b.some((x) => x.prefix === y.prefix));
  ok(added.length === 1 && added[0].prefix === "app/api/numeroloji-klasik" && added[0].key === "numerology", "registry: yalnız app/api/numeroloji-klasik eklendi", added);
  ok(JSON.stringify(baseReg.EXPLICIT_EXCLUDED_ROUTES) === JSON.stringify(headReg.EXPLICIT_EXCLUDED_ROUTES), "registry: istisnalar değişmedi");
  ok(JSON.stringify(baseReg.EXCLUDED_API_PREFIXES) === JSON.stringify(headReg.EXCLUDED_API_PREFIXES), "registry: dışlanan önekler değişmedi");

  console.log(`\nroute-guard-diff: ${pass} ✓ / ${fail} ✗`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
