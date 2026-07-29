#!/usr/bin/env node
/**
 * scripts/cosmic-validation/location_consistency.mjs
 *
 * Kozmik Ajanda konum tutarlılığı — GERÇEK üretim kaynağı sözleşme doğrulaması
 * (sunum katmanı; hesaplama motoru DEĞİL). app/cosmic-calendar/page.tsx metnini okur,
 * satır numarasına güvenmez; Tutulmalar normal görünümünün etkin konuma (selEclipseLoc)
 * bağlı olduğunu ve sabit "Ankara" görünürlük yolunun kalmadığını kanıtlar.
 *
 * Çalıştırma:  node scripts/cosmic-validation/location_consistency.mjs
 * Sapmada exit 1 (CI-dostu).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PAGE = join(__dirname, "..", "..", "app", "cosmic-calendar", "page.tsx");
let src = "";
try { src = readFileSync(PAGE, "utf8"); } catch { /* aşağıda FAIL */ }

let pass = 0, fail = 0; const fails = [];
const check = (name, cond, extra = "") => {
  if (cond) { pass++; } else { fail++; fails.push(name + (extra ? ` — ${extra}` : "")); }
};
const count = (re) => (src.match(re) || []).length;

check("page.tsx okunabildi", src.length > 0, PAGE);

// ── 1. Sabit Ankara görünürlük yolu KALMADI ──
check(
  'Sabit `cityVisBadge(row.vis, "Ankara")` yolu kalmadı',
  !/cityVisBadge\(\s*row\.vis\s*,\s*"Ankara"\s*\)/.test(src),
);
check(
  'Etiket "Görünürlük Ankara referans" kalmadı',
  !/Görünürlük\s+Ankara\s+referans/.test(src),
);
check(
  "Tutulma kartlarında sabit tz={TR_TZ} kalmadı",
  !/<EclipseCard[^>]*tz=\{TR_TZ\}/.test(src),
);

// ── 2. Normal görünüm etkin konum yolunu kullanıyor ──
// resolveSelVis(row, selEclipseLoc) + cityVisBadge(selVis ? [selVis] : [], eclipseCity)
// hem yaklaşan hem geçmiş için (en az 2 kez — normal upcoming + normal past;
// uzman görünüm de resolveSelVis kullanır → toplam ≥3).
check(
  "Normal görünüm resolveSelVis(row, selEclipseLoc) kullanıyor (≥2 kez)",
  count(/resolveSelVis\(\s*row\s*,\s*selEclipseLoc\s*\)/g) >= 2,
  `bulunan=${count(/resolveSelVis\(\s*row\s*,\s*selEclipseLoc\s*\)/g)}`,
);
check(
  "cityVisBadge(selVis ? [selVis] : [], eclipseCity) kullanılıyor (≥2 kez)",
  count(/cityVisBadge\(\s*selVis\s*\?\s*\[selVis\]\s*:\s*\[\]\s*,\s*eclipseCity\s*\)/g) >= 2,
  `bulunan=${count(/cityVisBadge\(\s*selVis\s*\?\s*\[selVis\]\s*:\s*\[\]\s*,\s*eclipseCity\s*\)/g)}`,
);
check(
  "Tutulma kartları tz={eclipseTz} kullanıyor (≥2 kez)",
  count(/<EclipseCard[^>]*tz=\{eclipseTz\}/g) >= 2,
  `bulunan=${count(/<EclipseCard[^>]*tz=\{eclipseTz\}/g)}`,
);
check(
  'Alt açıklama "{eclipseCity} konumu referans" biçiminde',
  /Görünürlük\s+\{eclipseCity\}\s+konumu\s+referans/.test(src),
);

// ── 3. Güvenli TR şehir eki (kesme ekli 'dan/'den YOK) ──
check(
  'cityVisBadge güvenli "{city} konumundan …" biçimi kullanıyor',
  /\$\{city\}\s+konumundan\s+görünür/.test(src) && /\$\{city\}\s+konumundan\s+görünmez/.test(src),
);
check(
  "cityVisBadge helper'ında kesme ekli `${city}'dan` KALMADI",
  !/\$\{city\}'dan/.test(src),
);
check(
  "Motor görünürlük durumu sunumda safeVisStatus ile güvenli hâle getiriliyor",
  /safeVisStatus\(sv\.visibilityStatus\)/.test(src) && /const\s+safeVisStatus\s*=/.test(src),
);

// ── 4. Konum yükleme flicker koruması (Ankara flaşı yok) ──
check(
  "Tutulmalar bölümü locPrefLoaded gate'i içeriyor",
  /\{!locPrefLoaded \? \(/.test(src),
);
check(
  "Gezegen Saati konum çözülene kadar 'Konum yükleniyor…' gösteriyor",
  /isSelectedToday && !locPrefLoaded/.test(src) && /isSelectedToday && locPrefLoaded/.test(src),
);
check(
  "Konum yükleniyor nötr placeholder metni mevcut",
  /Konum yükleniyor/.test(src),
);

// ── 5. Meşru fallback altyapısı KORUNDU ──
check(
  "DEFAULT_ECLIPSE_LOC_ID (kontrollü fallback) korunuyor",
  /DEFAULT_ECLIPSE_LOC_ID/.test(src),
);
check(
  "eclipseCity fallback yalnız Ankara (nesne yoksa) — kaldırılmadı",
  /eclipseCity\s*=\s*selEclipseLoc\?\.name\s*\?\?\s*"Ankara"/.test(src),
);

// ── 6. Motor / API dokunulmadı (page.tsx'te güvenli tüketim) ──
check(
  "Gezegen Saati etkin konumu (selEclipseLoc) kullanıyor",
  /getPlanetaryHour\(realNow,\s*selEclipseLoc\?\.lat,\s*selEclipseLoc\?\.lon/.test(src),
);

// ── Sonuç ──
console.log(`\nKonum tutarlılığı harness: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  console.error("\nBaşarısız kontroller:");
  for (const f of fails) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("✓ Tüm konum tutarlılığı sözleşme doğrulamaları geçti.");
