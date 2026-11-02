// Astroloji — TRANSİT TARAMASI (#646) teknik birleştiricisi. Saf; ağ / DB / env yok.
//
// Hesap yolu (owner 01.11.2026, Natal 8 ev deseni): tek birim = Natal birimi (Placidus + seçilen düğüm; aynı önbellek satırı).
// Natal sonucu önbellekteyse YENİ sağlayıcı çağrısı yoktur. Natal noktaların boylamı Natal teknik katmanından alınır; transit
// gezegenlerin orb pencereleri, tam anları, istasyon ve burç girişleri yerel motorda (lib/astrology/transits) taranır.

import type { NatalTechnical } from "../model/western";
import { TRANSIT_SCAN_TECHNICAL_SCHEMA, parseTransitScanOptions, transitScanDayMs, type TransitScanOptions, type TransitScanPoint, type TransitScanTechnical } from "../model/westernTransitScan";
import { isValidIanaTimeZone } from "../birth/timeResolution";
import { scanTransits } from "../transits/scan";

export const TRANSIT_SCAN_ID = "western.transit_scan" as const;
const DAY = 86_400_000;

export const parseTransitScanSelection = (raw: unknown): TransitScanOptions | null => parseTransitScanOptions(raw, isValidIanaTimeZone);

/** Natal birimi seçenekleri: Placidus tabanı (Yükselen/MC ev sisteminden bağımsız) + seçilen düğüm. */
export const transitScanNatalOptions = (o: Record<string, unknown>) => ({ houseSystem: "placidus", nodeType: o.nodeType === "mean" ? "mean" : "true" });

export function combineTransitScan(parts: unknown[], options: Record<string, unknown>): TransitScanTechnical {
  const o = parseTransitScanSelection(options);
  if (!o) throw new Error("transit taraması: geçersiz seçenek");
  const natal = parts[0] as NatalTechnical;
  const by = new Map(natal.bodies.map((b) => [b.id as string, b.longitude]));
  const natalPoints: { id: TransitScanPoint; lon: number }[] = [];
  for (const id of o.points) {
    const lon = id === "asc" ? natal.angles?.ascendant.longitude : id === "mc" ? natal.angles?.midheaven.longitude : by.get(id);
    if (typeof lon === "number" && Number.isFinite(lon)) natalPoints.push({ id, lon });
  }
  const scan = scanTransits({
    startUtcMs: transitScanDayMs(o.start)!,
    endUtcMs: transitScanDayMs(o.end)! + DAY,
    bodies: o.bodies,
    natalPoints,
    aspects: o.aspects,
    defaultOrb: o.orb,
    include: { natal: natalPoints.length > 0, mundane: false, stations: o.stations, ingresses: o.ingresses },
  });
  if ("error" in scan) throw new Error(`transit taraması: ${scan.error.code} (${scan.error.detail})`);
  return {
    schema: TRANSIT_SCAN_TECHNICAL_SCHEMA,
    zodiac: "tropical",
    nodeType: o.nodeType,
    range: { start: o.start, end: o.end },
    orb: o.orb,
    bodies: o.bodies,
    points: o.points,
    aspects: o.aspects,
    include: { stations: o.stations, ingresses: o.ingresses },
    displayTz: o.displayTz,
    natal: natalPoints,
    // Yakın yaklaşma olayları ekranda/raporda gösterilmez → kayıt boyutu için çıkarılır (pencerelerin `closest` alanı korunur).
    scan: { ...scan, events: scan.events.filter((e) => e.type !== "closest_approach") },
  };
}
