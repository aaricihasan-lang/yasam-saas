/**
 * HD — Türkiye 973 resmî ilçe konum dizini · DERLEYİCİ (deterministik).
 *
 * Girdi (scripts/hd-location/tr-districts/sources/):
 *   • eicisleri-ilceler.json     — resmî il/ilçe adları (e-İçişleri, 81 il / 973 ilçe)
 *   • selection.json             — ilçe başına koordinat kaynağı kararı (denetim çıktısı)
 *   • geonames-tr-subset.json    — GeoNames CC BY 4.0 alt kümesi (değiştirilmemiş)
 *   • wikidata-tr-subset.json    — Wikidata CC0 alt kümesi
 *   • manifest.json              — kaynak sürüm/tarih/lisans bilgisi
 *   • lib/location/tr.ts         — 81 il merkezi (vekil hesap koordinatı + il adları)
 * Çıktı:
 *   • lib/human-design/location/trDistricts.generated.json (YALNIZ SUNUCU; koordinatlı)
 *   • lib/human-design/location/trDistrictIndex.generated.ts (istemci; KOORDİNATSIZ)
 *
 * Kurallar: Roxy yanıtı KULLANILMAZ · OSM değeri YAZILMAZ · koordinat 4 ondalık (kaynak değerin
 * ROUND_HALF_UP yuvarlaması; yapay değişiklik YOK) · saat dilimi Europe/Istanbul · vekil kayıt
 * koordinatı il merkezidir ve ilçe koordinatı olarak gösterilmez.
 *
 * Çalıştır: npx tsx scripts/hd-location/tr-districts/build.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { TR_LOCATIONS } from "../../../lib/location/tr";
import { roxyCityToLocation } from "../../../lib/human-design/api/hdLocationRef";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const SRC = join(HERE, "sources");
const read = <T>(f: string): T => JSON.parse(readFileSync(join(SRC, f), "utf8")) as T;

type Selection = {
  il: string;
  ilce: string;
  plaka: string;
  durum: "dogrulandi" | "vekil";
  kaynak: { tur: "geonames" | "wikidata" | "il-merkezi-vekil"; ref?: string | number; neden?: string };
  lat?: number;
  lon?: number;
  roxyAliasFrom?: number;
};
type GnRec = { id: number; name: string; asciiname: string; lat: string; lon: string; fcode: string; admin1: string; admin1Name: string; population: number };
type WdRec = { qid: string; label: string; province: string | null; p36: [number | null, number | null]; p625: [number | null, number | null] };

const official = read<Record<string, string[]>>("eicisleri-ilceler.json");
const selection = read<Selection[]>("selection.json");
const gn = new Map(read<{ records: GnRec[] }>("geonames-tr-subset.json").records.map((r) => [r.id, r]));
const wd = new Map(read<{ records: WdRec[] }>("wikidata-tr-subset.json").records.map((r) => [r.qid, r]));
const manifest = read<Record<string, unknown>>("manifest.json");

/** Türkçe büyük harf → başlık biçimi ("ALTIEYLÜL" → "Altıeylül", "19 MAYIS" → "19 Mayıs"). */
export function trTitle(upper: string): string {
  return upper
    .split(" ")
    .map((w) => {
      const low = w.replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr-TR");
      return low ? low.charAt(0).toLocaleUpperCase("tr-TR") + low.slice(1) : low;
    })
    .join(" ");
}

/** Kimlik parçası: Türkçe karakterler sadeleştirilir, yalnız [a-z0-9-]. */
export function idSlug(v: string): string {
  return v
    .replace(/İ/g, "i").replace(/I/g, "ı").toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/â/g, "a").replace(/î/g, "i").replace(/û/g, "u")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const q4 = (s: string | number): number => {
  // ROUND_HALF_UP, 4 ondalık — kaynak değerin ondalık gösterimi üzerinden (ikili kayan nokta hatası yok).
  const str = String(s);
  const neg = str.startsWith("-");
  const [i, f = ""] = str.replace("-", "").split(".");
  const digits = (f + "00000").slice(0, 5);
  let n = BigInt(i + digits.slice(0, 4));
  if (Number(digits[4]) >= 5) n += BigInt(1);
  const out = Number(n) / 10000;
  return neg ? -out : out;
};

const provinceByPlate = new Map(TR_LOCATIONS.map((l) => [l.id.slice(3, 5), l]));

export type TrDistrictRecord = {
  id: string;
  il: string;
  ilce: string;
  plaka: string;
  label: string;
  tz: "Europe/Istanbul";
  lat: number;
  lon: number;
  durum: "dogrulandi" | "vekil";
  kaynak: string;
  aliases: string[];
};

const out: TrDistrictRecord[] = [];
const errors: string[] = [];
for (const s of selection) {
  const prov = provinceByPlate.get(s.plaka);
  if (!prov) { errors.push(`il bulunamadı: ${s.plaka}`); continue; }
  if (!(official[s.il] ?? []).includes(s.ilce)) errors.push(`resmî listede yok: ${s.ilce}/${s.il}`);
  const ilce = trTitle(s.ilce);
  const id = `trd-${s.plaka}-${idSlug(s.ilce)}`;
  let lat: number; let lon: number; let kaynak: string;
  if (s.durum === "vekil") {
    lat = prov.lat; lon = prov.lon; kaynak = `il-merkezi-vekil:${prov.id}`;
  } else if (s.kaynak.tur === "geonames") {
    const g = gn.get(Number(s.kaynak.ref));
    if (!g) { errors.push(`GeoNames kaydı yok: ${s.kaynak.ref}`); continue; }
    lat = q4(g.lat); lon = q4(g.lon); kaynak = `geonames:${g.id}`;
  } else {
    const [qid, prop] = String(s.kaynak.ref).split("#");
    const w = wd.get(qid);
    const p = w ? (prop === "P36" ? w.p36 : w.p625) : null;
    if (!p || p[0] == null || p[1] == null) { errors.push(`Wikidata koordinatı yok: ${s.kaynak.ref}`); continue; }
    lat = q4(p[0]); lon = q4(p[1]); kaynak = `wikidata:${qid}#${prop}`;
  }
  if (s.lat !== undefined && (s.lat !== lat || s.lon !== lon)) errors.push(`seçim/derleme koordinatı uyuşmuyor: ${id}`);

  // Eski konum kimlikleriyle uyumluluk (yalnız AYNI yer için):
  //  • Roxy araması kimliği — uygulamanın kendi roxyCityToLocation biçimi, GeoNames ad alanlarından.
  //  • 81-il listesi kimliği — yalnız il merkezi ilçesi ("Merkez") için.
  const aliases: string[] = [];
  if (s.roxyAliasFrom != null) {
    const g = gn.get(Number(s.roxyAliasFrom));
    if (g) {
      aliases.push(
        roxyCityToLocation({ city: g.asciiname, province: g.admin1Name, country: "Turkey", iso2: "TR", latitude: 0, longitude: 0, timezone: "Europe/Istanbul" }).id,
      );
    }
  }
  if (s.ilce === "MERKEZ") aliases.push(prov.id);

  out.push({
    id,
    il: prov.name,
    ilce,
    plaka: s.plaka,
    label: `${ilce}, ${prov.name}, Türkiye`,
    tz: "Europe/Istanbul",
    lat,
    lon,
    durum: s.durum,
    kaynak,
    aliases,
  });
}

out.sort((a, b) => a.plaka.localeCompare(b.plaka) || a.ilce.localeCompare(b.ilce, "tr"));
const ids = new Set(out.map((r) => r.id));
if (ids.size !== out.length) errors.push("yinelenen kimlik");
const coords = new Set(out.map((r) => `${r.lat},${r.lon}`));
if (coords.size !== out.length) errors.push("yinelenen hesap koordinatı");
const aliasOwner = new Map<string, string>();
for (const r of out) for (const a of r.aliases) {
  if (aliasOwner.has(a)) errors.push(`takma ad iki ilçede: ${a} (${aliasOwner.get(a)} / ${r.id})`);
  aliasOwner.set(a, r.id);
}
const total = Object.values(official).reduce((n, v) => n + v.length, 0);
if (out.length !== total || total !== 973) errors.push(`kapsam: ${out.length}/${total}`);
if (errors.length) {
  console.error("DERLEME DURDU:\n  " + errors.join("\n  "));
  process.exit(1);
}

const header = {
  _aciklama: "Human Design — Türkiye 973 resmî ilçe konum dizini (YALNIZ SUNUCU). scripts/hd-location/tr-districts/build.ts ile üretilir; elle düzenlemeyin.",
  _lisans: "Koordinatlar: GeoNames (https://www.geonames.org) CC BY 4.0 ve Wikidata CC0 1.0. Resmî adlar: e-İçişleri Mülki İdare Bölümleri. Vekil kayıtlar uygulamanın 81 il merkezi listesini kullanır.",
  _kaynaklar: manifest,
};
writeFileSync(
  join(ROOT, "lib/human-design/location/trDistricts.generated.json"),
  JSON.stringify({ ...header, records: out }, null, 1) + "\n",
  "utf8",
);

// İstemci dizini: KOORDİNAT YOK. [id, ilçe, il, durum(0=doğrulandı,1=vekil), takma adlar]
const rows = out.map((r) => [r.id, r.ilce, r.il, r.durum === "vekil" ? 1 : 0, r.aliases] as const);
const ts = `// Human Design — Türkiye 973 resmî ilçe İSTEMCİ dizini (koordinatsız).
// scripts/hd-location/tr-districts/build.ts ile üretilir; elle düzenlemeyin.
// Kaynak: e-İçişleri resmî adları. Koordinatlar yalnız sunucudadır (trDistricts.generated.json).
// Satır: [kimlik, ilçe, il, vekil (1) / doğrulanmış (0), eski kimlik takma adları]

export const TR_DISTRICT_ROWS: ReadonlyArray<readonly [string, string, string, 0 | 1, readonly string[]]> = ${JSON.stringify(rows)};
`;
writeFileSync(join(ROOT, "lib/human-design/location/trDistrictIndex.generated.ts"), ts, "utf8");

const proxies = out.filter((r) => r.durum === "vekil");
console.log(`DERLENDİ: ${out.length} ilçe · ${new Set(out.map((r) => r.il)).size} il · doğrulanmış ${out.length - proxies.length} · vekil ${proxies.length} · takma ad ${aliasOwner.size}`);
