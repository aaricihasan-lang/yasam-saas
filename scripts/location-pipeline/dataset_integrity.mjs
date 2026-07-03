#!/usr/bin/env node
/**
 * scripts/location-pipeline/dataset_integrity.mjs
 * FAZ 5 / P5f-1 — Global konum dataset bütünlük harness'i.
 *
 * lib/location/server-data/global-cities.json artefaktını doğrular. Motor/UI/DB'ye
 * DOKUNMAZ; yalnız üretilmiş veriyi kontrol eder. PASS → exit 0, FAIL → exit 1.
 *
 * Çalıştır:  node scripts/location-pipeline/dataset_integrity.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = join(HERE, "..", "..", "lib", "location", "server-data", "global-cities.json");
const FLOOR = 20000; // TR-hariç tam dataset için makul alt sınır

let fail = 0;
const check = (name, cond, extra = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!cond) fail++;
};

const tzCache = new Map();
const validTz = (tz) => {
  if (!tz) return false;
  if (tzCache.has(tz)) return tzCache.get(tz);
  let ok = true;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { ok = false; }
  tzCache.set(tz, ok);
  return ok;
};

function main() {
  console.log("═══ FAZ 5 / P5f-1 — Global Dataset Bütünlük ═══");
  if (!existsSync(ARTIFACT)) {
    console.error(`HATA: artefakt yok: ${ARTIFACT}\nÖnce: node scripts/location-pipeline/build-global-dataset.mjs`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(ARTIFACT, "utf8"));
  const locs = data.locations;

  // 1) Yapı + sayım
  check("locations dizi", Array.isArray(locs));
  const count = Array.isArray(locs) ? locs.length : 0;
  check("count alanı = gerçek uzunluk", data.count === count, `count=${data.count} gerçek=${count}`);
  check(`kayıt sayısı > ${FLOOR}`, count > FLOOR, `${count}`);
  check("TR hariç tutuldu (excludedTR>0)", (data.excludedTR ?? 0) > 0, `${data.excludedTR}`);
  check("CC-BY atıf notu mevcut", typeof data._attribution === "string" && /GeoNames/.test(data._attribution));

  // 2) TR hiç yok
  const trCount = locs.filter(l => l.countryCode === "TR").length;
  check("TR kaydı yok (0)", trCount === 0, `${trCount}`);

  // 3) Geçerli tz oranı %100
  let tzBad = 0;
  for (const l of locs) if (!validTz(l.tz)) tzBad++;
  check("geçerli IANA tz oranı %100", tzBad === 0, `geçersiz ${tzBad}`);

  // 4) Benzersiz id + gn- öneki
  const ids = new Set();
  let dup = 0, badPrefix = 0;
  for (const l of locs) {
    if (ids.has(l.id)) dup++; else ids.add(l.id);
    if (typeof l.id !== "string" || !l.id.startsWith("gn-")) badPrefix++;
  }
  check("id benzersiz", dup === 0, `çift ${dup}`);
  check("id 'gn-' önekli", badPrefix === 0, `hatalı ${badPrefix}`);

  // 5) Koordinat sınırları
  let badCoord = 0;
  for (const l of locs) {
    if (!Number.isFinite(l.lat) || l.lat < -90 || l.lat > 90 || !Number.isFinite(l.lon) || l.lon < -180 || l.lon > 180) badCoord++;
  }
  check("koordinatlar sınırda", badCoord === 0, `hatalı ${badCoord}`);

  // 6) Zorunlu alanlar + sabitler
  let badReq = 0;
  for (const l of locs) {
    const okRow =
      typeof l.id === "string" && l.id.length > 0 &&
      typeof l.name === "string" && l.name.length > 0 &&
      typeof l.country === "string" && l.country.length > 0 &&
      typeof l.countryCode === "string" && l.countryCode.length === 2 &&
      typeof l.adminRegion === "string" &&
      typeof l.tz === "string" && l.tz.length > 0 &&
      Number.isFinite(l.elev) &&
      l.source === "geonames" && l.verified === true && l.origin === "bundled";
    if (!okRow) badReq++;
  }
  check("zorunlu alanlar + sabitler (source/verified/origin)", badReq === 0, `hatalı ${badReq}`);

  // 7) Bilinen şehir varlığı
  const has = (name, cc) => locs.some(l => l.name.toLowerCase() === name.toLowerCase() && l.countryCode === cc);
  // GeoNames kanonik adları: NYC = "New York City" (kullanıcı "New York" arayınca substring ile bulur).
  const known = [["Berlin", "DE"], ["New York City", "US"], ["Tokyo", "JP"], ["Sydney", "AU"], ["Paris", "FR"]];
  for (const [n, cc] of known) check(`bilinen şehir: ${n} (${cc})`, has(n, cc));

  // Aynı-isim ayrımı spot: Paris/FR ve Paris/US ayrı kayıt
  const parisFR = locs.some(l => l.name === "Paris" && l.countryCode === "FR");
  const parisUS = locs.some(l => l.name === "Paris" && l.countryCode === "US");
  check("aynı-isim ayrımı: Paris FR + Paris US ayrı", parisFR && parisUS, `FR=${parisFR} US=${parisUS}`);

  console.log(`\nÖzet: ${count} kayıt · TR hariç ${data.excludedTR} · kaynak ${data._source}`);
  console.log(fail === 0
    ? "\nSONUÇ: ✅ PASS — dataset bütünlüğü doğrulandı (exit 0)"
    : `\nSONUÇ: ❌ FAIL — ${fail} kontrol başarısız (exit 1)`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
