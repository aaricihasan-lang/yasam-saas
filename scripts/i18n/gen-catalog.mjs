#!/usr/bin/env node
/**
 * I18N-F1 — Katalog kaydı üreticisi. messages/<locale>/*.json dosyalarını tarar ve
 * i18n/catalog.generated.ts dosyasını (statik import listesi) üretir.
 *
 * Neden: modül bazlı sözlükler paralel geliştirilirken her ajanın ortak i18n/request.ts
 * dosyasına elle import eklemesi merge çakışması üretiyordu. Artık ajan yalnız kendi
 * messages/{tr,en}/<modül>.json dosyasını ekler ve bu komutu çalıştırır; üretilen dosya
 * deterministiktir (alfabetik), çakışma olursa yeniden üretmek yeterlidir.
 *
 * Kullanım:
 *   node scripts/i18n/gen-catalog.mjs          → dosyayı yazar
 *   node scripts/i18n/gen-catalog.mjs --check  → güncel değilse exit 1 (CI kapısı)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MESSAGES = path.join(root, "messages");
const OUT = path.join(root, "i18n", "catalog.generated.ts");
// Katalogu üretilecek diller (lib/i18n/locales.ts ACTIVE_LOCALES ile aynı olmalı; catalog-check doğrular).
const LOCALES = ["tr", "en"];

function ident(locale, file) {
  const base = file.replace(/\.json$/, "");
  const camel = base
    .split(/[.\-_]/)
    .filter(Boolean)
    .map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1)))
    .join("");
  return `${locale}_${camel}`;
}

export function buildSource() {
  const lines = [];
  lines.push("/**");
  lines.push(" * OTOMATİK ÜRETİLDİ — elle düzenleme. Üretici: scripts/i18n/gen-catalog.mjs (npm run i18n:catalog).");
  lines.push(" * Kaynak: messages/<locale>/*.json. Sıra alfabetiktir; dosyalar arası anahtar çakışması");
  lines.push(" * scripts/i18n/catalog-check.mjs tarafından FAIL edilir (birleştirme sırası anlam taşımaz).");
  lines.push(" */");
  const parts = {};
  for (const locale of LOCALES) {
    const dir = path.join(MESSAGES, locale);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    parts[locale] = files;
    for (const f of files) lines.push(`import ${ident(locale, f)} from "@/messages/${locale}/${f}";`);
  }
  lines.push("");
  lines.push("export const CATALOG_FILES = {");
  for (const locale of LOCALES) lines.push(`  ${locale}: [${parts[locale].map((f) => JSON.stringify(f)).join(", ")}],`);
  lines.push("} as const;");
  lines.push("");
  lines.push("export const CATALOG_PARTS: Record<\"tr\" | \"en\", Record<string, unknown>[]> = {");
  for (const locale of LOCALES) {
    lines.push(`  ${locale}: [`);
    for (const f of parts[locale]) lines.push(`    ${ident(locale, f)},`);
    lines.push("  ],");
  }
  lines.push("};");
  lines.push("");
  return lines.join("\n");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = buildSource();
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
  if (process.argv.includes("--check")) {
    if (current !== src) {
      console.error("FAIL i18n/catalog.generated.ts güncel değil — `npm run i18n:catalog` çalıştırın.");
      process.exit(1);
    }
    console.log("PASS i18n/catalog.generated.ts güncel");
  } else {
    fs.writeFileSync(OUT, src);
    console.log(`yazıldı: ${path.relative(root, OUT)}`);
  }
}
