// Gökyüzü Atlası — sabit yıldız ekranı için SAF görünüm yardımcıları (istemci + test).
// Hesap YAPMAZ: yalnız kayıtlı teknik katmanı süzer/sıralar. Orb filtresi = sağlayıcının 3° yanıtının alt kümesi
// (2026-10-14 golden: orb=1 yanıtı, orb=3 yanıtının ≤1° temaslarıyla birebir aynı) → yeni istek gerekmez.

import { FIXED_STAR_CATALOG, FIXED_STAR_FAR_LAT, fixedStarName } from "@/lib/astrology/labels/fixedStars";
import type { FixedStar, FixedStarContact, FixedStarsInterpretation } from "@/lib/astrology/model/westernFixedStars";
import type { SignId } from "@/lib/astrology/model/western";

export type StarSort = "zodiac" | "brightness" | "name" | "orb";
export type StarFilter = {
  query: string;
  sign: SignId | "";
  /** "" = tümü; sayı = bu kadirden parlak (küçük değer) yıldızlar. */
  maxMagnitude: number | null;
  onlyContacts: boolean;
  group: "" | "royal" | "behenian" | "far";
  nature: string;
  sort: StarSort;
};
export const DEFAULT_STAR_FILTER: StarFilter = { query: "", sign: "", maxMagnitude: null, onlyContacts: false, group: "", nature: "", sort: "zodiac" };

/** Türkçe/aksan duyarsız arama anahtarı (İ/ı, ü, ö, ş, ç, ğ ve Bayer Yunan harfleri dahil). */
export function foldText(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9α-ω]+/g, " ")
    .trim();
}

export function starSearchText(id: string): string {
  const c = FIXED_STAR_CATALOG[id];
  return foldText([fixedStarName(id), id, c?.bayer ?? "", c?.constellation ?? "", ...(c?.altNames ?? [])].join(" "));
}

export function isFarFromEcliptic(id: string): boolean {
  const c = FIXED_STAR_CATALOG[id];
  return !!c && Math.abs(c.latJ2000) > FIXED_STAR_FAR_LAT;
}

export function contactsInOrb(contacts: readonly FixedStarContact[], orb: number): FixedStarContact[] {
  return contacts.filter((c) => c.orb <= orb + 1e-9);
}

/** Katalog süzgeci — HİÇBİR yıldız varsayılan olarak gizlenmez (varsayılan süzgeç = 43/43). */
export function filterStars(stars: readonly FixedStar[], contacts: readonly FixedStarContact[], orb: number, f: StarFilter): FixedStar[] {
  const inOrb = contactsInOrb(contacts, orb);
  const minOrb = new Map<string, number>();
  for (const c of inOrb) minOrb.set(c.star, Math.min(minOrb.get(c.star) ?? 99, c.orb));
  const q = foldText(f.query);
  const out = stars.filter((s) => {
    if (q && !starSearchText(s.id).includes(q)) return false;
    if (f.sign && s.sign !== f.sign) return false;
    if (f.maxMagnitude !== null && !(s.magnitude <= f.maxMagnitude)) return false;
    if (f.onlyContacts && !minOrb.has(s.id)) return false;
    if (f.group === "royal" && !FIXED_STAR_CATALOG[s.id]?.royal) return false;
    if (f.group === "behenian" && !FIXED_STAR_CATALOG[s.id]?.behenian) return false;
    if (f.group === "far" && !isFarFromEcliptic(s.id)) return false;
    if (f.nature && !(s.nature ?? []).includes(f.nature as never)) return false;
    return true;
  });
  const byName = (a: FixedStar, b: FixedStar) => fixedStarName(a.id).localeCompare(fixedStarName(b.id), "tr");
  switch (f.sort) {
    case "brightness":
      return out.sort((a, b) => a.magnitude - b.magnitude || byName(a, b));
    case "name":
      return out.sort(byName);
    case "orb":
      return out.sort((a, b) => (minOrb.get(a.id) ?? 99) - (minOrb.get(b.id) ?? 99) || a.longitude - b.longitude);
    default:
      return out.sort((a, b) => a.longitude - b.longitude);
  }
}

/** Yorum katmanından kavuşum metni (yoksa null — uydurma yok). */
export function contactText(interp: FixedStarsInterpretation | null, star: string, point: string): string | null {
  return interp?.contacts.find((c) => c.star === star && c.point === point)?.text ?? null;
}

export function starKeywords(interp: FixedStarsInterpretation | null, star: string): string[] {
  return interp?.stars.find((s) => s.id === star)?.keywords ?? [];
}
