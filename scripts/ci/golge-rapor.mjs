#!/usr/bin/env node
/**
 * Akıllı CI F3 — gölge raporu: gölge ÖNERİSİ ile F2'nin GERÇEKTE çalıştırdığı işleri / testleri karşılaştırır.
 * YALNIZ GÖZLEM: CI kapısına bağlı değildir, hiçbir işin çalışmasını etkilemez.
 *
 *   CI_KAPISI_NEEDS='${{ toJSON(needs) }}' node scripts/ci/golge-rapor.mjs --golge <golge-analiz.json>
 *        --sonuc-dir <regresyon parça sonuçları> --beklenen-sha <GITHUB_SHA> --cikti <golge-rapor.json>
 *
 * Gölge JSON'u yok / bozuk / şeması yanlış / SHA tutarsızsa bu iş FAIL verir (sessiz başarı yok).
 * Önerilmeyen ama gerçekte BAŞARISIZ olan test → "yanlış negatif adayı" (F4 için kritik sinyal) olarak raporlanır.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SEMA } from "./golge-analiz.mjs";

const ISLER = ["typescript", "build", "guvenlik", "regresyon", "astro-pro", "horary-western"];

/** Gölge JSON doğrulaması → hata listesi (boşsa geçerli). */
export function golgeDogrula(g, beklenenSha) {
  const h = [];
  if (!g || typeof g !== "object") return ["gölge JSON nesne değil"];
  if (g.sema !== SEMA) h.push(`şema ${g.sema} ≠ ${SEMA}`);
  if (typeof g.fullFallback !== "boolean") h.push("fullFallback alanı yok");
  if (!g.oneri || !Array.isArray(g.oneri.isler)) h.push("oneri.isler yok");
  if (!g.fullFallback && !Array.isArray(g.oneri?.regresyonTestleri)) h.push("daraltılmış öneride regresyonTestleri listesi yok");
  if (!Array.isArray(g.gerekceler) || g.gerekceler.length === 0) h.push("gerekçe yok (karar gerekçesiz olamaz)");
  if (!g.sha || typeof g.sha !== "object") h.push("sha alanı yok");
  else if (beklenenSha && g.sha.analiz !== beklenenSha) h.push(`analiz SHA'sı (${String(g.sha.analiz).slice(0, 12)}) test edilen commit (${beklenenSha.slice(0, 12)}) ile aynı değil`);
  if (!g.fullFallback && g.hata) h.push("hata varken daraltılmış öneri üretilmiş");
  return h;
}

/** Karşılaştırma (saf). */
export function karsilastir(g, needs, parcalar) {
  const gercekTestler = new Map();
  for (const p of parcalar) for (const t of p.tests ?? []) gercekTestler.set(t.file, t.ok === true);
  const isSonuclari = Object.fromEntries(ISLER.map((i) => [i, needs?.[i]?.result ?? "bilinmiyor"]));
  const onerilen = g.fullFallback ? null : new Set(g.oneri.regresyonTestleri ?? []);
  const basarisiz = [...gercekTestler].filter(([, ok]) => !ok).map(([f]) => f).sort();
  const yanlisNegatifAdayi = onerilen ? basarisiz.filter((f) => !onerilen.has(f)) : [];
  const isYanlisNegatif = g.fullFallback ? [] : ISLER.filter((i) => i !== "regresyon" && isSonuclari[i] === "failure" && !g.oneri.isler.includes(i));
  const onerilipCalismayan = onerilen ? [...onerilen].filter((f) => !gercekTestler.has(f)).sort() : [];
  return {
    gercek: { isler: isSonuclari, regresyonTestSayisi: gercekTestler.size, basarisizTestler: basarisiz, tumIslerCalisti: ISLER.every((i) => ["success", "failure"].includes(isSonuclari[i])) },
    onerilenTestSayisi: onerilen ? onerilen.size : gercekTestler.size,
    fark: gercekTestler.size - (onerilen ? onerilen.size : gercekTestler.size),
    yanlisNegatifAdayi, isYanlisNegatif, onerilipCalismayan,
  };
}

function main() {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const satir = [];
  let g = null;
  let hatalar = [];
  try { g = JSON.parse(fs.readFileSync(arg("--golge"), "utf8")); } catch (e) { hatalar.push(`gölge JSON okunamadı: ${e.message}`); }
  if (g) hatalar = golgeDogrula(g, arg("--beklenen-sha"));
  let needs = null;
  try { needs = JSON.parse(process.env.CI_KAPISI_NEEDS ?? ""); } catch { hatalar.push("needs okunamadı"); }
  const parcalar = [];
  try { for (const f of fs.readdirSync(arg("--sonuc-dir")).filter((x) => x.endsWith(".json")).sort()) parcalar.push(JSON.parse(fs.readFileSync(path.join(arg("--sonuc-dir"), f), "utf8"))); } catch { /* yoksa gerçek test sayısı 0 görünür */ }

  if (hatalar.length) {
    satir.push("## Gölge rapor (F3) — ❌ GEÇERSİZ GÖLGE ÇIKTISI", "> Gölge analizi doğrulanamadı; F2 testleri ve CI kapısı bundan ETKİLENMEZ.", "", ...hatalar.map((h) => `- ${h}`));
    console.log(satir.join("\n"));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, satir.join("\n") + "\n");
    for (const h of hatalar) console.log(`::error::Gölge rapor: ${h}`);
    process.exit(1);
  }
  const k = karsilastir(g, needs, parcalar);
  const rapor = { ...g, gercek: k.gercek, karsilastirma: { onerilenTestSayisi: k.onerilenTestSayisi, gercekTestSayisi: k.gercek.regresyonTestSayisi, fark: k.fark, yanlisNegatifAdayi: k.yanlisNegatifAdayi, isYanlisNegatif: k.isYanlisNegatif, onerilipCalismayan: k.onerilipCalismayan } };
  if (arg("--cikti")) fs.writeFileSync(arg("--cikti"), JSON.stringify(rapor, null, 1));
  const isler = Object.entries(k.gercek.isler).map(([i, r]) => `${i} ${r === "success" ? "✅" : r === "failure" ? "❌" : `⚠️ ${r}`}`).join(" · ");
  satir.push(
    `## Gölge rapor (F3) — öneri ↔ gerçek`,
    `- **Gerçekte çalışan (F2):** ${isler} · regresyon **${k.gercek.regresyonTestSayisi}** test (başarısız ${k.gercek.basarisizTestler.length})`,
    `- **Gölge önerisi:** ${g.fullFallback ? "FULL — tüm işler + regresyonun tamamı" : `${k.onerilenTestSayisi} regresyon testi · işler: ${g.oneri.isler.join(", ")}`}`,
    `- **Fark:** ${g.fullFallback ? "yok (FULL)" : `${k.fark} test F4'te teorik olarak seçilmeyebilirdi — F3'te HEPSİ çalıştı`}`,
    `- **Yanlış negatif adayı:** ${k.yanlisNegatifAdayi.length || k.isYanlisNegatif.length ? `⚠️ ${[...k.yanlisNegatifAdayi, ...k.isYanlisNegatif.map((i) => `iş:${i}`)].join(", ")}` : "yok"}`,
  );
  if (k.onerilipCalismayan.length) satir.push(`- ⚠️ **Önerilip gerçekte koşmayan test:** ${k.onerilipCalismayan.join(", ")}`);
  console.log(satir.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, satir.join("\n") + "\n");
  for (const f of k.yanlisNegatifAdayi) console.log(`::warning::Gölge: önerilmeyen test başarısız oldu (yanlış negatif adayı): ${f}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
