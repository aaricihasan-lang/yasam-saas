#!/usr/bin/env node
/**
 * RKS-3 merkezî değişiklik analizi + test seçimi + kapsam/zayıflatma denetimi.
 *
 *   node scripts/rks/select.mjs --base <ref> [--head HEAD] [--event <github-event.json>] --out <plan.json>
 *
 * Kararlar (kapı = `checks`):
 *   1. Değişen her dosya → modül (modules.json) + kritik grup + import grafiğine göre onu GERÇEKTEN
 *      çalıştıran güvenli (A) testler. Dosya adı benzerliği kullanılmaz.
 *   2. Seçim = dosyayı kapsayan testler ∪ dosyanın modülünün A testleri ∪ değişen test dosyaları;
 *      "geniş" kritik değişiklikte (bağımlılık/derleme/CI/RKS) bütün A testleri.
 *   3. Kritik dosyayı kapsayan hiç test yoksa → FAIL (Owner etiketi `rks-kritik-onayli` ile bilinçli kabul).
 *   4. PR gövdesindeki ```rks-kapsam bloğu dışında dosya → FAIL (eski açık PR'lar: legacy-prs.json → uyarı).
 *   5. Test dosyasında assertion azalması / test silinmesi → FAIL (etiket `rks-assertion-azalma-onayli`).
 *   6. Envanter/kapı zayıflatması (A testi çıkarma, minPass düşürme, bilinen-FAIL ekleme, RKS-2 alt
 *      sınırı düşürme, CI adımı silme) → FAIL (etiket `rks-envanter-onayli`).
 *   7. Değişen test dosyası ürün kodu sayılmaz: envanterde B kayıtlı test → TEST-DOSYASI-B (görünür
 *      uyarı; çalıştırılmaz, koruma sayılmaz). Envantere kaydedilmemiş yeni test → ENVANTERSIZ-TEST (FAIL;
 *      istisna etiketi YOK — envantere gerçek sınıf + gerekçe ile kaydedilmeli).
 * Korumasız (testi olmayan) dosyalar raporda AÇIKÇA listelenir; korunuyor gibi gösterilmez.
 */
import fs from "node:fs";
import { changedFiles, countAssertions, fileAt, git, matchesAny, readJson } from "./lib/common.mjs";
import { ImportGraph } from "./lib/graph.mjs";

export const LABELS = {
  korumasiz: "rks-korumasiz-onayli",
  kritik: "rks-kritik-onayli",
  assertion: "rks-assertion-azalma-onayli",
  envanter: "rks-envanter-onayli",
};
const IGNORE_INFO = ["docs/**", "**/*.md", "**/*.png", "**/*.jpg", "**/*.jpeg", "**/*.webp", "**/*.svg", "**/*.gif", "**/*.ico", "test-output/**"];
// Test giriş dosyası adayı: inventory-scan.mjs'nin envantere aldığı dosya kuralıyla AYNI (uzantı, hariç
// klasörler, test benzeri ad). TESTLIKE inventory-scan.mjs'deki ile birebir aynı olmalı (öz-test doğrular).
export const TESTLIKE = /(harness|\.test\.|\.pg\.|e2e|browser|check|verify|spec|regression|golden|audit|validate|run-all|smoke|sweep|unit|contract|parity)/i;
export function isTestCandidate(f) {
  return f.startsWith("scripts/") && !f.startsWith("scripts/rks/") && /\.(ts|mts|cts|mjs|cjs|js)$/.test(f)
    && !/\/(fixtures|sql|_shims)\//.test(f) && !f.endsWith(".d.ts") && TESTLIKE.test(f);
}

export function loadConfig() {
  return {
    modules: readJson("scripts/rks/modules.json"),
    inventory: readJson("scripts/rks/inventory.json"),
    known: readJson("scripts/rks/known-failures.json"),
    legacy: readJson("scripts/rks/legacy-prs.json"),
  };
}

/** PR gövdesindeki ```rks-kapsam … ``` bloğu → glob listesi (yoksa null). */
export function parseScope(body) {
  const m = (body ?? "").match(/```rks-kapsam\s*\n([\s\S]*?)```/);
  if (!m) return null;
  return m[1].split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
}

/**
 * Saf planlama (öz-test edilebilir). changed: [{status,file,oldFile?}]; footprints: Map(testFile → Set).
 */
export function plan({ changed, cfg, footprints, pr = null, baseText = () => null, headText = () => null, isScriptHelper = () => false }) {
  const { modules: M, inventory: INV, known: KNOWN, legacy: LEGACY } = cfg;
  const normal = M.modules, korunan = M.korunanAlanlar.modules, ertelenen = M.ertelenenGruplar.modules;
  const kritik = M.kritik.gruplar;
  const A = INV.tests.filter((t) => t.sinif === "A");
  const labels = new Set((pr?.labels ?? []).map((l) => (typeof l === "string" ? l : l.name)));
  const errors = [];
  const warnings = [];
  const selected = new Map(); // file → neden[]
  const sel = (t, why) => { if (!selected.has(t.file)) selected.set(t.file, []); selected.get(t.file).push(why); };
  const fileRows = [];
  let genis = false;

  for (const c of changed) {
    for (const f of [c.file, c.oldFile].filter(Boolean)) {
      const mods = normal.filter((m) => matchesAny(f, m.paths)).map((m) => m.id);
      const kor = korunan.filter((m) => matchesAny(f, m.paths)).map((m) => m.id);
      const ert = ertelenen.filter((m) => matchesAny(f, m.paths)).map((m) => m.id);
      const krit = kritik.filter((g) => matchesAny(f, g.paths));
      if (krit.some((g) => g.genis)) genis = true;
      const covering = A.filter((t) => t.file === f || footprints.get(t.file)?.has(f));
      for (const t of covering) sel(t, `import izi: ${f}`);
      const modTests = A.filter((t) => (t.moduller ?? []).some((m) => mods.includes(m)));
      for (const t of modTests) sel(t, `modül: ${mods.join(",")}`);
      let durum;
      if (covering.length) durum = "KORUNUYOR";
      else if (modTests.length) durum = "MODUL-TESTI-VAR-DOGRUDAN-KAPSAM-YOK";
      else if (kor.length) durum = "RKS-DISI-KORUNAN-ALAN";
      else if (ert.length) durum = "RKS-DISI-ERTELENEN";
      else if (matchesAny(f, IGNORE_INFO)) durum = "DOKUMAN-VARLIK";
      // Yalnız envanterde AÇIKÇA B kayıtlı dosya; diğer sınıflar ve kayıtsız dosyalar bu yoldan geçmez.
      else if (INV.tests.some((t) => t.file === f && t.sinif === "B")) durum = "TEST-DOSYASI-B";
      // Envanterde hiç kaydı olmayan test adayı (başka betiklerin import ettiği yardımcı modül HARİÇ).
      else if (isTestCandidate(f) && !INV.tests.some((t) => t.file === f) && !isScriptHelper(f)) durum = "ENVANTERSIZ-TEST";
      else if (krit.length) durum = "KRITIK";
      else if (mods.length) durum = "KORUMASIZ";
      else durum = "HARITASIZ";
      if (krit.length && !krit.some((g) => g.genis) && !covering.length && c.status !== "D") {
        const msg = `Kritik dosya (${krit.map((g) => g.id).join(",")}) hiçbir güvenli testle kapsanmıyor: ${f}`;
        if (labels.has(LABELS.kritik)) warnings.push(`${msg} — Owner etiketi '${LABELS.kritik}' ile kabul edildi`);
        else errors.push(`${msg} (test ekleyin ya da Owner '${LABELS.kritik}' etiketi)`);
      }
      fileRows.push({ file: f, status: c.status, moduller: mods, korunan: kor, ertelenen: ert, kritik: krit.map((g) => g.id), kapsayanTestler: covering.map((t) => t.id), durum });
    }
  }
  if (genis) for (const t of A) sel(t, "geniş kritik değişiklik (bağımlılık/derleme/CI/RKS)");

  // ── Sıfır test: normal modülde testi olmayan (KORUMASIZ) / haritada olmayan (HARITASIZ) kod dosyası ──
  // Yeni PR → FAIL (açık kabul: LABELS.korumasiz). Eski PR (legacy) ve main push → yalnız uyarı.
  const isLegacyPr = pr ? LEGACY.prs.some((p) => p.numara === pr.number) : false;
  const korumasiz = fileRows.filter((r) => ["KORUMASIZ", "HARITASIZ"].includes(r.durum) && r.status !== "D");
  if (korumasiz.length) {
    const msg = `Otomatik testi OLMAYAN değişen kod dosyası: ${korumasiz.map((r) => `${r.file} (${r.durum}${r.moduller.length ? `: ${r.moduller.join(",")}` : ""})`).join(", ")}`;
    if (!pr) warnings.push(`${msg} — main push: yalnız rapor`);
    else if (isLegacyPr) warnings.push(`${msg} — RKS-3 öncesi PR: yalnız uyarı`);
    else if (labels.has(LABELS.korumasiz)) warnings.push(`${msg} — '${LABELS.korumasiz}' etiketiyle kabul edildi (etiketi kimin koyduğu doğrulanamaz)`);
    else errors.push(`${msg} — test ekleyin ya da Owner açık kabulü: '${LABELS.korumasiz}' etiketi`);
  }
  // ── Değişen test dosyaları (ürün kodu değil) ──
  // B: görünür uyarı; CI'da çalıştırılmaz, hiçbir dosyayı korumaz (seçime girmez).
  const testDosyasiB = fileRows.filter((r) => r.durum === "TEST-DOSYASI-B" && r.status !== "D").map((r) => r.file);
  if (testDosyasiB.length) warnings.push(`B sınıfı test dosyası değişti (CI'da otomatik çalıştırılmaz, koruma SAYILMAZ; ayrıca doğrulanmalı): ${testDosyasiB.join(", ")}`);
  // Kayıtsız test: yeni PR → FAIL (istisna etiketi yok). Eski PR (legacy) ve main push → yalnız uyarı.
  const envantersiz = fileRows.filter((r) => r.durum === "ENVANTERSIZ-TEST" && r.status !== "D").map((r) => r.file);
  if (envantersiz.length) {
    const msg = `Envantere kaydedilmemiş test dosyası (ENVANTERSIZ-TEST): ${envantersiz.join(", ")}`;
    if (!pr) warnings.push(`${msg} — main push: yalnız rapor`);
    else if (isLegacyPr) warnings.push(`${msg} — RKS-3 öncesi PR: yalnız uyarı`);
    else errors.push(`${msg} — scripts/rks/inventory.json'a gerçek sınıfı (A: izole doğrulanmış / B: tarayıcı, sunucu, sır…) ve gerekçesiyle kaydedin`);
  }
  // Modül testi koşuyor ama bu dosyayı import etmiyor: AYRI ve görünür (korunuyor sayılmaz).
  const dolayliKapsam = fileRows.filter((r) => r.durum === "MODUL-TESTI-VAR-DOGRUDAN-KAPSAM-YOK").map((r) => ({ file: r.file, moduller: r.moduller }));

  // ── Kapsam bildirimi (yalnız PR) ──
  let kapsam = { durum: "UYGULANMADI" };
  if (pr) {
    const scope = parseScope(pr.body);
    const isLegacy = LEGACY.prs.some((p) => p.numara === pr.number);
    const files = [...new Set(changed.flatMap((c) => [c.file, c.oldFile].filter(Boolean)))];
    if (!scope) {
      if (isLegacy) { kapsam = { durum: "ESKI-PR-UYARI" }; warnings.push(`PR #${pr.number} RKS-3 öncesi açılmış (legacy-prs.json): kapsam bildirimi yok, kapsam kilidi uyarı modunda`); }
      else { kapsam = { durum: "BILDIRIM-YOK" }; errors.push("PR gövdesinde ```rks-kapsam bloğu yok (Owner onaylı dosya kapsamı zorunlu)"); }
    } else {
      const disari = files.filter((f) => !matchesAny(f, scope));
      kapsam = { durum: disari.length ? "IHLAL" : "UYGUN", globlar: scope, disari };
      if (disari.length) errors.push(`İzinli kapsam dışında değişen dosya: ${disari.join(", ")}`);
    }
  }

  // ── Assertion azalması / test silinmesi (yalnız PR) ──
  const assertionAzalma = [];
  if (pr) {
    const invFiles = new Set(INV.tests.map((t) => t.file));
    for (const c of changed) {
      const f = c.oldFile ?? c.file;
      if (!f.startsWith("scripts/") || f.startsWith("scripts/rks/") || !/\.(ts|mts|cts|mjs|cjs|js)$/.test(f)) continue;
      const before = countAssertions(baseText(f));
      const after = c.status === "D" ? 0 : countAssertions(headText(c.file));
      if ((c.status === "D" && invFiles.has(f)) || after < before) assertionAzalma.push({ file: f, once: before, sonra: after, silindi: c.status === "D" });
    }
    if (assertionAzalma.length) {
      const msg = `Test assertion azalması/silinmesi: ${assertionAzalma.map((a) => `${a.file} (${a.once}→${a.sonra})`).join(", ")}`;
      if (labels.has(LABELS.assertion)) warnings.push(`${msg} — Owner etiketi ile kabul edildi`);
      else errors.push(`${msg} (Owner incelemesi: '${LABELS.assertion}' etiketi)`);
    }
  }

  // ── Envanter / kapı zayıflatması (yalnız PR) ──
  const zayiflatma = [];
  if (pr) {
    const baseInv = safeJson(baseText("scripts/rks/inventory.json"));
    if (baseInv) {
      const now = new Map(INV.tests.map((t) => [t.file, t]));
      for (const t of baseInv.tests.filter((x) => x.sinif === "A")) {
        const n = now.get(t.file);
        if (!n) zayiflatma.push(`A testi envanterden çıkarıldı: ${t.file}`);
        else if (n.sinif !== "A") zayiflatma.push(`A testi ${n.sinif} sınıfına indirildi: ${t.file}`);
        else if ((n.minPass ?? 0) < (t.minPass ?? 0)) zayiflatma.push(`minPass düşürüldü: ${t.file} ${t.minPass}→${n.minPass}`);
      }
    }
    const baseKnown = safeJson(baseText("scripts/rks/known-failures.json"));
    if (baseKnown) {
      const b = new Map(baseKnown.kayitlar.map((k) => [k.file, k]));
      for (const k of KNOWN.kayitlar) {
        const o = b.get(k.file);
        if (!o || k.maxFail > o.maxFail || (k.sonGecerlilik ?? "") > (o.sonGecerlilik ?? "")) zayiflatma.push(`Bilinen-FAIL kaydı eklendi/genişletildi: ${k.file}`);
      }
    }
    const ciBase = baseText(".github/workflows/ci.yml");
    const ciHead = headText(".github/workflows/ci.yml");
    if (ciBase && ciHead) {
      const steps = (t) => new Set([...t.matchAll(/^\s*- name:\s*(.+)$/gm)].map((m) => m[1].trim()));
      const hs = steps(ciHead);
      for (const s of steps(ciBase)) if (!hs.has(s)) zayiflatma.push(`CI adımı kaldırıldı/yeniden adlandırıldı: ${s}`);
      const table = (t) => new Map([...t.matchAll(/^\s{10}([a-z0-9-]+) (\d+)$/gm)].map((m) => [m[1], +m[2]]));
      const ht = table(ciHead);
      for (const [k, v] of table(ciBase)) if (!ht.has(k) || ht.get(k) < v) zayiflatma.push(`RKS-2 alt sınırı düşürüldü/kaldırıldı: ${k} ${v}→${ht.get(k) ?? "yok"}`);
      if (/continue-on-error\s*:\s*true|\|\|\s*true\b/.test(ciHead) && !/continue-on-error\s*:\s*true|\|\|\s*true\b/.test(ciBase)) zayiflatma.push("CI'da hata bastırma eklendi (continue-on-error / || true)");
    }
    if (zayiflatma.length) {
      const msg = `Koruma zayıflatması: ${zayiflatma.join("; ")}`;
      if (labels.has(LABELS.envanter)) warnings.push(`${msg} — Owner etiketi ile kabul edildi`);
      else errors.push(`${msg} (Owner onayı: '${LABELS.envanter}' etiketi)`);
    }
  }

  const tests = [...selected.entries()].map(([file, why]) => {
    const t = INV.tests.find((x) => x.file === file);
    return { ...t, nedenler: [...new Set(why)] };
  });
  return {
    genis,
    dosyalar: fileRows,
    secilen: tests.filter((t) => t.calistiran === "rks3"),
    mevcutAdimlardaKosan: tests.filter((t) => t.calistiran !== "rks3").map((t) => ({ id: t.id, calistiran: t.calistiran })),
    kapsam,
    dolayliKapsam,
    korumasiz: korumasiz.map((r) => r.file),
    testDosyasiB,
    envantersiz,
    assertionAzalma,
    zayiflatma,
    // Güvence düzeyi (dürüst beyan): kapsam bloğu ve etiketler PR'a yazabilen herkesçe değiştirilebilir.
    guvence: {
      kapsamBildirimi: "geliştirici beyanı — beyan dışı dosya değişikliğini yakalar; Owner onayı DEĞİLDİR",
      etiketler: "istisna etiketi — kimin koyduğu bu kapıda doğrulanmaz; Owner onayı DEĞİLDİR",
      ownerOnayi: "yalnız Owner'ın PR'ı incelemesi ve merge etmesi (ayrı kimlik + zorunlu onay kuralı olmadan teknik olarak zorlanamaz)",
    },
    errors,
    warnings,
  };
}

function safeJson(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

export function footprintsFor(tests) {
  const g = new ImportGraph();
  return new Map(tests.map((t) => [t.file, g.footprint(t.file)]));
}

// ── CLI ──
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("select.mjs")) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const base = arg("--base");
  const head = arg("--head") ?? "HEAD";
  const out = arg("--out");
  if (!base) { console.error("--base gerekli"); process.exit(2); }
  const ev = arg("--event") && fs.existsSync(arg("--event")) ? JSON.parse(fs.readFileSync(arg("--event"), "utf8")) : null;
  const pr = ev?.pull_request ? { number: ev.pull_request.number, body: ev.pull_request.body ?? "", labels: ev.pull_request.labels ?? [] } : null;
  const cfg = loadConfig();
  const mergeBase = git(["merge-base", base, head]).trim();
  const changed = changedFiles(base, head);
  const fps = footprintsFor(cfg.inventory.tests.filter((t) => t.sinif === "A"));
  // Yardımcı modül = başka bir scripts/ dosyasının import ettiği dosya (inventory-scan.mjs ile aynı kural).
  // Yalnız değişenler arasında kayıtsız test adayı varsa hesaplanır.
  let helpers = null;
  const isScriptHelper = (f) => {
    if (!helpers) {
      const g = new ImportGraph();
      helpers = new Set();
      const all = git(["ls-files", "scripts"]).split(/\r?\n/).filter((x) => /\.(ts|mts|cts|mjs|cjs|js)$/.test(x));
      for (const x of all) for (const d of g.depsOf(x)) if (d !== x && d.startsWith("scripts/")) helpers.add(d);
    }
    return helpers.has(f);
  };
  const p = plan({ changed, cfg, footprints: fps, pr, baseText: (f) => fileAt(mergeBase, f), headText: (f) => fileAt(head, f), isScriptHelper });
  p.base = base; p.mergeBase = mergeBase; p.head = git(["rev-parse", head]).trim(); p.pr = pr?.number ?? null;
  if (out) fs.writeFileSync(out, JSON.stringify(p, null, 1));
  const cnt = p.dosyalar.reduce((a, r) => ((a[r.durum] = (a[r.durum] ?? 0) + 1), a), {});
  console.log(`RKS-3 seçim: ${changed.length} değişen dosya ${JSON.stringify(cnt)}; geniş=${p.genis}`);
  console.log(`  RKS-3 adımında koşacak: ${p.secilen.length} test; mevcut CI adımlarında koşan ilgili: ${p.mevcutAdimlardaKosan.length}`);
  for (const r of p.dosyalar.filter((r) => ["KORUMASIZ", "HARITASIZ", "MODUL-TESTI-VAR-DOGRUDAN-KAPSAM-YOK", "TEST-DOSYASI-B", "ENVANTERSIZ-TEST"].includes(r.durum))) console.log(`  ⚠ ${r.durum}: ${r.file}`);
  for (const w of p.warnings) console.log(`  UYARI: ${w}`);
  for (const e of p.errors) console.log(`  HATA (kapı run.mjs'de uygular): ${e}`);
  // Politika hataları planda taşınır; kapıyı run.mjs testleri koştuktan SONRA uygular
  // (böylece tek çalıştırmada hem test sonuçları hem politika ihlalleri görünür).
}
