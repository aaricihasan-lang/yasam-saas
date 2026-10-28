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
import { ROOT, readJson } from "./lib/common.mjs";
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
fs.rmSync(dir, { recursive: true, force: true });

const EXPECTED = 34;
console.log(`\nRKS-3 öz-test: ${pass} PASS / ${fail} FAIL`);
if (pass + fail !== EXPECTED) { console.log(`::error::öz-test sayısı ${pass + fail} ≠ beklenen ${EXPECTED} (senaryo kaybı)`); process.exit(1); }
process.exit(fail ? 1 : 0);
