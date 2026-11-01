// Astroloji — NATAL 8 EV SİSTEMİ entegrasyonu (Aşama 2; #643/#655 motoru → mevcut Natal API).
//
// Ev motoru ürün katmanındadır (lib/astrology/houses: engine.ts + natalLocal.ts; #643/#655'ten taşındı). Ürün kodu
// lib/astrology/pro/** import ETMEZ (Z19 / A14; istisna yok). Saf; ağ / DB / env yok.
//
// Kurallar (owner 31.10.2026, 12-PR643-NATAL-ENTEGRASYON-PLANI):
//   • Natal 8 sistem kabul eder; diğer Batı teknikleri mevcut 4 sistemlik doğrulamayı (HOUSE_SYSTEMS) korur.
//   • Klasik sistem seçilince sağlayıcıya PLACIDUS isteği gider (aynı gövde + aynı adaptör sürümü → aynı input_hash → aynı önbellek
//     satırı; yeni ücretli çağrı yok). Saklanan satır saf Placidus kalır; klasik evler GÖRÜNÜMDE türetilir.
//   • Sağlayıcının ev numaraları ve ev atfı içeren gezegen yorumları klasik sistemde gösterilmez.

import type { HouseSystem, NatalInterpretation, NatalTechnical, NodeType } from "../model/western";
import { NODE_TYPES } from "../model/western";
import { LOCAL_NATAL_INTERP_NOTE } from "../model/natalHouseSystems";
import {
  NATAL_HIGH_LATITUDE_WARN,
  NATAL_HOUSE_SYSTEMS,
  deriveLocalNatalHouses,
  isLocalNatalHouseSystem,
  isNatalHouseSystem,
  natalHouseSystemUndefinedAtPolar,
  providerHouseSystemFor,
  sanitizeNatalInterpretationForLocalHouses,
  type LocalNatalTechnical,
  type NatalHouseSystem,
} from "../houses/natalLocal";

export { NATAL_HOUSE_SYSTEMS, isLocalNatalHouseSystem, natalHouseSystemUndefinedAtPolar, providerHouseSystemFor, type NatalHouseSystem };

/** Natal seçimi (8 sistem). Varsayılanlar mevcut parseNatalOptions ile aynı (placidus / true). */
export type NatalSelectionOptions = { houseSystem: NatalHouseSystem; nodeType: NodeType };

export function parseNatalSelectionOptions(raw: unknown): NatalSelectionOptions | null {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const houseSystem = o.houseSystem ?? "placidus";
  const nodeType = o.nodeType ?? "true";
  if (!isNatalHouseSystem(houseSystem)) return null;
  if (!(NODE_TYPES as readonly unknown[]).includes(nodeType)) return null;
  return { houseSystem, nodeType: nodeType as NodeType };
}

/** Sağlayıcıya gidecek (ve önbellek anahtarına girecek) seçenekler: klasik sistemde Placidus. */
export function natalProviderOptions(o: NatalSelectionOptions): { houseSystem: HouseSystem; nodeType: NodeType } {
  return { houseSystem: providerHouseSystemFor(o.houseSystem), nodeType: o.nodeType };
}

/** Seçimden klasik sistem (yoksa null). Seçenek yok/eksikse (eski results/[id] yolu) null → saklanan satır aynen. */
export function localNatalSystemOf(options: Record<string, unknown> | null | undefined): Exclude<NatalHouseSystem, HouseSystem> | null {
  const hs = options?.houseSystem;
  return isLocalNatalHouseSystem(hs) ? hs : null;
}

export class LocalNatalHousesError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LocalNatalHousesError";
  }
}

/**
 * Natal combineTechnical: sağlayıcı sistemlerinde satırın teknik katmanı AYNEN (aynı referans) döner. Klasik sistemde türetilir;
 * türetme başarısızsa LocalNatalHousesError fırlatılır (çağıranlar önce localNatalPrecheck ile açık hata sonucu üretir).
 */
export function combineNatalTechnical(parts: unknown[], options: Record<string, unknown>): unknown {
  const local = localNatalSystemOf(options);
  if (!local) return parts[0];
  const r = deriveLocalNatalHouses(parts[0] as NatalTechnical, local);
  if (!r.ok) throw new LocalNatalHousesError(r.code, r.error);
  return r.technical;
}

/** Görünüm kurulmadan önce: klasik sistem türetilemiyorsa (ör. açı bütünlük kapısı) seçim için açık hata. */
export function localNatalPrecheck(technique: string, technicals: unknown[], options: Record<string, unknown>): { code: string; error: string } | null {
  if (technique !== "western.natal") return null;
  const local = localNatalSystemOf(options);
  if (!local) return null;
  const r = deriveLocalNatalHouses(technicals[0] as NatalTechnical, local);
  if (r.ok) return null;
  return { code: r.code === "polar_latitude" ? "HOUSE_SYSTEM_POLAR" : "LOCAL_HOUSES_FAILED", error: r.error };
}

const isLocalTechnical = (t: unknown): t is LocalNatalTechnical =>
  !!t && typeof t === "object" && (t as { houseSource?: { kind?: unknown } }).houseSource?.kind === "local";

/** Saat bilinmiyor maskesinden sonra: klasik sistemin ev ayrıntıları (sınıra yakın noktaların ev numaraları, uyarılar) da gizlenir. */
export function maskLocalHouseDetail<T>(technical: T): T {
  if (!isLocalTechnical(technical)) return technical;
  return { ...technical, houseSource: { ...technical.houseSource, nearCusp: [], warnings: [] } };
}

/** Görünüm uyarıları (yalnız klasik sistem; mevcut 4 sistemin çıktısı değişmez). */
export function localNatalViewWarnings(technical: unknown, masked: boolean): string[] {
  if (!isLocalTechnical(technical) || masked) return [];
  const w: string[] = [];
  if (technical.houseSource.warnings.includes("high_latitude")) {
    const lat = technical.houseSource.frame.latitudeDeg;
    w.push(`Yüksek enlem (${Math.abs(lat).toFixed(1)}° > ${NATAL_HIGH_LATITUDE_WARN}°): bu enlemde evlerin genişlikleri çok eşitsiz olabilir; yorumlarken dikkate alın.`);
  }
  if (technical.houseSource.nearCusp.length > 0) w.push("Bazı noktalar ev sınırına çok yakın; doğum saatindeki küçük bir fark evlerini değiştirebilir.");
  return w;
}

// Aşama 3: not metni istemciyle ortak saf modelde (lib/astrology/model/natalHouseSystems.ts; aynı metin).
export { LOCAL_NATAL_INTERP_NOTE };

/** Klasik sistemde sağlayıcı yorumu: gezegen yorumları + ev atfı tespit edilen öğeler çıkarılır. Diğer durumda aynen. */
export function adjustNatalInterpretationForHouses(technical: unknown, content: unknown): { content: unknown; note: string | null } {
  if (!isLocalTechnical(technical) || !content || typeof content !== "object") return { content, note: null };
  return { content: sanitizeNatalInterpretationForLocalHouses(content as NatalInterpretation).content, note: LOCAL_NATAL_INTERP_NOTE };
}

/** Görünüm yöntem etiketi eki: klasik sistemde ev hesabının kaynağı (mevcut 4 sistemde alan EKLENMEZ). */
export function localNatalMethodExtra(technical: unknown): { houseCalculation: "local"; houseEngine: string } | Record<string, never> {
  return isLocalTechnical(technical) ? { houseCalculation: "local", houseEngine: `${technical.houseSource.layer}/${technical.houseSource.engine}` } : {};
}
