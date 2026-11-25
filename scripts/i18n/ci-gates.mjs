#!/usr/bin/env node
/**
 * I18N-F1 — CI kalite kapısı (scripts/ci/regression-tests.json üzerinden her PR'da koşar; ağ / DB / sır yok).
 * Adımlar sırayla koşar; biri bile FAIL ise çıkış 1. Son satır koşucunun okuduğu "N PASS / M FAIL" özetidir.
 *
 * Kapsam: katalog kaydı güncelliği · katalog kapısı (C1–C10) · Türkçe dondurma · sabit metin cırcırı ·
 * i18n birim testleri · kapı negatif testleri · Doğaltaş i18n harness'ları (2a–2j).
 * Ayrı regresyon girdisi: hesaplama değişmezliği (scripts/i18n/calc-invariance.harness.ts — Owner onaylı dar, salt okunur
 * korunan alan istisnası; scripts/ci/run-regression.mjs KORUNAN_SALT_OKUNUR_ISTISNA).
 * Bilinçli olarak DIŞARIDA: render-residue (bilinen FAIL — Doğaltaş Kütüphanesi çevrilmemiş; F2 Doğaltaş dalgası).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const steps = [
  ["katalog kaydı güncel", ["scripts/i18n/gen-catalog.mjs", "--check"]],
  ["katalog kapısı C1–C10", ["scripts/i18n/catalog-check.mjs"]],
  ["Türkçe dondurma", ["scripts/i18n/tr-freeze.mjs"]],
  ["sabit metin cırcırı", ["scripts/i18n/hardcoded-scan.mjs", "--check"]],
  ["i18n birim testleri", [tsx, "scripts/i18n/unit.test.ts"]],
  ["sunucu çevirici güvenliği", [tsx, "scripts/i18n/server-messages.test.ts"]],
  ["kapı negatif testleri", ["scripts/i18n/gates.negative.test.mjs"]],
  // Çıktı dili sözleşmesi: TR rapor golden'ı (bayt-bayt) + EN dil/nöbetçi/sayı kontrolleri (Kupa pilotu + ortak motorlar).
  ["rapor golden (TR birebir + EN)", [tsx, "scripts/i18n/reports-golden.harness.ts"]],
  // Rapor grubu A+B (Ajanda, Ürün/Stok, Danışan Yolculuğu tekli/toplu, Anamnez PDF): TR golden + EN kontrolleri.
  ["rapor golden A+B (TR birebir + EN)", [tsx, "scripts/i18n/reports-golden-ab.harness.ts"]],
  // I18N-F1-R5 RAPOR-CD: grup C+D üreticileri (Beslenme, Aromaterapi, Doğaltaş …) — ayrı golden, aynı normalizasyon.
  ["rapor golden C+D (TR birebir + EN)", [tsx, "scripts/i18n/reports-golden-cd.harness.ts"]],
  ...["2a", "2c", "2d", "2e", "2f", "2g", "2h", "2i", "2j"].map((h) => [`Doğaltaş ${h}`, [`scripts/stones-i18n-${h}-harness.mjs`]]),
];

let pass = 0, fail = 0;
for (const [name, args] of steps) {
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split(/\r?\n/).slice(-1)[0] ?? "";
  if (r.status === 0) { pass++; console.log(`✔ ${name} — ${tail}`); }
  else {
    fail++;
    console.error(`✘ ${name} (çıkış ${r.status})`);
    console.error(`${r.stdout ?? ""}${r.stderr ?? ""}`.split(/\r?\n/).filter((l) => /FAIL|❌|Error/.test(l)).slice(0, 25).join("\n"));
  }
}
console.log(`\n=== i18n CI kapısı: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
