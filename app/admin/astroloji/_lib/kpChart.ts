// Astroloji — KP Güney Hindistan haritası VERİ yardımcıları (SAF; istemci + sunucu ortak).
//
// 2026-10-15: KpPanels.tsx ("use client") içinden taşındı → Word/PDF raporu (sunucu) ekrandaki KP haritasıyla BİREBİR
// aynı hücre yerleşimini ve aynı etiketleri kullanır. Davranış değişmedi.

import type { KpCusp, KpPoint } from "@/lib/astrology/model/kp";
import type { VedicGrahaId } from "@/lib/astrology/model/vedic";
import { SIGN_IDS, type SignId } from "@/lib/astrology/model/western";
import { SIGN_LABELS } from "@/lib/astrology/labels/tr";
import { GRAHA_TR, grahaTrName } from "./kundliLocalize";

/**
 * KP harita açıklamaları — ekran (KpSouthChart) ve Word/PDF (report/model) AYNI metni kullanır (KP-UX-06, 2026-10-18).
 * Cusp'lı haritalar (KP doğum haritası, horary): Placidus ev başlangıçları çerçeveli etiketle çizilir.
 * KP transit tek an: cusp ÇİZİLMEZ (gökyüzü anı; natal cusp'a göre ev analizi sağlayıcıda yok) → Placidus anlatımı uymaz.
 */
export const KP_LEGEND = "Burç kutuları sabit (Güney Hindistan). Çerçeveli etiket = Placidus ev başlangıcı (cusp); gri = graha. KP evleri burç kutusu değildir — bir burçta iki cusp olabilir, bir ev iki burca yayılabilir. ʳ vakri.";
export const KP_TRANSIT_LEGEND = "Burç kutuları sabit (Güney Hindistan). Gri etiket = graha (transit anındaki gökyüzü konumu). Bu haritada ev başlangıcı (cusp) çizilmez: KP transit tek an için gökyüzüdür. ʳ vakri.";
/** Haritada cusp var mı? → doğru açıklama (cusp yoksa Placidus/cusp anlatımı GÖSTERİLMEZ). */
export const kpLegendFor = (cuspCount: number) => (cuspCount > 0 ? KP_LEGEND : KP_TRANSIT_LEGEND);

/** Derece/dakika/saniye (KESİLİR, yuvarlanmaz: 29°59′59″ asla 30° olmaz). */
export function fmtDms(deg: number): string {
  const total = Math.floor(deg * 3600 + 1e-7);
  const d = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d}°${String(m).padStart(2, "0")}′${String(s).padStart(2, "0")}″`;
}
export const posLabel = (p: KpPoint) => `${SIGN_LABELS[p.rashi]} ${fmtDms(p.degreeInRashi)}`;
export const gs = (id: VedicGrahaId | null) => (id ? GRAHA_TR[id].tr : "—");

// ─── Güney Hindistan burç-sabit KP haritası ───────────────────────────────────
/** 4×4 ızgarada burç konumları (satır, sütun): Balık sol üst, saat yönünde. Ortadaki 2×2 başlık. */
export const SOUTH_CELLS: Record<SignId, [number, number]> = {
  pisces: [1, 1], aries: [1, 2], taurus: [1, 3], gemini: [1, 4],
  aquarius: [2, 1], cancer: [2, 4],
  capricorn: [3, 1], leo: [3, 4],
  sagittarius: [4, 1], scorpio: [4, 2], libra: [4, 3], virgo: [4, 4],
};
export type KpSel = { kind: "cusp"; house: number } | { kind: "body"; id: VedicGrahaId };
export type ChartItem = { key: string; lon: number; sel: KpSel; label: string; title: string; cusp: boolean; strong?: boolean };

export function kpChartItems(cusps: KpCusp[], bodies: (KpPoint & { id: VedicGrahaId; retrograde?: boolean | null; house?: number })[]): Record<SignId, ChartItem[]> {
  const out = Object.fromEntries(SIGN_IDS.map((s) => [s, [] as ChartItem[]])) as Record<SignId, ChartItem[]>;
  for (const c of cusps) {
    out[c.rashi].push({ key: `c${c.house}`, lon: c.longitude, sel: { kind: "cusp", house: c.house }, cusp: true, strong: c.house === 1, label: `${c.house}. ev ${Math.floor(c.degreeInRashi)}°${String(Math.floor((c.degreeInRashi % 1) * 60)).padStart(2, "0")}′`, title: `${c.house}. ev başlangıcı (Placidus cusp) · ${posLabel(c)} · sub lord ${gs(c.subLord)}` });
  }
  for (const b of bodies) {
    out[b.rashi].push({ key: b.id, lon: b.longitude, sel: { kind: "body", id: b.id }, cusp: false, label: `${GRAHA_TR[b.id].abbr} ${Math.floor(b.degreeInRashi)}°${String(Math.floor((b.degreeInRashi % 1) * 60)).padStart(2, "0")}′${b.retrograde ? "ʳ" : ""}`, title: `${grahaTrName(b.id)} · ${posLabel(b)}${b.house ? ` · ${b.house}. ev (Placidus)` : ""} · star ${gs(b.starLord)} · sub ${gs(b.subLord)}${b.retrograde ? " · vakri" : ""}` });
  }
  for (const s of SIGN_IDS) out[s].sort((a, b) => a.lon - b.lon || (a.cusp ? -1 : 1));
  return out;
}
