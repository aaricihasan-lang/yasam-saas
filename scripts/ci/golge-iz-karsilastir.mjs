#!/usr/bin/env node
/**
 * Akıllı CI F3 — statik import grafiği ↔ çalışma zamanı yükleme izi karşılaştırması (YALNIZ doğrulama aracı).
 *
 *   node scripts/ci/golge-iz-karsilastir.mjs --iz-dir <dizin> [--kok <izdeki depo kökü>] [--cikti <json>]
 *
 * golge-iz.yml regresyon testlerini GOLGE_IZ_DIR ile koşar; her test için gerçekte yüklenen depo dosyaları kaydedilir.
 * Burada her test için: gerçekte yüklenen ama statik grafiğin (dosya / önek / çözülemeyen yol) kapsamadığı dosyalar
 * "KAÇAK" sayılır. Kaçak dosya ortak altyapıdaysa (değişince zaten FULL) zararsızdır; test GENİŞ ise (her öneride var)
 * zararsızdır; aksi hâlde ZARARLI KAÇAK = gölge önerisinin o testi yanlışlıkla dışarıda bırakabileceği gerçek risk.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { agacOku, grafKur, kullaniyorMu } from "./golge-graf.mjs";
import { altyapiMi } from "./golge-analiz.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const izDir = arg("--iz-dir");
const agac = agacOku(ROOT, "HEAD");
const g = grafKur(agac);
const liste = JSON.parse(agac.read("scripts/ci/regression-tests.json")).tests.map((t) => t.file);
// --kok: izin kaydedildiği makinedeki depo kökü (ör. CI izi yerelde karşılaştırılırken /home/runner/work/yasam-saas/yasam-saas)
const rootNorm = (arg("--kok") ?? ROOT).replace(/\\/g, "/").replace(/\/$/, "") + "/";
const sonuc = { izliTest: 0, izsizTest: [], toplamYuklenen: 0, kacak: [], zararliKacak: [] };
for (const t of liste) {
  const f = path.join(izDir, `${t.replace(/[^A-Za-z0-9._-]+/g, "__")}.txt`);
  if (!fs.existsSync(f)) { sonuc.izsizTest.push(t); continue; }
  sonuc.izliTest++;
  const yuklenen = [...new Set(fs.readFileSync(f, "utf8").split(/\r?\n/).map((x) => x.replace(/\\/g, "/")).filter((x) => x.startsWith(rootNorm)).map((x) => x.slice(rootNorm.length)))]
    .filter((x) => agac.files.has(x));
  sonuc.toplamYuklenen += yuklenen.length;
  const k = g.kapanis(t);
  for (const y of yuklenen) {
    if (kullaniyorMu(k, y)) continue;
    const kayit = { test: t, dosya: y, altyapi: altyapiMi(y), genisTest: k.genis };
    sonuc.kacak.push(kayit);
    if (!kayit.altyapi && !kayit.genisTest) sonuc.zararliKacak.push(kayit);
  }
}
console.log(`izli test ${sonuc.izliTest} / ${liste.length} · yüklenen depo dosyası (test başına toplam) ${sonuc.toplamYuklenen} · kaçak ${sonuc.kacak.length} · ZARARLI kaçak ${sonuc.zararliKacak.length}`);
for (const z of sonuc.zararliKacak.slice(0, 50)) console.log(`ZARARLI ${z.test} ← ${z.dosya}`);
for (const z of sonuc.kacak.filter((x) => !sonuc.zararliKacak.includes(x)).slice(0, 20)) console.log(`zararsız ${z.test} ← ${z.dosya} (${z.altyapi ? "altyapı" : "geniş test"})`);
if (sonuc.izsizTest.length) console.log(`izi olmayan test (${sonuc.izsizTest.length}): ${sonuc.izsizTest.slice(0, 10).join(", ")}`);
if (arg("--cikti")) fs.writeFileSync(arg("--cikti"), JSON.stringify(sonuc, null, 1));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Gölge iz doğrulaması\n- izli test ${sonuc.izliTest} / ${liste.length}\n- kaçak ${sonuc.kacak.length} · **zararlı kaçak ${sonuc.zararliKacak.length}**\n`);
