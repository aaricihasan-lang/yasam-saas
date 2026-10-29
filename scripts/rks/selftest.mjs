#!/usr/bin/env node
/**
 * RKS-3 öz-test — kapının kendisini SENTETİK senaryolarla doğrular (uygulama dosyalarına dokunmaz).
 *   1) Seçim mantığı (plan): modül/ortak kütüphane/kritik/kapsam/assertion/zayıflatma kararları.
 *   2) Karar mantığı (judge + gerçek alt süreç): geçici dizinde üretilen sahte test betikleri
 *      net-guard altında çalıştırılır (PASS, FAIL, sıfır assertion, özet yok, çökme, ATLANDI,
 *      ağ ihlali, bilinen FAIL, süresi geçmiş bilinen FAIL).
 *   3) Uçtan uca: run.mjs sentetik planla çağrılır; çıkış kodu doğrulanır.
 * Çalıştır: node scripts/rks/selftest.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, forbiddenReason, readJson } from "./lib/common.mjs";
import { judge, runTest } from "./lib/exec.mjs";
import { LABELS, plan } from "./select.mjs";

let pass = 0;
let fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  ✓ ${m}`); } else { fail++; console.log(`  ✗ ${m}`); } };

// ───────────── 1) Seçim mantığı ─────────────
const T = (id, file, moduller, calistiran = "rks3", minPass = 5) => ({ id, file, sinif: "A", moduller, calistiran, minPass });
const inv = {
  tests: [
    T("refleks-a", "scripts/s/refleks-a.harness.ts", ["refleksoloji"]),
    T("dy-a", "scripts/s/dy-a.harness.ts", ["danisan-yolculugu"]),
    T("stok-rks2", "scripts/s/stok.harness.ts", ["urun-stok"], "rks2"),
    T("auth-asama1", "scripts/s/auth.harness.ts", [], "asama1"),
    T("bio-a", "scripts/s/bio.harness.ts", ["biyoenerji"]),
  ],
};
const fps = new Map([
  ["scripts/s/refleks-a.harness.ts", new Set(["scripts/s/refleks-a.harness.ts", "lib/refleksoloji/x.ts", "lib/http/apiError.ts"])],
  ["scripts/s/dy-a.harness.ts", new Set(["scripts/s/dy-a.harness.ts", "app/api/clients/route.ts", "lib/http/apiError.ts"])],
  ["scripts/s/stok.harness.ts", new Set(["scripts/s/stok.harness.ts", "lib/urun-stok/salesApi.ts"])],
  ["scripts/s/auth.harness.ts", new Set(["scripts/s/auth.harness.ts", "lib/auth/userGuard.ts"])],
  ["scripts/s/bio.harness.ts", new Set(["scripts/s/bio.harness.ts", "lib/bioenergy/y.ts"])],
]);
const cfg = {
  modules: readJson("scripts/rks/modules.json"),
  inventory: inv,
  known: { kayitlar: [] },
  legacy: { prs: [{ numara: 100 }] },
};
const P = (files, pr = null, extra = {}) =>
  plan({ changed: files.map((f) => (typeof f === "string" ? { status: "M", file: f } : f)), cfg, footprints: fps, pr, ...extra });
const ids = (p) => p.secilen.map((t) => t.id).sort().join(",");
const scoped = (globs, more = {}) => ({ number: 200, body: "```rks-kapsam\n" + globs.join("\n") + "\n```", labels: [], ...more });

console.log("[1] Seçim mantığı");
let p = P(["app/refleksoloji/page.tsx"], scoped(["app/refleksoloji/**"]));
ok(ids(p) === "refleks-a" && !p.errors.length, `Yalnız Refleksoloji dosyası → yalnız Refleksoloji testi (${ids(p)})`);
ok(p.dosyalar[0].durum === "MODUL-TESTI-VAR-DOGRUDAN-KAPSAM-YOK", "Testin import etmediği sayfa 'doğrudan kapsam yok' olarak raporlanır (sahte güvence yok)");
p = P(["app/api/clients/route.ts"], scoped(["app/api/clients/**"]));
ok(ids(p) === "dy-a" && p.dosyalar[0].durum === "KORUNUYOR", `Yalnız Danışan Yolculuğu dosyası → DY testi, KORUNUYOR (${ids(p)})`);
p = P(["lib/urun-stok/salesApi.ts"], scoped(["lib/urun-stok/**"]));
ok(p.secilen.length === 0 && p.mevcutAdimlardaKosan.some((t) => t.id === "stok-rks2" && t.calistiran === "rks2"), "Satış/stok dosyası → RKS-2 adımındaki testler kapsıyor (yeniden koşulmaz, raporlanır)");
p = P(["lib/http/apiError.ts"], scoped(["lib/http/**"]));
ok(ids(p) === "dy-a,refleks-a", `Ortak kütüphane → import eden BÜTÜN modüllerin testleri (${ids(p)})`);
p = P(["lib/auth/userGuard.ts"], scoped(["lib/auth/**"]));
ok(!p.errors.length && p.mevcutAdimlardaKosan.some((t) => t.id === "auth-asama1"), "Kritik kimlik dosyası test ile kapsanıyorsa geçer");
p = P(["lib/auth/yeniDosya.ts"], scoped(["lib/auth/**"]));
ok(p.errors.some((e) => e.includes("Kritik dosya")), "Eşlenmemiş (kapsanmayan) kritik dosya → FAIL");
p = P(["lib/auth/yeniDosya.ts"], scoped(["lib/auth/**"], { labels: [{ name: LABELS.kritik }] }));
ok(!p.errors.length && p.warnings.some((w) => w.includes(LABELS.kritik)), "Kapsanmayan kritik dosya + Owner etiketi → uyarı ile geçer");
p = P(["app/refleksoloji/page.tsx", "app/beslenme/page.tsx"], scoped(["app/refleksoloji/**"]));
ok(p.errors.some((e) => e.includes("İzinli kapsam dışında") && e.includes("app/beslenme/page.tsx")), "İzin dışı dosya değişikliği → FAIL");
p = P(["app/refleksoloji/page.tsx"], { number: 201, body: "kapsam yok", labels: [] });
ok(p.errors.some((e) => e.includes("rks-kapsam")), "Yeni PR'da kapsam bildirimi yok → FAIL");
p = P(["app/refleksoloji/page.tsx"], { number: 100, body: "eski PR", labels: [] });
ok(!p.errors.length && p.kapsam.durum === "ESKI-PR-UYARI", "Eski açık PR (legacy) kapsam bildirimi yok → yalnız uyarı (kilitlenmez)");
p = P(["app/refleksoloji/page.tsx", "lib/auth/yeniDosya.ts"], { number: 100, body: "", labels: [] });
ok(p.errors.some((e) => e.includes("Kritik dosya")), "Eski PR'a da kritik-korumasız denetimi AYNEN uygulanır");
p = P(["package.json"], scoped(["package.json"]));
ok(p.genis && ids(p) === "bio-a,dy-a,refleks-a", "Geniş kritik (package.json) → bütün RKS-3 A testleri");
p = P(["app/kupa/page.tsx"], scoped(["app/kupa/**"]));
ok(p.dosyalar[0].durum === "KORUMASIZ" && p.secilen.length === 0, "Testi olmayan modül dosyası KORUMASIZ olarak listelenir");
p = P(["app/human-design/page.tsx"], scoped(["app/human-design/**"]));
ok(p.dosyalar[0].durum === "RKS-DISI-KORUNAN-ALAN" && p.secilen.length === 0, "Korunan alan (HD) → RKS dışı, test çalıştırılmaz");
const base = { "scripts/s/refleks-a.harness.ts": "ok(1);ok(2);ok(3);" };
p = P(["scripts/s/refleks-a.harness.ts"], scoped(["scripts/s/**"]), { baseText: (f) => base[f] ?? null, headText: () => "ok(1);" });
ok(p.errors.some((e) => e.includes("assertion azalması")), "Test dosyasında assertion azalması → FAIL");
p = P(["scripts/s/refleks-a.harness.ts"], scoped(["scripts/s/**"], { labels: [LABELS.assertion] }), { baseText: (f) => base[f] ?? null, headText: () => "ok(1);" });
ok(!p.errors.length, "Assertion azalması + Owner etiketi → geçer");
const baseInv = JSON.stringify({ tests: [{ ...inv.tests[0], minPass: 9 }] });
p = P(["scripts/rks/inventory.json"], scoped(["scripts/rks/**"]), { baseText: (f) => (f === "scripts/rks/inventory.json" ? baseInv : null), headText: () => null });
ok(p.errors.some((e) => e.includes("minPass düşürüldü")), "Envanterde alt sınır düşürme (zayıflatma) → FAIL");
const ciB = "      - name: TypeScript\n      - name: Build\n          s1-pg 22\n";
p = P([".github/workflows/ci.yml"], scoped([".github/**"]), { baseText: (f) => (f.endsWith("ci.yml") ? ciB : null), headText: (f) => (f.endsWith("ci.yml") ? "      - name: TypeScript\n          s1-pg 10\n" : null) });
ok(p.errors.some((e) => e.includes("CI adımı kaldırıldı")) && p.errors.some((e) => e.includes("RKS-2 alt sınırı")), "CI adımı silme ve RKS-2 alt sınırı düşürme → FAIL");

// ───────────── 2) Karar mantığı (gerçek alt süreç + net-guard) ─────────────
console.log("[2] Karar mantığı (sahte test betikleri, gerçek alt süreç)");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rks-selftest-"));
const mk = (name, body) => { const f = path.join(dir, name); fs.writeFileSync(f, body); return { id: name, file: f, cmd: ["node", f], minPass: 5, timeoutSec: 60 }; };
const cases = [
  [mk("pass.mjs", `console.log("5 PASS / 0 FAIL")`), "PASS"],
  [mk("fail.mjs", `console.log("4 PASS / 1 FAIL"); process.exit(1)`), "YENI-FAIL"],
  [mk("zero.mjs", `console.log("0 PASS / 0 FAIL")`), "YENI-FAIL"],
  [mk("nosummary.mjs", `console.log("bitti")`), "SAYILAMADI"],
  [mk("crash.mjs", `throw new Error("kurulum hatası")`), "ALTYAPI"],
  [mk("skip.mjs", `console.log("[ATLANDI] PostgREST yok"); console.log("5 PASS / 0 FAIL")`), "ATLANDI"],
  [mk("net.mjs", `await fetch("https://example.com").catch(()=>{}); console.log("5 PASS / 0 FAIL")`), "AG-IHLALI"],
  [mk("exitcode.mjs", `console.log("5 PASS / 0 FAIL"); process.exit(3)`), "YENI-FAIL"],
];
for (const [e, want] of cases) {
  const r = await runTest(e);
  const j = judge(e, r, null);
  ok(j.durum === want && j.ok === (want === "PASS"), `${e.id}: beklenen ${want}, gerçek ${j.durum} (${j.neden})`);
}
const kn = mk("known.mjs", `console.log("5 PASS / 1 FAIL"); process.exit(1)`);
let r = await runTest(kn);
ok(judge(kn, r, { maxFail: 1, neden: "test", sonGecerlilik: "2999-01-01" }).durum === "BILINEN-FAIL", "Daha önce bilinen FAIL (kayıtlı, süreli) → BILINEN-FAIL, geçer");
ok(judge(kn, r, { maxFail: 1, neden: "test", sonGecerlilik: "2000-01-01" }).durum === "YENI-FAIL", "Süresi geçmiş bilinen FAIL → YENI-FAIL");
const kn2 = mk("known2.mjs", `console.log("5 PASS / 2 FAIL"); process.exit(1)`);
r = await runTest(kn2);
ok(judge(kn2, r, { maxFail: 1, neden: "test", sonGecerlilik: "2999-01-01" }).durum === "YENI-FAIL", "Bilinen FAIL sayısı aşıldı (yeni FAIL) → YENI-FAIL");

// ───────────── 3) Uçtan uca run.mjs ─────────────
console.log("[3] Uçtan uca run.mjs");
const planFile = path.join(dir, "plan.json");
const basePlan = { genis: false, dosyalar: [], mevcutAdimlardaKosan: [], kapsam: { durum: "UYGUN" }, errors: [], warnings: [] };
const runPlan = (secilen, extra = {}) => {
  fs.writeFileSync(planFile, JSON.stringify({ ...basePlan, secilen, ...extra }));
  return spawnSync(process.execPath, [path.join(ROOT, "scripts/rks/run.mjs"), "--plan", planFile], { cwd: ROOT, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } }).status;
};
ok(runPlan([cases[0][0]]) === 0, "run.mjs: geçen test → çıkış 0");
ok(runPlan([cases[0][0], cases[1][0]]) === 1, "run.mjs: bir test FAIL → çıkış 1 (checks kırmızı)");
ok(runPlan([cases[2][0]]) === 1, "run.mjs: sıfır assertion → çıkış 1");
ok(runPlan([], { errors: ["İzinli kapsam dışında değişen dosya: x"] }) === 1, "run.mjs: politika hatası (test yok) → çıkış 1");

// ───────────── 4) Sıfır test politikası (normal modül) ─────────────
console.log("[4] Sıfır test politikası");
p = P(["app/kupa/page.tsx"], scoped(["app/kupa/**"]));
ok(p.errors.some((e) => e.includes("testi OLMAYAN") && e.includes("app/kupa/page.tsx")), "Yeni PR: testi olmayan normal modül dosyası (KORUMASIZ) → FAIL");
p = P(["app/kupa/page.tsx"], scoped(["app/kupa/**"], { labels: [{ name: LABELS.korumasiz }] }));
ok(!p.errors.length && p.warnings.some((w) => w.includes(LABELS.korumasiz) && w.includes("doğrulanamaz")), "KORUMASIZ + açık kabul etiketi → uyarıyla geçer (etiketin sahibi doğrulanamaz diye yazılır)");
p = P(["app/kupa/page.tsx"], { number: 100, body: "", labels: [] });
ok(!p.errors.length && p.warnings.some((w) => w.includes("testi OLMAYAN")), "Eski PR (legacy): KORUMASIZ → yalnız uyarı (kilitlenmez)");
p = P(["app/kupa/page.tsx"], null);
ok(!p.errors.length && p.warnings.some((w) => w.includes("main push")), "Main push: KORUMASIZ → rapor (merge sonrası engel yok)");
p = P(["lib/yeniOrtakArac.ts"], scoped(["lib/**"]));
ok(p.dosyalar[0].durum === "HARITASIZ" && p.errors.some((e) => e.includes("HARITASIZ")), "Yeni PR: haritada olmayan kod dosyası (HARITASIZ) → FAIL");
p = P(["docs/not.md"], scoped(["docs/**"]));
ok(!p.errors.length && p.dosyalar[0].durum === "DOKUMAN-VARLIK", "Doküman/görsel değişikliği → sıfır test FAIL'i yok");
p = P(["app/refleksoloji/page.tsx"], scoped(["app/refleksoloji/**"]));
ok(!p.errors.length && p.dolayliKapsam.some((d) => d.file === "app/refleksoloji/page.tsx"), "Modül testi var, dosya doğrudan test edilmiyor → AYRI listede (korunuyor sayılmaz)");
p = P(["app/human-design/page.tsx"], scoped(["app/human-design/**"]));
ok(!p.errors.length && p.secilen.length === 0, "Korunan alan (HD) → sıfır-test FAIL'i yok, test çalıştırılmaz");
ok(/Owner onayı DEĞİLDİR/.test(p.guvence.kapsamBildirimi) && /Owner onayı DEĞİLDİR/.test(p.guvence.etiketler), "Planda güvence düzeyi: kapsam bloğu ve etiketler Owner onayı DEĞİL");
const fpsOwn = new Map([...fps, ["scripts/s/hd-owner.harness.ts", new Set(["scripts/s/hd-owner.harness.ts", "lib/x/ortak.ts"])]]);
const cfgOwn = { ...cfg, inventory: { tests: [...inv.tests, { id: "hd-owner", file: "scripts/s/hd-owner.harness.ts", sinif: "B-OWNER", moduller: ["human-design"] }] } };
p = plan({ changed: [{ status: "M", file: "lib/x/ortak.ts" }], cfg: cfgOwn, footprints: fpsOwn, pr: scoped(["lib/**"]) });
ok(p.secilen.length === 0 && !p.mevcutAdimlardaKosan.length, "B-OWNER testi dosyayı import etse bile ASLA seçilmez");

// ───────────── 5) Çalıştırma yasağı kanıtı (B-OWNER / C / korunan / ertelenen) ─────────────
console.log("[5] Çalıştırma yasağı");
const realInv = readJson("scripts/rks/inventory.json").tests;
const olaylar = readJson("scripts/rks/olaylar.json").olaylar.flatMap((o) => o.dosyalar.map((d) => d.file));
ok(olaylar.length === 4 && olaylar.every((f) => forbiddenReason(f) && realInv.find((t) => t.file === f)?.sinif === "B-OWNER"), "Olay kaydındaki 4 HD/Atlas betiği bugün B-OWNER ve çalıştırma yasağında");
const yasakSinif = realInv.filter((t) => ["B-OWNER", "C", "ARAC"].includes(t.sinif));
ok(yasakSinif.length > 0 && yasakSinif.every((t) => forbiddenReason(t.file)), `Envanterdeki ${yasakSinif.length} B-OWNER/C/ARAC kaydının TAMAMI doğrulama modunda da reddedilir`);
const bSinif = realInv.filter((t) => t.sinif === "B");
ok(bSinif.every((t) => forbiddenReason(t.file, { requireA: true })), `CI modunda ${bSinif.length} B kaydının tamamı reddedilir (CI yalnız A çalıştırır)`);
const aYasak = realInv.filter((t) => t.sinif === "A" && forbiddenReason(t.file));
ok(aYasak.length === 0, `Hiçbir A testi korunan/ertelenen desene uymuyor (${aYasak.length})`);
ok(!forbiddenReason("app/refleksoloji/bolge-haritasi/hooks/useAtlasWorkspace.ts") && !forbiddenReason("lib/atlasStorage.ts") && !forbiddenReason(path.join(dir, "scripts/reflexology-atlas-sentetik/t.cjs")), "Refleksoloji 'atlas' yolları yasak kapsamında DEĞİL (yanlış pozitif yok)");
const markerDir = path.join(dir, "marker");
fs.mkdirSync(markerDir, { recursive: true });
const sentetik = (rel) => {
  const f = path.join(dir, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const marker = path.join(markerDir, rel.replace(/[\\/]/g, "_") + ".calisti");
  fs.writeFileSync(f, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "x"); console.log("5 PASS / 0 FAIL")`);
  return { id: rel, file: f, cmd: ["node", f], minPass: 1, timeoutSec: 30, marker };
};
for (const rel of ["scripts/hd-sentetik/t.cjs", "scripts/astrology/t.cjs", "scripts/numeroloji-x/t.cjs", "scripts/cosmic-x/t.cjs", "scripts/backup-x/t.cjs", "scripts/usage360/t.cjs", "scripts/hday-x/t.cjs"]) {
  const e = sentetik(rel);
  const res = await runTest(e);
  ok(res.refused && !fs.existsSync(e.marker), `${rel}: süreç başlatılmadan reddedildi, işaretçi dosya oluşmadı`);
}
const ctrl = sentetik("serbest/kontrol.cjs");
await runTest(ctrl);
ok(fs.existsSync(ctrl.marker), "Kontrol: yasak dışı sentetik betik gerçekten çalışır (işaretçi oluştu → yöntem geçerli)");
const fb = sentetik("scripts/hd-uctan/t.cjs");
const out = (() => { fs.writeFileSync(planFile, JSON.stringify({ ...basePlan, secilen: [fb] })); return spawnSync(process.execPath, [path.join(ROOT, "scripts/rks/run.mjs"), "--plan", planFile], { cwd: ROOT, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } }); })();
ok(out.status === 1 && /YASAK-RED/.test(out.stdout) && !fs.existsSync(fb.marker), "run.mjs (CI kapısı): korunan alan testi planda olsa bile çalıştırılmaz, kapı FAIL");
const realOwner = olaylar[0];
fs.writeFileSync(planFile, JSON.stringify({ ...basePlan, secilen: [{ id: "olay", file: realOwner, minPass: 1 }] }));
const out2 = spawnSync(process.execPath, [path.join(ROOT, "scripts/rks/run.mjs"), "--plan", planFile], { cwd: ROOT, encoding: "utf8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } });
ok(out2.status === 1 && /YASAK-RED/.test(out2.stdout) && /\(0s\)/.test(out2.stdout), "run.mjs: gerçek B-OWNER envanter dosyası (olay kaydı) reddedilir, 0 sn — çalıştırılmadı");
const vScan = path.join(dir, "scan.json");
const vOut = path.join(dir, "verify.json");
const vOwner = sentetik("scripts/hd-verify/t.cjs");
const vC = sentetik("serbest/c-sinifi.cjs");
const vAday = sentetik("scripts/astrology-verify/t.cjs");
fs.writeFileSync(vScan, JSON.stringify({ entries: [{ file: vOwner.file, onSinif: "B-OWNER" }, { file: vC.file, onSinif: "C" }, { file: vAday.file, onSinif: "ADAY" }] }));
spawnSync(process.execPath, [path.join(ROOT, "scripts/rks/verify-candidates.mjs"), "--scan", vScan, "--out", vOut], { cwd: ROOT, encoding: "utf8" });
const vRes = fs.existsSync(vOut) ? JSON.parse(fs.readFileSync(vOut, "utf8")).results : [];
ok(![vOwner, vC, vAday].some((e) => fs.existsSync(e.marker)) && vRes.length === 1 && vRes[0].refused, "verify-candidates (envanter doğrulaması): B-OWNER ve C hiç denenmez; korunan yoldaki ADAY reddedilir; hiçbiri çalışmadı");
fs.rmSync(dir, { recursive: true, force: true });

const EXPECTED = 60;
console.log(`\nRKS-3 öz-test: ${pass} PASS / ${fail} FAIL`);
if (pass + fail !== EXPECTED) { console.log(`::error::öz-test sayısı ${pass + fail} ≠ beklenen ${EXPECTED} (senaryo kaybı)`); process.exit(1); }
process.exit(fail ? 1 : 0);
