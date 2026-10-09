// HD — Türkiye 973 resmî ilçe dizini · SUNUCU çözümü (koordinatlı; client bundle'a GİRMEZ).
//
// Yalnız sunucu kodundan (hdBirthLocation → API uçları) import edilir. Hesaplama koordinatı ve
// saat dilimi YALNIZ bu veri setinden çözülür; istemcinin gönderdiği koordinat/saat dilimine
// güvenilmez. Vekil (12) kayıtların koordinatı il merkezidir: yalnız hesap içindir, ilçe koordinatı
// olarak gösterilmez (TR_DISTRICT_PROXY_NOTE).

import data from "./trDistricts.generated.json";
import { TR_DISTRICT_TZ } from "./trDistrictIndex";

export type TrDistrictRecord = {
  id: string;
  il: string;
  ilce: string;
  plaka: string;
  label: string;
  tz: typeof TR_DISTRICT_TZ;
  lat: number;
  lon: number;
  durum: "dogrulandi" | "vekil";
  kaynak: string;
  aliases: string[];
};

export const TR_DISTRICT_RECORDS: ReadonlyArray<TrDistrictRecord> = data.records as TrDistrictRecord[];

const BY_ID = new Map(TR_DISTRICT_RECORDS.map((r) => [r.id, r]));
const BY_ALIAS = new Map<string, TrDistrictRecord>();
for (const r of TR_DISTRICT_RECORDS) for (const a of r.aliases) BY_ALIAS.set(a, r);

export function getTrDistrictRecord(id: unknown): TrDistrictRecord | null {
  return typeof id === "string" ? (BY_ID.get(id) ?? null) : null;
}

/** Eski konum kimliği (Roxy arama / il merkezi) doğrulanmış bir ilçeye karşılık geliyorsa o ilçe. */
export function trDistrictForLegacyId(id: unknown): TrDistrictRecord | null {
  return typeof id === "string" ? (BY_ALIAS.get(id) ?? null) : null;
}
