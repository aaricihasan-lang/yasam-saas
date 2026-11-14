// Astroloji — ATL-B04 (14.11.2026): secondary progression EV ÇERÇEVELERİ (SAF; ekran, çark ve Word/PDF aynı fonksiyonu kullanır).
//
// Kök neden (30.10.2026 büyük denetim, 302 gerçek yanıt): ekran ve rapor "Ev" sütununu ilerletilmiş Yükselen'den tam burç evi
// diye etiketliyordu, oysa değer sağlayıcının `planets[].house` alanıdır ve sağlayıcı sözleşmesine göre (OpenAPI 2.0.0
// /astrology/progressions) bu NATAL evdir: "Natal house the progressed body occupies, read against the natal cusps in the
// requested houseSystem" (gövdede houseSystem yok → varsayılan Placidus). Bağımsız ölçüm: 302/302 haritada natal Placidus ev
// başlarıyla birebir; ilerletilmiş Yükselen'den tam burçla 298/302 haritada en az bir noktada farklı. Tek çark ise tam burç
// evleriyle çiziliyordu → çark ile tablo çelişiyordu.
//
// Düzeltme (hesap değiştirilmeden, iki ayrı ve doğru etiketli çerçeve):
//   - NATAL EV: ilerletilmiş gezegenin natal evlerdeki yeri — progresyon okumasının standart çerçevesi (sağlayıcı da bunu verir).
//     Natal çerçeve (aynı revizyonun kayıtlı natal analizi) varsa çift halkadaki ev başlarıyla YEREL hesaplanır (çift halka = tablo,
//     natal analizin ev sistemiyle); yoksa sağlayıcının natal Placidus ev numarası aynen gösterilir.
//   - İLERLETİLMİŞ HARİTA EVİ: ilerletilmiş Yükselen'in burcundan sayılan tam burç evi — kayıtlı ilerletilmiş Yükselen ve gezegen
//     boylamlarından aritmetik (yeni istek yok); tek ilerletilmiş çark aynı kuralla çizilir.
// Kayıtlı teknik katman DEĞİŞMEZ (bodies[].house = sağlayıcının natal ev değeri); eski kayıtlar aynı fonksiyonla doğru etiketlenir.

import { NATAL_HOUSE_SYSTEM_LABELS } from "./labels/tr";
import { SIGN_IDS, type SignId } from "./model/western";
import type { ProgressionTechnical } from "./model/westernTiming";
import { natalHouseOf } from "./transitDetail";

const norm = (x: number) => ((x % 360) + 360) % 360;
const signIndex = (lon: number) => Math.floor(norm(lon) / 30) % 12;

/** İlerletilmiş Yükselen'in burcundan sayılan TAM BURÇ evi (1–12). */
export function progressedWholeSignHouse(longitude: number, progressedAscendant: number): number {
  return ((signIndex(longitude) - signIndex(progressedAscendant) + 12) % 12) + 1;
}

/** Tek ilerletilmiş çarkın ev başları: ilerletilmiş Yükselen burcunun 0°'sinden 30° aralıklı. */
export function progressedWholeSignCusps(progressedAscendant: number): { number: number; longitude: number; sign: SignId; degreeInSign: number }[] {
  const first = signIndex(progressedAscendant) * 30;
  return Array.from({ length: 12 }, (_, i) => {
    const lon = (first + i * 30) % 360;
    return { number: i + 1, longitude: lon, sign: SIGN_IDS[Math.floor(lon / 30)] as SignId, degreeInSign: 0 };
  });
}

export const PROGRESSED_CHART_HOUSE_LABEL = "İlerletilmiş harita evi (tam burç)";
/** Dar ekran (<640 px) başlığı — owner kararı 14.11.2026 (A seçeneği); masaüstü ve Word/PDF tam etiketi kullanır. */
export const PROGRESSED_CHART_HOUSE_SHORT_LABEL = "İlerl. ev (tam burç)";
export const PROGRESSED_CHART_HOUSE_METHOD = "İlerletilmiş Yükselen'in burcundan sayılan tam burç evleri (ilerletilmiş harita çarkı bu evlerle çizilir)";

export type ProgressionHouseColumns = {
  natal: { label: string; method: string; source: "natal_frame" | "provider"; of: (id: string) => number | null } | null;
  progressed: { label: string; method: string; of: (id: string) => number | null } | null;
};

/**
 * Tablonun iki ev sütunu. Saat bilinmiyorsa (maskeli görünüm: bodies[].house null, angles null, natalFrame null) iki sütun da yok.
 * Natal sütun: çerçeve varsa çerçevenin 12 ev başından (çift halkayla aynı), yoksa sağlayıcının natal Placidus değeri.
 */
export function progressionHouseColumns(t: Pick<ProgressionTechnical, "bodies" | "angles" | "natalFrame">): ProgressionHouseColumns {
  const byId = new Map(t.bodies.map((b) => [b.id as string, b]));
  const f = t.natalFrame && Array.isArray(t.natalFrame.houses) && t.natalFrame.houses.length === 12 ? t.natalFrame : null;
  let natal: ProgressionHouseColumns["natal"] = null;
  if (f) {
    const hs = NATAL_HOUSE_SYSTEM_LABELS[f.houseSystem] ?? String(f.houseSystem);
    natal = {
      label: `Natal ev (${hs})`,
      method: `İlerletilmiş gezegenin natal haritadaki evi — kayıtlı natal analizin ${hs} ev başlarına göre (çift halkadaki natal evler)`,
      source: "natal_frame",
      of: (id) => {
        const b = byId.get(id);
        return b ? natalHouseOf(b.longitude, f.houses) : null;
      },
    };
  } else if (t.bodies.some((b) => typeof b.house === "number")) {
    natal = {
      label: "Natal ev (Placidus)",
      method: "İlerletilmiş gezegenin natal haritadaki evi — hesaplama hizmetinin natal Placidus ev başlarına göre verdiği değer",
      source: "provider",
      of: (id) => {
        const h = byId.get(id)?.house;
        return typeof h === "number" ? h : null;
      },
    };
  }
  const asc = t.angles?.ascendant.longitude;
  const progressed: ProgressionHouseColumns["progressed"] =
    typeof asc === "number" && Number.isFinite(asc)
      ? {
          label: PROGRESSED_CHART_HOUSE_LABEL,
          method: PROGRESSED_CHART_HOUSE_METHOD,
          of: (id) => {
            const b = byId.get(id);
            return b ? progressedWholeSignHouse(b.longitude, asc) : null;
          },
        }
      : null;
  return { natal, progressed };
}
