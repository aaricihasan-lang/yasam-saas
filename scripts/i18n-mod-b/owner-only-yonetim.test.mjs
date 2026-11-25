#!/usr/bin/env node
/**
 * I18N-F1-R5 (A26 / I18N-0103) — "Owner'a özel" i18n kapsam dışı listesinin GERÇEK rol davranışına bağlı kalması.
 * scripts/i18n/scope.json ownerOnly'ye eklenen app/dogaltas/kutuphane/yonetim/ yolu ancak şu kod gerçekleri
 * sürdükçe Türkçe (kapsam dışı) kalabilir; biri bozulursa bu test kırmızı olur ve yol yeniden çeviri kapsamına alınmalıdır:
 *   1) Yönetim sayfaları yalnız app/admin/dogaltas-kutuphane/** owner bileşenlerini sarar (kendi veri/çağrısı yok).
 *   2) app/api/admin/dogaltas-kutuphane/** altındaki HER route.ts withOwner ile sarılır.
 *   3) withOwner → requireStoneLibraryOwner → verifyAdminRequest + isStoneLibraryOwner(Row): is_super_admin ∧ role=admin ∧ active ∧ ¬demo.
 *   4) "Kütüphane Yönetimi" sekmesi yalnız ownerWorkspaceHref verildiğinde görünür (uzmana bağlantı yok).
 *   5) Uzman ekranı (kutuphane/page, LibraryClient, [slug], _shared) ownerOnly'de DEĞİL (çeviri kapsamında kalır).
 * Ağ / DB / sır YOK. Çalıştırma: node scripts/i18n-mod-b/owner-only-yonetim.test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const walk = (d) =>
  fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.posix.join(d, e.name)) : [path.posix.join(d, e.name)],
  );
let pass = 0;
let fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; console.log(`  PASS ${m}`); }
  else { fail++; console.error(`  FAIL ${m}${d !== undefined ? " — " + JSON.stringify(d) : ""}`); }
};

const scope = JSON.parse(read("scripts/i18n/scope.json"));
const Y = "app/dogaltas/kutuphane/yonetim/";
ok(scope.ownerOnly.includes(Y) && typeof scope.ownerOnlyReasons[Y] === "string", "scope.json: yönetim yolu ownerOnly + gerekçe");

// 1) sayfalar yalnız owner bileşenlerini sarar
const pages = walk(Y.slice(0, -1)).filter((f) => /\.(tsx|ts)$/.test(f));
const badPages = pages.filter((f) => {
  const s = read(f);
  const imports = [...s.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  const foreign = imports.filter((i) => !/^(next|react)$/.test(i) && !i.startsWith("@/app/admin/dogaltas-kutuphane/") && i !== "../_shared/flag" && !/^next\//.test(i));
  return foreign.length > 0 || /fetch\(|\/api\//.test(s);
});
ok(pages.length >= 6 && badPages.length === 0, `yönetim sayfaları (${pages.length}) yalnız owner bileşenlerini sarar; kendi veri çağrısı yok`, badPages);
ok(/<WorkspaceRoutes>/.test(read(Y + "layout.tsx")), "layout: WorkspaceRoutes (owner adres haritası)");

// 2) tüm owner API uçları withOwner
const routes = walk("app/api/admin/dogaltas-kutuphane").filter((f) => f.endsWith("route.ts"));
const unguarded = routes.filter((f) => {
  const s = read(f);
  const handlers = [...s.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].length;
  const guarded = [...s.matchAll(/return withOwner\(req/g)].length;
  return handlers === 0 || guarded < handlers;
});
ok(routes.length >= 15 && unguarded.length === 0, `owner API uçları (${routes.length}) her metotta withOwner`, unguarded);

// 3) rol kontrolü zinciri
const api = read("lib/stone-library/ownerApi.ts");
const access = read("lib/stone-library/access.ts");
ok(/const gate = await requireStoneLibraryOwner\(req, deps\);\s*if \(!gate\.ok\) return gate\.response;/.test(api), "withOwner → requireStoneLibraryOwner (başarısızsa erken dönüş)");
ok(/verifyAdminRequest\)\(req\)/.test(access) && /if \(!\(await isStoneLibraryOwner\(guard\.db, guard\.adminId\)\)\) return \{ ok: false, response: stoneLibraryNotFound\(\) \}/.test(access),
  "requireStoneLibraryOwner: admin doğrulaması + owner rol kontrolü; değilse tek tip 404");
ok(/row\.is_super_admin === true/.test(access) && /\.toLowerCase\(\) === "admin"/.test(access) && /row\.active === true/.test(access) && /row\.is_demo_account !== true/.test(access),
  "isStoneLibraryOwnerRow: is_super_admin ∧ role=admin ∧ active ∧ demo değil");

// 4) sekme yalnız owner'a
const lib = read("app/dogaltas/kutuphane/LibraryClient.tsx");
ok(/\{ownerWorkspaceHref \? <Link href=\{ownerWorkspaceHref\}>\{t\("managementTab"\)\}<\/Link> : null\}/.test(lib), "Kütüphane Yönetimi sekmesi yalnız owner yoklaması başarılıysa");

// 5) uzman ekranı kapsamda
const expert = ["app/dogaltas/kutuphane/page.tsx", "app/dogaltas/kutuphane/LibraryClient.tsx", "app/dogaltas/kutuphane/[slug]/StoneDetailClient.tsx", "app/dogaltas/kutuphane/_shared/labels.ts"];
ok(expert.every((f) => !scope.ownerOnly.some((p) => f.startsWith(p))), "uzman kütüphane ekranları ownerOnly'de DEĞİL (EN kapsamında)");

console.log(`\n=== owner-only yönetim kapsamı: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
