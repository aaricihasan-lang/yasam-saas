// HD — Türkiye 973 resmî ilçe dizini · İSTEMCİ + SUNUCU ortak yardımcıları (koordinat YOK).
//
//   • searchTrDistricts: yerel, anında ilçe araması (Roxy çağrısı yok).
//   • canonicalHdLocationId / sameHdLocationId: eski konum kimlikleri (Roxy arama kimliği, 81-il
//     listesindeki il merkezi kimliği) ile yeni ilçe kimliğinin AYNI yer olduğunu bilir. Takma ad
//     yalnız derleyicinin doğruladığı tek-yer eşleşmeleridir (belirsiz kimlikler dizine alınmadı).
//   • isTrDistrictProxy: koordinatı doğrulanamayan 12 ilçe (hesapta il merkezi kullanılır).
// Koordinatlar yalnız sunucudadır (trDistricts.ts).

import { normalizeLocationQuery } from "@/lib/location";
import { TR_DISTRICT_ROWS } from "./trDistrictIndex.generated";

export const TR_DISTRICT_TZ = "Europe/Istanbul";
export const TR_DISTRICT_ID_PREFIX = "trd-";

/** Vekil kayıt açıklaması (koordinat yerine gösterilir). */
export const TR_DISTRICT_PROXY_NOTE =
  "İlçe merkezi koordinatı doğrulanamadı; hesapta il merkezi koordinatı kullanıldı. Saat dilimi aynı olduğundan Human Design sonucu etkilenmez.";

export type TrDistrictItem = { id: string; ilce: string; il: string; label: string; tz: typeof TR_DISTRICT_TZ; proxy: boolean };

type Row = (typeof TR_DISTRICT_ROWS)[number];
const toItem = (r: Row): TrDistrictItem => ({ id: r[0], ilce: r[1], il: r[2], label: `${r[1]}, ${r[2]}, Türkiye`, tz: TR_DISTRICT_TZ, proxy: r[3] === 1 });

const BY_ID = new Map<string, Row>(TR_DISTRICT_ROWS.map((r) => [r[0], r]));
const ALIAS = new Map<string, string>();
for (const r of TR_DISTRICT_ROWS) for (const a of r[4]) ALIAS.set(a, r[0]);
const FOLDED = TR_DISTRICT_ROWS.map((r) => ({ row: r, ilce: normalizeLocationQuery(r[1]), il: normalizeLocationQuery(r[2]) }));

export function isTrDistrictId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith(TR_DISTRICT_ID_PREFIX) && BY_ID.has(id);
}

export function getTrDistrictItem(id: unknown): TrDistrictItem | null {
  const r = typeof id === "string" ? BY_ID.get(id) : undefined;
  return r ? toItem(r) : null;
}

/** Eski kimlik bir ilçenin takma adıysa o ilçenin kimliği; değilse kimliğin kendisi. */
export function canonicalHdLocationId(id: string): string {
  return ALIAS.get(id) ?? id;
}

/** İki konum kimliği aynı yer mi? (birebir veya doğrulanmış takma ad eşdeğerliği) */
export function sameHdLocationId(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a === b || canonicalHdLocationId(a) === canonicalHdLocationId(b);
}

/** Kimlik (veya takma adı) vekil koordinatlı ilçe mi? */
export function isTrDistrictProxy(id: string | null | undefined): boolean {
  if (!id) return false;
  return BY_ID.get(canonicalHdLocationId(id))?.[3] === 1;
}

/** Yerel ilçe araması (Türkçe/ASCII yazım farkına duyarsız). "Karesi", "karesi", "Altieylul"… */
export function searchTrDistricts(query: string, limit = 8): TrDistrictItem[] {
  const q = normalizeLocationQuery(query);
  if (q.length < 2) return [];
  const scored: { row: Row; score: number }[] = [];
  for (const f of FOLDED) {
    let score = 0;
    if (f.ilce === q) score = 100;
    else if (f.ilce.startsWith(q)) score = 80;
    else if (q.length >= 3 && f.ilce.includes(q)) score = 60;
    else if (q.length >= 3 && `${f.ilce} ${f.il}`.startsWith(q)) score = 55; // "karesi balikesir"
    else if (q.length >= 3 && f.il.startsWith(q)) score = 30; // il adıyla ilçeleri listele
    if (score) scored.push({ row: f.row, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.row[1].localeCompare(b.row[1], "tr") || a.row[2].localeCompare(b.row[2], "tr"))
    .slice(0, limit)
    .map((x) => toItem(x.row));
}
