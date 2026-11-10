#!/usr/bin/env node
/**
 * Akıllı CI F2 — CI KAPISI. ci.yml `ci-kapisi` işi her koşulda (if: always()) bunu çalıştırır.
 *
 *   CI_KAPISI_NEEDS='${{ toJSON(needs) }}' node scripts/ci/ci-gate.mjs --sonuc-dir <dizin> --parca-sayisi <n>
 *
 * Karar scripts/ci/regression-shard.mjs → kapiDegerlendir: zorunlu işlerin HEPSİ "success" olmalı (failure / cancelled /
 * skipped / eksik → FAIL) ve regresyon parça sonuçları regression-tests.json listesini TAM BİR KEZ, hepsi PASS ve ayrı
 * makinelerde kapsamalı. Okunamayan girdi de FAIL'dir; kapı hiçbir belirsizliği PASS saymaz.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kapiDegerlendir } from "./regression-shard.mjs";

const CI_DIR = path.dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

function main() {
  let needs = null;
  let needsHata = null;
  try { needs = JSON.parse(process.env.CI_KAPISI_NEEDS ?? ""); } catch (e) { needsHata = e.message; }
  const parcaSayisi = Number(arg("--parca-sayisi"));
  const dir = arg("--sonuc-dir");
  const listFile = arg("--list") ? path.resolve(arg("--list")) : path.join(CI_DIR, "regression-tests.json");
  const liste = JSON.parse(fs.readFileSync(listFile, "utf8")).tests.map((t) => t.file);

  const sonuclar = [];
  let dosyalar = [];
  try { dosyalar = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort(); } catch { /* dizin yok → sonuç yok */ }
  for (const f of dosyalar) {
    try { sonuclar.push({ ad: f, veri: JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }); }
    catch (e) { sonuclar.push({ ad: f, hata: e.message }); }
  }

  const { ok, kontroller } = kapiDegerlendir({ needs, liste, parcaSayisi, sonuclar });
  if (needsHata) kontroller.unshift({ ok: false, ad: "needs okunabilir", detay: needsHata });
  if (!Number.isInteger(parcaSayisi) || parcaSayisi < 1) kontroller.unshift({ ok: false, ad: "parça sayısı verildi", detay: String(arg("--parca-sayisi")) });
  const gecti = ok && kontroller.every((x) => x.ok);

  for (const x of kontroller) console.log(`${x.ok ? "PASS" : "FAIL"} ${x.ad}${x.detay ? ` — ${x.detay}` : ""}`);
  const pass = kontroller.filter((x) => x.ok).length;
  const fail = kontroller.length - pass;
  const md = [
    `## CI kapısı — ${gecti ? "✅ GEÇTİ" : "❌ KAPALI"}`,
    `Kontrol: ${pass} PASS / ${fail} FAIL · regresyon listesi ${liste.length} test · ${parcaSayisi} parça`,
    fail ? "\n| Kontrol | Ayrıntı |\n|---|---|\n" + kontroller.filter((x) => !x.ok).map((x) => `| ${x.ad} | ${x.detay} |`).join("\n") : "",
  ].filter(Boolean).join("\n");
  console.log("\n" + md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  for (const x of kontroller.filter((y) => !y.ok)) console.log(`::error::CI kapısı: ${x.ad}${x.detay ? ` — ${x.detay}` : ""}`);
  process.exit(gecti ? 0 : 1);
}

main();
