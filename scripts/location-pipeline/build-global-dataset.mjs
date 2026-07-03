#!/usr/bin/env node
/**
 * scripts/location-pipeline/build-global-dataset.mjs
 * FAZ 5 / P5f-1 — GeoNames tabanlı global konum dataset pipeline'ı.
 *
 * GeoNames `cities15000` dökümünü (pop>15.000) indirir, ülke/bölge adlarıyla
 * zenginleştirir, TÜRKİYE kayıtlarını HARİÇ tutar (TR 81 il authoritative kalır),
 * IANA timezone + koordinat doğrulaması yapar ve `Location` şemasına uygun,
 * SERVER-ONLY trimmed bir artefakt üretir:
 *   lib/location/server-data/global-cities.json
 *
 * KAPSAM (P5f-1): yalnız veri üretimi. Client/UI/API/motor/DB'ye DOKUNMAZ.
 * Artefakt hiçbir client modülü tarafından import EDİLMEZ (yalnız gelecekteki
 * server-side arama route'u P5f-2 okuyacak).
 *
 * Kaynak & lisans: GeoNames (https://www.geonames.org) — Creative Commons
 * Attribution 4.0 (CC-BY 4.0). Kullanımda ATIF ZORUNLU: "Konum verisi: GeoNames, CC-BY 4.0".
 *
 * Bağımlılık YOK: indirme global fetch (Node 24), zip açımı node:zlib inflateRawSync.
 * Ham dosyalar .cache/ altında tutulur (gitignore) — commit edilmez.
 *
 * Çalıştır:  node scripts/location-pipeline/build-global-dataset.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, ".cache");
const OUT = join(HERE, "..", "..", "lib", "location", "server-data", "global-cities.json");
const BASE = "https://download.geonames.org/export/dump";

const EXCLUDE_CC = "TR"; // Türkiye authoritative olarak TR_LOCATIONS (81 il) — dataset'ten hariç.

// ── indirici (cache'li) ───────────────────────────────────────────────────────
async function download(name) {
  const dest = join(CACHE, name);
  if (existsSync(dest)) return readFileSync(dest);
  console.log(`  indiriliyor: ${name}`);
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`${name} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return buf;
}

// ── zip'ten .txt çıkar (central directory + raw inflate; bağımlılık yok) ───────
function extractTxtFromZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Zip EOCD bulunamadı");
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Central directory bozuk");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (name.endsWith(".txt")) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const comp = buf.subarray(start, start + compSize);
      return (method === 0 ? comp : inflateRawSync(comp)).toString("utf8");
    }
    p += 46 + nameLen + extraLen + commLen;
  }
  throw new Error("Zip içinde .txt yok");
}

// ── IANA tz doğrulama (Intl; cache'li) ────────────────────────────────────────
const tzCache = new Map();
function validTz(tz) {
  if (!tz) return false;
  if (tzCache.has(tz)) return tzCache.get(tz);
  let ok = true;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { ok = false; }
  tzCache.set(tz, ok);
  return ok;
}

function intOrZero(...vals) {
  for (const v of vals) {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n !== -9999) return n;
  }
  return 0;
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(dirname(OUT), { recursive: true });

  console.log("GeoNames global dataset pipeline (P5f-1)");
  const [zipBuf, countryBuf, admin1Buf] = await Promise.all([
    download("cities15000.zip"),
    download("countryInfo.txt"),
    download("admin1CodesASCII.txt"),
  ]);
  const countryTxt = countryBuf.toString("utf8");
  const admin1Txt = admin1Buf.toString("utf8");

  // Ülke kodu (alpha2) → ülke adı
  const countryName = new Map();
  for (const line of countryTxt.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const c = line.split("\t");
    if (c[0] && c[4]) countryName.set(c[0], c[4]);
  }

  // "CC.admin1code" → bölge adı (asciiname tercih)
  const adminName = new Map();
  for (const line of admin1Txt.split("\n")) {
    if (!line) continue;
    const c = line.split("\t");
    if (c[0]) adminName.set(c[0], (c[2] || c[1] || "").trim());
  }

  const cities = extractTxtFromZip(zipBuf);
  const lines = cities.split("\n");

  let total = 0, excludedTR = 0, badTz = 0, badCoord = 0, badName = 0;
  const seen = new Set();
  const out = [];

  for (const line of lines) {
    if (!line) continue;
    total++;
    const c = line.split("\t");
    // GeoNames cities dump kolon indeksleri (0-based):
    // 0 geonameid,1 name,4 lat,5 lon,8 country,10 admin1,14 pop,15 elev,16 dem,17 tz
    const cc = c[8];
    if (cc === EXCLUDE_CC) { excludedTR++; continue; }
    const name = (c[1] || "").trim();
    if (!name) { badName++; continue; }
    const lat = parseFloat(c[4]);
    const lon = parseFloat(c[5]);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) { badCoord++; continue; }
    const tz = (c[17] || "").trim();
    if (!validTz(tz)) { badTz++; continue; }

    const id = `gn-${c[0]}`;
    if (seen.has(id)) continue;
    seen.add(id);

    out.push({
      id,
      name,
      country: countryName.get(cc) || cc,
      countryCode: cc,
      adminRegion: adminName.get(`${cc}.${c[10]}`) || "",
      lat: +lat.toFixed(4),   // ~11m; astronomik etki ihmal edilebilir, artefakt boyutunu düşürür
      lon: +lon.toFixed(4),
      elev: intOrZero(c[15], c[16]),
      tz,
      source: "geonames",
      verified: true,
      origin: "bundled",
      population: intOrZero(c[14]),
    });
  }

  // Sıralama: nüfus azalan (büyük şehir üstte → arama/sıralama ve bilinen-şehir kontrolü kolay)
  out.sort((a, b) => b.population - a.population || a.name.localeCompare(b.name, "en"));

  const artifact = {
    _license: "GeoNames — Creative Commons Attribution 4.0 (CC-BY 4.0)",
    _attribution: "Konum verisi: GeoNames, CC-BY 4.0 (https://www.geonames.org)",
    _source: "cities15000 (population > 15000) + countryInfo + admin1CodesASCII",
    _note: "SERVER-ONLY. Client bundle'a import EDİLMEZ. Türkiye (TR) HARİÇ — TR_LOCATIONS (81 il) authoritative.",
    count: out.length,
    excludedTR,
    locations: out,
  };
  writeFileSync(OUT, JSON.stringify(artifact), "utf8");

  const bytes = Buffer.byteLength(JSON.stringify(artifact));
  console.log(`  toplam satır      : ${total}`);
  console.log(`  TR hariç tutulan  : ${excludedTR}`);
  console.log(`  atlanan (tz)      : ${badTz}`);
  console.log(`  atlanan (koord)   : ${badCoord}`);
  console.log(`  atlanan (isim)    : ${badName}`);
  console.log(`  ARTEFAKT kaydı    : ${out.length}  (${(bytes / 1048576).toFixed(2)} MB)`);
  console.log(`  -> ${OUT}`);
}

main().catch((e) => { console.error("HATA:", e.message); process.exit(1); });
