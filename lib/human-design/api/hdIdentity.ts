// HD — olası MÜKERRER kişi karşılaştırması (SAF; DB/ağ yok, istemci + sunucu ortak).
//
// Owner kuralı: OTOMATİK ENGEL / BİRLEŞTİRME / "aynı kişi" kararı YOK — yalnız UYARI adayı üretilir.
//   • Ad soyad: NFC + baş/son boşluk + çoklu boşluk + Türkçe küçük harf (İ→i, I→ı). Aksan/harf
//     KATLAMASI YOK (ı≠i, ş≠s) → yanlış pozitif üretilmez. Orijinal ad değişmez (yalnız karşılaştırma).
//   • Doğum tarihi gerçek tarih (YYYY-MM-DD) eşitliği; saat HH:MM eşitliği; yer yalnız TEKNİK konum
//     kimliği (birth_location_id) eşitliği — serbest yazı benzerliği kesinlik sayılmaz.
//   • Bilinen bir alan FARKLIYSA aday değildir (farklı kişi). Alan eksikse yalnız "possible".
//   • "exact" = ad + tarih + saat + teknik konum dördü de dolu ve eşit.

export type HdIdentityInput = {
  name: string | null | undefined;
  birthDate: string | null | undefined;
  birthTime: string | null | undefined;
  locationId: string | null | undefined;
};

export type HdIdentityMatch = "exact" | "possible";

export function normalizeHdPersonName(v: string | null | undefined): string {
  if (typeof v !== "string") return "";
  return v.normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR");
}

export function hdIsoDate(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const d = v.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

export function hdHhMm(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(v.trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

function cleanId(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** İki kayıt aynı kişi OLABİLİR mi? null = aday değil (farklı ya da karşılaştırılamaz). */
export function compareHdIdentity(a: HdIdentityInput, b: HdIdentityInput): HdIdentityMatch | null {
  const na = normalizeHdPersonName(a.name);
  const nb = normalizeHdPersonName(b.name);
  if (!na || na !== nb) return null;
  const da = hdIsoDate(a.birthDate);
  const db = hdIsoDate(b.birthDate);
  if (!da || da !== db) return null;
  const ta = hdHhMm(a.birthTime);
  const tb = hdHhMm(b.birthTime);
  if (ta && tb && ta !== tb) return null;
  const la = cleanId(a.locationId);
  const lb = cleanId(b.locationId);
  if (la && lb && la !== lb) return null;
  return ta && tb && la && lb ? "exact" : "possible";
}

/** Uyarıda gösterilecek aday (yalnız karşılaştırılan alanlar; telefon/not vb. YOK). */
export type HdDuplicateCandidate = {
  /** Onay anahtarı: "hd:<id>" | "journey:<id>" | "chart:<id>". */
  key: string;
  kind: "hd_profile" | "journey_client" | "chart";
  match: HdIdentityMatch;
  hdClientId: string | null;
  journeyClientId: string | null;
  chartId: string | null;
  name: string;
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  /** Doğrulanmış kayıt bağı (journey_client_id) — isim benzerliği değil. */
  linkedToJourney: boolean;
};

/** Bilinçli "farklı kişi" onayı YALNIZ gösterilen adayları kapsar; yeni çıkan aday tekrar sorulur. */
export function hdDuplicatesAcknowledged(candidates: readonly HdDuplicateCandidate[], ack: unknown): boolean {
  if (candidates.length === 0) return true;
  if (!Array.isArray(ack)) return false;
  const set = new Set(ack.filter((x): x is string => typeof x === "string"));
  return candidates.every((c) => set.has(c.key));
}

/** İstemciden gelen onay listesi: yalnız bilinen biçimli anahtarlar, en çok 50. */
export function readHdAckKeys(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string" && /^(hd|journey|chart):[0-9a-f-]{36}$/i.test(x))
    .slice(0, 50);
}
