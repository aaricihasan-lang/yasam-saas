// Astroloji — NATAL "DOĞUM SAATİ BİLİNMİYOR" GÖRÜNÜM KURALLARI (G2, Owner kararı 2026-11-22; SAF, yalnız Batı Natal görünümü).
//
//   • Ay: konumu 12:00 varsayımıdır ve gün içinde ~12–15° değişir → kesin burç / derece / dakika gösterilmez; Ay'a bağlı açılar
//     kesin açı listesinde gösterilmez; dağılımda Ay'ın burcu kesin konum olarak sayılmaz.
//   • Diğer gezegenler ve açılar: değerler gösterilir ama "≈ 12:00 varsayımı" olarak işaretlenir.
//   • Ham teknik veri, kayıt, rapor (Word/PDF) ve paylaşılan dağılım modülü (natalDistribution) DEĞİŞMEZ; burada yalnız görünüm
//     için süzme / yerel sayım yapılır (yeni astronomik hesap YOK).

import type { AspectNature, BodyId, Element, Modality, NatalTechnical } from "../model/western";
import { ELEMENT_ORDER, MODALITY_ORDER, signElement, signModality } from "./natalDistribution";

const involvesMoon = (x: { a: BodyId; b: BodyId }) => x.a === "moon" || x.b === "moon";

/** Açı listesinde gösterilecek açılar: saat bilinmiyorsa Ay'a bağlı olanlar hariç (ham veri silinmez). */
export function listedNatalAspects<A extends { a: BodyId; b: BodyId }>(aspects: readonly A[], timeUnknown: boolean): A[] {
  return timeUnknown ? aspects.filter((a) => !involvesMoon(a)) : [...aspects];
}

/** Açı kalıbı Ay içeriyor mu (saat bilinmiyorken gösterilmez). */
export function patternInvolvesMoon(p: { bodies: readonly BodyId[]; apex?: BodyId | null }): boolean {
  return p.bodies.includes("moon") || p.apex === "moon";
}

/** Gösterilen (Ay'sız) açılardan açı dengesi — sağlayıcının kayıtlı özeti Ay açılarını içerdiği için saat bilinmiyorken kullanılmaz. */
export function aspectBalanceOf(aspects: readonly { nature: AspectNature | null }[]): Record<AspectNature, number> {
  const out: Record<AspectNature, number> = { harmonious: 0, challenging: 0, neutral: 0 };
  for (const a of aspects) out[a.nature ?? "neutral"] += 1;
  return out;
}

const PLANETS_NO_MOON: readonly BodyId[] = ["sun", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];

export type TimeUnknownDistribution =
  | { available: true; total: number; elements: Record<Element, number>; modalities: Record<Modality, number>; topElements: Element[]; topModalities: Modality[] }
  | { available: false };

function top<K extends string>(order: readonly K[], d: Record<K, number>): K[] {
  const max = Math.max(...order.map((k) => d[k] ?? 0));
  return max > 0 ? order.filter((k) => d[k] === max) : [];
}

/**
 * Saat bilinmiyorken element / nitelik dağılımı: Ay HARİÇ 9 gezegen (her biri 1; toplam 9). Gezegen burçları kayıtlı teknik
 * veriden okunur (12:00 varsayımı; ekranda "≈" ile belirtilir). Gezegenlerden biri yoksa üretilmez.
 */
export function timeUnknownDistribution(t: Pick<NatalTechnical, "bodies">): TimeUnknownDistribution {
  const bodies = PLANETS_NO_MOON.map((id) => t.bodies.find((b) => b.id === id));
  if (bodies.some((b) => !b)) return { available: false };
  const elements: Record<Element, number> = { fire: 0, earth: 0, air: 0, water: 0 };
  const modalities: Record<Modality, number> = { cardinal: 0, fixed: 0, mutable: 0 };
  for (const b of bodies) {
    elements[signElement(b!.sign)] += 1;
    modalities[signModality(b!.sign)] += 1;
  }
  return { available: true, total: bodies.length, elements, modalities, topElements: top(ELEMENT_ORDER, elements), topModalities: top(MODALITY_ORDER, modalities) };
}
