// HD — Roxy konum araması sonuçlarını istemci sonucuna çevirir (server-only, SAF; test edilebilir).
//
//   • Türkiye etiketli ama saat dilimi Europe/Istanbul olmayan sonuç ATILIR (ör. Cey — gerçekte Irak).
//   • HD 973 ilçe dizininde doğrulanmış karşılığı olan sonuç yerel ilçe kimliğine (`trd-…`) çevrilir;
//     hesap koordinatı sunucu veri setinden çözülür (Roxy'de yanlış yere düşen kayıtlar dahil).
//   • Diğerleri (yurt dışı, köy/mahalle) HMAC-imzalı referansla döner.
// İmzalama sırrı yoksa null (çağıran 503 döner; fail-closed).

import type { HdBirthLocation } from "@/lib/human-design/api/hdBirthLocation";
import { isTrIdWithForeignTz } from "@/lib/human-design/api/hdLocationRef";
import { trDistrictForLegacyId } from "./trDistricts";

export type HdSearchResult = { ref: string; id: string; label: string; tz: string };

export function toHdSearchResults(locations: HdBirthLocation[], sign: (l: HdBirthLocation) => string | null): HdSearchResult[] | null {
  const results: HdSearchResult[] = [];
  const seen = new Set<string>();
  for (const l of locations) {
    if (isTrIdWithForeignTz(l.id, l.timezone)) continue;
    const d = trDistrictForLegacyId(l.id);
    if (d) {
      if (!seen.has(d.id)) results.push({ ref: d.id, id: d.id, label: d.label, tz: d.tz });
      seen.add(d.id);
      continue;
    }
    const ref = sign(l);
    if (!ref) return null;
    results.push({ ref, id: l.id, label: l.label, tz: l.timezone });
  }
  return results;
}
